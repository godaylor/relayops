import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function verifyBracesPatch() {
  const releaseRequire = createRequire(
    realpathSync(resolve("node_modules/semantic-release/package.json")),
  );
  const matchRequire = createRequire(releaseRequire.resolve("micromatch"));
  const bracesRequire = createRequire(matchRequire.resolve("braces"));
  const braces = matchRequire("braces");
  assert.equal(bracesRequire("./package.json").version, "3.0.3");

  const rejected = (action) =>
    assert.throws(action, {
      name: "SyntaxError",
      message: "Brace pattern exceeds maximum nesting depth (64)",
    });
  const nested = `${"{".repeat(4_000)}a,b${"}".repeat(4_000)}`;
  for (const method of ["parse", "compile", "expand", "stringify"]) {
    rejected(() => braces[method](nested));
    rejected(() => braces[method](`${"(".repeat(4_000)}a`));
    rejected(() => braces[method](`${"{".repeat(4_000)}a`));
  }
  rejected(() => braces(nested));
  rejected(() => braces(nested, { expand: true }));

  // Public APIs also accept ASTs that bypass the parser. Exercise each walker
  // directly so the mitigation cannot silently regress to a parser-only guard.
  for (const method of ["compile", "expand", "stringify"]) {
    let ast = { type: "text", value: "a", nodes: [] };
    for (let index = 0; index < 12_000; index++) {
      ast = { type: "root", nodes: [ast] };
    }
    rejected(() => braces[method](ast));
    rejected(() => bracesRequire(`./lib/${method}`)(ast));
  }

  assert.deepEqual(braces.expand("src/{api,web}/file{1..3}.ts"), [
    "src/api/file1.ts",
    "src/api/file2.ts",
    "src/api/file3.ts",
    "src/web/file1.ts",
    "src/web/file2.ts",
    "src/web/file3.ts",
  ]);
  assert.equal(braces.compile("src/{api,web}/*.ts"), "src/(api|web)/*.ts");
  assert.equal(
    braces.stringify(braces.parse("a/{b,{c,d}}/e")),
    "a/{b,{c,d}}/e",
  );
  assert.equal(braces.compile("\\{".repeat(100)), "{".repeat(100));
  console.log("braces@3.0.3 local depth patch: regression checks passed");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  verifyBracesPatch();
}
