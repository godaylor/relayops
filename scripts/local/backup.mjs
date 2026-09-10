import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

process.chdir(resolve(import.meta.dirname, "../.."));
const result = spawnSync(
  "docker",
  [
    "compose",
    "-p",
    "relayops",
    "exec",
    "-T",
    "postgres",
    "sh",
    "-c",
    'exec pg_dumpall -U "$POSTGRES_USER"',
  ],
  { maxBuffer: 256 * 1024 * 1024 },
);
if (result.status !== 0)
  throw new Error(
    "RelayOps backup failed; application upgrade must not continue.",
  );
mkdirSync(".local/backups", { recursive: true });
const path =
  ".local/backups/relayops-" +
  new Date().toISOString().replaceAll(":", "-") +
  ".sql";
writeFileSync(path, result.stdout, { flag: "wx", mode: 0o600 });
console.log(
  path +
    "; bytes=" +
    result.stdout.length +
    "; sha256=" +
    createHash("sha256").update(result.stdout).digest("hex"),
);
