import { execFileSync } from "node:child_process";

export function assertDestination(env = process.env) {
  const repo = env.GITHUB_REPOSITORY?.trim();
  if (
    !repo ||
    !/^[\w.-]+\/[\w.-]+$/.test(repo) ||
    repo.toLowerCase().startsWith("usekaneo/")
  ) {
    throw new Error(
      "Choose your own RelayOps GitHub repository; upstream publication is forbidden.",
    );
  }
  const origin = execFileSync(
    "git",
    ["remote", "get-url", "--push", "origin"],
    { encoding: "utf8" },
  ).trim();
  const destination = origin
    .replace(/\.git$/, "")
    .match(/github\.com[:/]([^/]+\/[^/]+)$/)?.[1];
  if (destination?.toLowerCase() !== repo.toLowerCase())
    throw new Error(
      "origin does not match the explicitly selected RelayOps repository.",
    );
  if (env.RELAYOPS_RELEASE_APPROVED !== "true")
    throw new Error("S13/S14 release approval is not recorded.");
  return repo;
}
