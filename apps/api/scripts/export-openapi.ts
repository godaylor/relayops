import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApp } from "../src/index";

const { app } = createApp();
const response = await app.request("/api/openapi");

if (!response.ok) {
  throw new Error(`OpenAPI export failed with status ${response.status}`);
}

const spec = await response.json();
// Keep the snapshot portable regardless of the local deployment environment.
spec.servers = [
  { url: "/api", description: "RelayOps API server (same origin)" },
];
const outputPath = resolve(import.meta.dirname, "../../docs/openapi.json");
await writeFile(outputPath, `${JSON.stringify(spec, null, 2)}\n`);
