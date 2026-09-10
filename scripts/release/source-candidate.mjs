import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "../..");
process.chdir(root);
mkdirSync(".local", { recursive: true });
mkdirSync("artifacts", { recursive: true });
const target = mkdtempSync(join(root, ".local/source-candidate-"));
const listed = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const excluded =
  /^(?:\.git(?:\/|$)|\.agents\/|\.codex\/|\.local\/|\.codex-temp\/|artifacts\/|apps\/site\/legacy-assets\/|packages\/planka-import\/)|(?:^|\/)(?:node_modules|dist|out|\.next|\.cache)\//;
const files = [...new Set(listed)]
  .filter((name) => !excluded.test(name) && existsSync(name))
  .sort();
const manifest = [];
for (const name of files) {
  if (
    /(^|\/)\.env($|\.)/.test(name) &&
    ![".env.sample", "apps/web/.env.development"].includes(name)
  )
    continue;
  assert.ok(
    !name.includes("..") && !name.includes("\\"),
    "Unexpected Git path",
  );
  const source = join(root, name);
  assert.ok(
    lstatSync(source).isFile(),
    "Only regular source files are distributable: " + name,
  );
  const destination = resolve(target, name);
  assert.ok(destination.startsWith(target + sep));
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  manifest.push({
    path: name,
    sha256: createHash("sha256").update(readFileSync(source)).digest("hex"),
  });
}
// Source-tree inventory is a manifest closure, not a claim about bundle reachability.
for (const name of ["sbom.cdx.json", "review.json"]) {
  const source = join(root, "artifacts/licenses/source", name);
  if (existsSync(source)) {
    mkdirSync(join(target, "licenses/source"), { recursive: true });
    copyFileSync(source, join(target, "licenses/source", name));
  }
}
writeFileSync(
  join(target, "SOURCE-MANIFEST.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      baseCommit: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      note: "Current dirty working-tree snapshot; not git archive HEAD. Private data, tool state and unused legacy marketing assets excluded.",
      files: manifest,
    },
    null,
    2,
  ) + "\n",
);
const archive = join(root, "artifacts/relayops-source-candidate.tar.gz");
execFileSync("tar", ["-czf", archive, "-C", target, "."]);
console.log(
  JSON.stringify({
    sourceDirectory: relative(root, target),
    archive: relative(root, archive),
    files: manifest.length,
    sha256: createHash("sha256").update(readFileSync(archive)).digest("hex"),
  }),
);
