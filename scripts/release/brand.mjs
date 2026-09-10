import { realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const require = createRequire(
  realpathSync(resolve(root, "apps/site/node_modules/next/package.json")),
);
const sharp = require("sharp");
const mark =
  '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#17211f"/><path d="M26 68h19l12-27 17 49 12-22h16" fill="none" stroke="#b9efcf" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
for (const base of ["apps/web/public", "apps/site/public"]) {
  writeFileSync(resolve(root, base, "favicon.svg"), mark + "\n");
  for (const [name, size] of Object.entries({
    "apple-touch-icon.png": 180,
    "logo-512.png": 512,
    "favicon-96x96.png": 96,
    "web-app-manifest-192x192.png": 192,
    "web-app-manifest-512x512.png": 512,
  })) {
    await sharp(Buffer.from(mark))
      .resize(size, size)
      .png()
      .toFile(resolve(root, base, name));
  }
}
const png = await sharp(Buffer.from(mark)).resize(64, 64).png().toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = 64;
header[7] = 64;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
writeFileSync(
  resolve(root, "apps/web/public/favicon.ico"),
  Buffer.concat([header, png]),
);
console.log("RelayOps source-defined SVG/raster assets generated.");
