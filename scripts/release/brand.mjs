import { realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const require = createRequire(
  realpathSync(resolve(root, "apps/site/node_modules/next/package.json")),
);
const sharp = require("sharp");
// The UI and favicons are resized from the actual approved sculpture.
const source = resolve(root, "docs/redesign-v2/brand-mark.png");
const publicDir = resolve(root, "apps/web/public");
for (const size of [128, 256, 512]) {
  await sharp(source)
    .resize(size, size)
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(resolve(publicDir, "brand", "sboritm-mark-" + size + ".webp"));
}
for (const [name, size] of Object.entries({
  "apple-touch-icon.png": 180,
  "logo-512.png": 512,
  "favicon-96x96.png": 96,
  "web-app-manifest-192x192.png": 192,
  "web-app-manifest-512x512.png": 512,
})) {
  await sharp(source).resize(size, size).png().toFile(resolve(publicDir, name));
}
const png = await sharp(source).resize(64, 64).png().toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = 64;
header[7] = 64;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
writeFileSync(resolve(publicDir, "favicon.ico"), Buffer.concat([header, png]));
const svgPng = await sharp(source).resize(128, 128).png().toBuffer();
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><image width="128" height="128" href="data:image/png;base64,' +
  svgPng.toString("base64") +
  '"/></svg>\n';
for (const target of ["favicon.svg", "brand/sboritm-mark.svg"]) {
  writeFileSync(resolve(publicDir, target), svg);
}
console.log("Sboritm artwork, transparent marks and favicons generated.");
