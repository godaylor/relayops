import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { verifyBracesPatch } from "./verify-braces-patch.mjs";

// No registry exception is accepted until the installed patch passes its probes.
verifyBracesPatch();
assert.ok(process.env.npm_execpath, "Run through pnpm security:audit");
const audit = spawnSync(
  process.execPath,
  [process.env.npm_execpath, "audit", "--json"],
  {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
  },
);
assert.ifError(audit.error);
assert.ok(audit.status === 0 || audit.status === 1, audit.stderr);
const report = JSON.parse(audit.stdout);
assert.ok(
  report.advisories && report.metadata && !report.error,
  "Audit registry failed",
);
let blocked = 0;
for (const advisory of Object.values(report.advisories)) {
  const locallyPatched =
    advisory.url === "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm" &&
    advisory.module_name === "braces" &&
    advisory.findings.length > 0 &&
    advisory.findings.every((finding) => finding.version === "3.0.3");
  if (locallyPatched) {
    console.log(`LOCAL PATCH VERIFIED: ${advisory.url} (braces@3.0.3)`);
    continue;
  }
  console.log(
    `${advisory.severity}: ${advisory.module_name} — ${advisory.url}`,
  );
  if (["high", "critical"].includes(advisory.severity)) blocked++;
}
console.log(
  `Registry totals (before local patch verification): ${JSON.stringify(report.metadata.vulnerabilities)}`,
);
assert.equal(
  blocked,
  0,
  `${blocked} unmitigated high/critical dependency advisories`,
);
