# Maintained dependency patches

## braces 3.0.3 — CVE-2026-93687

Reviewed 2026-10-18. The [upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
has no published fix. `braces` is used by development/release tools through
`micromatch`, not by the incident API runtime.

`patches/braces@3.0.3.patch` caps nesting at 64 levels in the parser and all three
recursive AST walkers. It rejects excessive brace/parenthesis nesting before
stack exhaustion, including AST input supplied directly to compile, expand, or
stringify. Ordinary glob expansion, ranges, escaping, and nested alternatives
retain their behavior. The original package license remains unchanged.

`pnpm security:audit` first tests the installed patch against balanced and
unbalanced 4,000-level patterns (below the character limit) and 12,000-level
direct ASTs, then audits the entire lockfile.
It reports this exact advisory as locally mitigated only for version 3.0.3;
other high/critical advisories and registry failures still fail CI. Raw registry
totals remain visible. There is no global ignored-advisory configuration.

Remove the patch and its audit exception together when upstream publishes a
fixed version. Run `node scripts/security/verify-braces-patch.mjs` and the full
build after changing the patch. Docker build stages copy the patch before the
frozen install, so local, CI, and deployment use the same package contents.

## Alpine OpenSSL package floors

Runtime images require `libcrypto3>=3.5.9-r0` and `libssl3>=3.5.9-r0`. Alpine's
stable repository replaces older package revisions, so exact package pins can
break a fresh build even when a cached build passes. The minimum retains the
security fixes while allowing newer stable revisions. Base image digests and
the resolved artifact SBOM still identify the built image.
