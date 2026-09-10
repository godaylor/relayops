import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const trackedShellFiles = execFileSync(
  "git",
  ["ls-files", "-z", "--", "*.sh"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);

const filesWithCarriageReturns = trackedShellFiles.filter((file) =>
  readFileSync(file).includes(13),
);

if (filesWithCarriageReturns.length > 0) {
  console.error(
    ["Tracked shell files must use LF:", ...filesWithCarriageReturns].join(
      "\n",
    ),
  );
  process.exit(1);
}

console.log(
  "Verified LF line endings in " + trackedShellFiles.length + " shell files.",
);
