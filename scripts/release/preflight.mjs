import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

process.chdir(resolve(import.meta.dirname, "../.."));
const read = (name) => readFileSync(name, "utf8");
const pkg = JSON.parse(read("package.json"));
assert.equal(pkg.name, "relayops");
assert.equal(pkg.packageManager, "pnpm@10.32.1");
assert.ok(
  Number(process.versions.node.split(".")[0]) >= 24,
  "Node 24+ required",
);
assert.equal(
  read("LICENSE").replaceAll("\r\n", "\n"),
  execFileSync("git", ["show", "HEAD:LICENSE"], {
    encoding: "utf8",
  }).replaceAll("\r\n", "\n"),
  "Original MIT license must be preserved",
);
assert.ok(read("LICENSE").includes("Andrej Acevski"));
assert.ok(
  read("THIRD_PARTY_NOTICES").includes(
    "not an official or endorsed Kaneo product",
  ),
);
assert.ok(!JSON.parse(read("apps/api/package.json")).dependencies.creem);
assert.ok(!/^ {2}creem@/m.test(read("pnpm-lock.yaml")));
for (const file of [
  "apps/api/node_modules/hono",
  "apps/web/node_modules/react",
]) {
  assert.ok(
    !realpathSync(file).includes("01-kaneo-transform"),
    "Stale workspace junction: " + file,
  );
}
for (const file of [
  "Dockerfile.kaneo",
  "apps/api/Dockerfile",
  "apps/web/Dockerfile",
]) {
  assert.ok(
    read(file).includes("THIRD_PARTY_NOTICES") &&
      read(file).includes("/licenses"),
    file + " must carry notices",
  );
}
for (const file of ["compose.yml", "compose.local.yml", "compose.verify.yml"]) {
  const published = read(file)
    .split("\n")
    .filter((line) => /^\s*-\s*".*:\d+"\s*$/.test(line));
  assert.ok(published.length > 0);
  assert.ok(
    published.every(
      (line) => line.includes("127.0.0.1:") && /320\d\d/.test(line),
    ),
    file + " loopback/port budget",
  );
}
for (const file of [
  "release.yml",
  "build-images.yml",
  "deploy-site.yml",
  "docker.yml",
  "helm-chart.yml",
]) {
  assert.ok(
    read(".github/workflows/" + file).includes(
      "github.repository != 'usekaneo/kaneo'",
    ) &&
      read(".github/workflows/" + file).includes("RELAYOPS_RELEASE_APPROVED"),
  );
}
for (const name of ["mcp", "planka-import"]) {
  // The legacy importer is retained locally but excluded from the release source archive.
  if (name === "planka-import" && !existsSync(`packages/${name}/package.json`))
    continue;
  assert.equal(JSON.parse(read(`packages/${name}/package.json`)).private, true);
}
for (const name of ["LICENSE", "THIRD_PARTY_NOTICES"])
  assert.ok(existsSync("charts/kaneo/" + name));
const openapi = JSON.parse(read("apps/docs/openapi.json"));
assert.equal(openapi.info.title, "RelayOps API");
assert.ok(openapi.info.description.includes("append-only timelines"));
assert.ok(openapi.info.description.includes("Kaneo"));
assert.deepEqual(
  openapi.servers.map((server) => server.url),
  ["/api"],
);
const chartReadme = read("charts/kaneo/README.md");
assert.ok(chartReadme.startsWith("# RelayOps Helm Chart"));
assert.ok(!chartReadme.includes("ghcr.io/usekaneo/"));
assert.ok(chartReadme.includes("RELAYOPS_IMAGE_REPOSITORY"));
assert.ok(chartReadme.includes("Compatibility and existing installations"));
const report = JSON.parse(read("artifacts/licenses/source/review.json"));
assert.equal(
  report.unresolvedMetadata.length,
  0,
  "Unresolved source dependency license metadata",
);
console.log("Local source preflight: PASS. This is not release approval.");
console.log(
  "Publication remains disabled until own repository, hosting/domain, manual accessibility/brand review and final deployment approval are supplied.",
);
