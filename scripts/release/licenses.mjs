import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const scope = process.argv[2] ?? "source";
// Explicit relative destinations belong to the caller (including package builds).
const out = resolve(
  process.argv[3] ?? join(root, `artifacts/licenses/${scope}`),
);
mkdirSync(out, { recursive: true });
for (const name of ["LICENSE", "THIRD_PARTY_NOTICES"])
  copyFileSync(join(root, name), join(out, name));
const starts =
  scope === "api"
    ? ["apps/api", "packages/email", "packages/permissions"]
    : scope === "web"
      ? ["apps/web", "packages/libs", "packages/permissions"]
      : scope === "site"
        ? ["apps/site"]
        : [
            ".",
            "apps/api",
            "apps/web",
            "apps/site",
            "packages/email",
            "packages/libs",
            "packages/permissions",
            "packages/mcp",
            "packages/planka-import",
          ];
const seen = new Set();
const components = new Map();
const dependencies = new Map();
const missing = [];
function findPackage(from, name) {
  let dir = from;
  while (true) {
    const file = join(dir, "node_modules", name, "package.json");
    if (existsSync(file)) return realpathSync(file);
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function visit(manifestPath, includeDev = false) {
  const manifest = realpathSync(manifestPath);
  const pkg = JSON.parse(readFileSync(manifest, "utf8"));
  const ref = `pkg:npm/${pkg.name.replace("@", "%40")}@${pkg.version ?? "workspace"}`;
  if (seen.has(manifest)) return ref;
  seen.add(manifest);
  if (pkg.name === "creem")
    throw new Error("creem SDK must not be distributed");
  const packageDir = dirname(manifest);
  const textFiles = readdirSync(packageDir).filter(
    (name) =>
      /^(licen[sc]e|notice|copying)(\.|$)/i.test(name) &&
      statSync(join(packageDir, name)).isFile(),
  );
  const folder =
    pkg.name.replaceAll("/", "__") + "@" + (pkg.version ?? "workspace");
  mkdirSync(join(out, folder), { recursive: true });
  for (const name of textFiles)
    copyFileSync(join(packageDir, name), join(out, folder, name));
  let license =
    typeof pkg.license === "string" ? pkg.license : pkg.license?.type;
  const exactTextLicenses = {
    "qrcode-terminal@0.12.0": {
      file: "LICENSE",
      hash: "b3c7a2fadb2515b8106eae58439a4b9c0581a4eaa88d6a265701f8d4dd7dadb8",
      expression: "Apache-2.0 AND MIT",
    },
    "khroma@2.1.0": {
      file: "license",
      hash: "66b333b0f66759a0b710459e03f7029abe17f4358114a128d2c972e642961b49",
      expression: "MIT",
    },
  };
  const exact = exactTextLicenses[`${pkg.name}@${pkg.version}`];
  if (!license && exact) {
    const hash = createHash("sha256")
      .update(readFileSync(join(packageDir, exact.file)))
      .digest("hex");
    if (hash !== exact.hash) throw new Error(`License changed for ${pkg.name}`);
    license = exact.expression;
  }
  if (pkg.name.startsWith("@fontsource-variable/geist")) {
    mkdirSync(join(out, "fonts"), { recursive: true });
    copyFileSync(
      join(packageDir, "LICENSE"),
      join(out, "fonts", `${pkg.name.split("/")[1]}-OFL.txt`),
    );
  }
  if (pkg.name.startsWith("@kaneo/") || pkg.name === "relayops")
    license = "MIT";
  const component = {
    type: "library",
    name: pkg.name,
    version: pkg.version ?? "workspace",
    "bom-ref": ref,
    purl: ref,
    hashes: [
      {
        alg: "SHA-256",
        content: createHash("sha256")
          .update(readFileSync(manifest))
          .digest("hex"),
      },
    ],
    properties: [
      {
        name: "relayops:inventory",
        value:
          "installed manifest dependency closure; not a bundler reachability claim",
      },
    ],
  };
  if (license) component.licenses = [{ expression: license }];
  else
    missing.push({
      name: pkg.name,
      version: pkg.version,
      licenseFiles: textFiles,
    });
  components.set(ref, component);
  const deps = {
    ...pkg.dependencies,
    ...(includeDev ? pkg.devDependencies : {}),
  };
  const refs = [];
  for (const name of Object.keys(deps).sort()) {
    const file = findPackage(packageDir, name);
    if (!file) {
      missing.push({ name, requiredBy: pkg.name, reason: "not installed" });
      continue;
    }
    refs.push(visit(file));
  }
  for (const name of Object.keys(pkg.optionalDependencies ?? {}).sort()) {
    const file = findPackage(packageDir, name);
    if (file) refs.push(visit(file));
  }
  dependencies.set(ref, { ref, dependsOn: [...new Set(refs)].sort() });
  return ref;
}
for (const start of starts) {
  const path = join(root, start, "package.json");
  if (existsSync(path)) visit(path, scope === "source");
}
const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: {
      type: "application",
      name: `relayops-${scope}`,
      version: JSON.parse(readFileSync(join(root, "package.json"))).version,
    },
  },
  components: [...components.values()].sort((a, b) =>
    a["bom-ref"].localeCompare(b["bom-ref"]),
  ),
  dependencies: [...dependencies.values()].sort((a, b) =>
    a.ref.localeCompare(b.ref),
  ),
};
writeFileSync(join(out, "sbom.cdx.json"), JSON.stringify(bom, null, 2) + "\n");
writeFileSync(
  join(out, "review.json"),
  JSON.stringify(
    { scope, packages: components.size, unresolvedMetadata: missing },
    null,
    2,
  ) + "\n",
);
console.log(
  `${scope}: ${components.size} packages, ${missing.length} metadata items require review; ${out}`,
);
