# RelayOps — release candidate preflight

Final local-demo and publication verification record, updated 2026-09-10 (Europe/Moscow). The static portfolio demo is published on GitHub Pages. S13/S14 production-release gates remain PARTIAL for the explicitly listed checks and external decisions; this is not production approval.

## Publication preparation — 2026-09-10

- Work now lives in a sequence of logical publication commits on `codex/relayops-publication-prep`, directly above unchanged baseline `8100f3b1`; no existing commit was rewritten. The branch is pushed to the public `main` branch of `godaylor/relayops`.
- Gitleaks 8.30.1 scanned the exact staged tree (13.03 MB) with zero leaks. Semgrep 1.175.1 scanned the preceding complete tree; all ERROR findings were fixed, with no broad secret allowlist. The publication delta contains source, UI, workflow, license, notice and documentation changes; local state and user data remain excluded.
- GitHub Actions now includes pinned Gitleaks, CodeQL security-extended and dependency review jobs. External Actions are pinned to immutable commit SHAs; legacy upstream publishing/notification and over-privileged automation were removed.
- GitHub is authenticated in the browser as `godaylor`; `gh` is unavailable. Public repository `godaylor/relayops` was created after explicit owner confirmation. `origin` remains the upstream Kaneo repository and must not be used for push.
- Gitleaks re-scanned the publication range `8100f3b1..HEAD` with zero leaks.
- Manual AT review is explicitly deferred by the owner for this portfolio/demo. It remains a production-quality follow-up, not a blocker for the requested demo publication.

## Local audit fixes — 2026-09-09 follow-up

Mobile shell and OpenAPI/Helm guidance fixes are verified; see FINAL_AUDIT.md for current evidence. The original tables below describe the previous run and images. New local images use :audit-fix; exact IDs, refreshed SBOM/licenses and Trivy 0.74.0 reports (0 reported vulnerabilities each) are in artifacts/audit-fix/images.json. Full browser regression: 12/12 including all six mobile screens in RU/EN. Main :local runtime on 32000 was not replaced; disposable verify stack stopped. Source candidate includes this follow-up and FINAL_AUDIT.md. The public repository push and static Pages demo are now complete. Manual AT is explicitly deferred; GitHub security runs and Pages deployment are recorded below.

## Scope and preserved state

- Work is restricted to `E:\Projects\PetProjects\01-relayops`. Root rename is repaired, including stale Windows dependency junctions. Historical audit references and internal `@kaneo/*`, `KANEO_*`, `charts/kaneo` compatibility identifiers are intentional.
- Branch `codex/relayops-publication-prep` contains the logical publication commits above original HEAD `8100f3b1ab47a0b49c7ac6deabe64eb0d1d9970d`. Pre-existing S0–S12 work is preserved. The branch is pushed to `publication/main`; no tag or PR was created.
- Origin is still `https://github.com/usekaneo/kaneo.git`, **not a RelayOps publication destination**. The authenticated GitHub owner is `godaylor`; `publication` points to `https://github.com/godaylor/relayops.git`. Repository variables `RELAYOPS_PUBLISH_ENABLED=true` and `RELAYOPS_RELEASE_APPROVED=true` are set, Pages source is GitHub Actions, and the free demo is live at `https://godaylor.github.io/relayops/`.
- Main website: `http://127.0.0.1:32000`, same-origin `/api`, no required Redis/SMTP/S3/billing. PostgreSQL and uploads are not host-published.
- Existing PostgreSQL 15 data remains on volume `68810d3d5bdc68cea5168c7bbf7d0ebe13d09dd36790e2f0983cd58dae9df1be`. Old container `relayops-codex-s3-postgres` stays stopped: never start a second PostgreSQL against the same volume. No database major upgrade or destructive conversion.
- Backups are private under `.local/backups/`. The latest pre-update backup `relayops-2026-09-08T23-10-04.356Z.sql` has SHA-256 `c4b7c57ab2f2a7c1fbeb5c3819c89344f1ffbe2959db42b7bec316586142740d` (38,249,007 bytes). Keep backups and encryption keys together in secure storage, not Git.
- Test database is exclusively `relayops_verify_test` on 32040 (disposable PostgreSQL 16/tmpfs). Integration tests require an explicit `DATABASE_URL`; they do not read the application `.env` or infer a database. The preserved main database's legacy `_test` suffix does **not** make it disposable.

## Port allocation

Windows IPv4/IPv6 excluded ranges and listeners were checked before startup. No requested port needed substitution. Every local published port binds to `127.0.0.1`.

At handoff only the main site is host-published on 32000; its PostgreSQL stays internal. The disposable test containers and our static preview process were stopped after verification, without deleting volumes or touching other projects. Ports below remain assigned/reserved for their documented modes.

| Port | Purpose |
|---|---|
| 32000 | Main bundled website and `/api` |
| 32001 | Optional split API; main bundled mode does not use it |
| 32002 | Optional proxy / Helm port-forward; not running |
| 32010, 32011 | Reserved optional Windows access to PostgreSQL/Redis; not published |
| 32020 | Optional portfolio-site development server |
| 32040, 32041 | Disposable test PostgreSQL and bundled app |
| 32042, 32043 | Disposable split web/API verification |
| 32044–32051 | Sequential API/WS/outbound-request test listeners |
| 32060 | Optional second API/web instance for Redis topology verification |
| 32070 | Static release-preview server |
| 32090–32099 | Main-site conflict fallback only; `local:prepare` records a replacement |

## Confirmed evidence so far

Logs are local under `.local/`; distributable inventories/reports under ignored `artifacts/`. Do not infer a pass from the existence of a report file.

| Gate | Evidence |
|---|---|
| S11 / S12 | Prior GREEN retained; full network/API-key/body/WS/MCP/secrets regression suites rerun below |
| Runtime versions | Project-local Node 24.19.0, pnpm 10.32.1; no global tool change |
| Full typecheck | 7/7 tasks, no cache; `.local/typecheck-final.log` |
| Full unit | 807 tests, 10/10 tasks; `.local/unit-tests-final.log` |
| Full PostgreSQL integration | 261 passed, 2 performance tests deliberately skipped in normal suite; `.local/integration-tests-final.log` |
| Performance | S4 100k fixture passed; S9 clean 100k incidents / 1M events fixture and functional analytics passed with unchanged <=300 ms budget; `.local/performance-s9-final.log`. SQL aggregate optimized without schema change or relaxed threshold |
| Native release build | 7/7 tasks; `.local/build-final.log`. Static license-output path corrected and regenerated |
| Docker builds | Advisory-patched bundled, API and web images built locally. Final bundled header correction built and running; `.local/build-bundled-headers-final.log` |
| Browser | Unified 11/11 pass: `.local/browser-final.log`. Includes clean RU onboarding, persistent EN/RU, roles/403, URL/history/saved view, conflict/reapply, realtime/reconnect, analytics, keyboard and automated a11y/responsive matrix. No product logic changed afterward |
| Deployment modes | Split web/API 3/3: `.local/browser-split.log`; two-instance Redis scenario passed: `.local/browser-redis-enabled.log`; primary-node operation during Redis outage passed: `.local/browser-redis-outage.log`; recovered cross-node ten-step scenario passed: `.local/browser-redis-recovered-final.log`, with no primary API restart |
| Final running artifact | `.local/browser/visual-result.json`: RU/EN desktop portfolio and internal links, mobile overflow, main-app locale persistence, root MIT byte match, health and no browser page errors. Runs against final bundled image after header correction; runtime UID/GID 1001 |
| Helm | Helm 3.19.0 lint and six template modes passed; local chart package contains MIT/notices. No Kubernetes cluster run |
| Formatting/i18n | Biome CI passed with existing warnings; changed scripts/test formatted. Locale key parity and all four shell LF checks refreshed and passed |
| Attribution | Original root MIT/Andrej Acevski retained; visible independent Kaneo derivation; original source-defined RelayOps icons; Geist 5.3.0 OFL texts; THIRD_PARTY_NOTICES and per-scope manifest SBOMs |
| Creem | Unresolved-license SDK 1.6.0 removed from manifests/lock/artifacts. Existing billing contract retained through narrow documented HTTP/HMAC adapter, unit-tested; no live billing request |
| Source inventory | Regenerated release-source manifest-closure SBOM/notices: 1468 packages, zero unresolved metadata entries; `artifacts/licenses/source/`. Private legacy Planka importer is separately licensed and outside this artifact scope. This is not a legal opinion or exact bundle-reachability claim |
| Security audit | Pinned dependency corrections verified by frozen install/full tests; production audit reports zero advisories in every severity (`artifacts/security/pnpm-audit-final.json`). Trivy 0.74.0 reports zero findings for all three scanned images; exact scan IDs below. Scout login limitation was resolved by using Trivy, not by claiming a Scout CVE pass |
| Local release checks | `pnpm release:check`, version 2.22.0 consistency check, immutable upstream MIT comparison and separate RelayOps MIT/NOTICE checks pass. Public push and Pages demo deployment are complete |

## Final image and verification scope

- Running `relayops:local`: `sha256:f67ee065d0d738c93c08636ca3c0e16b9e44e75d81f4c2706e027dffaa2ac022`.
- Built `relayops-api:local`: `sha256:090d7a83dd4fb80018b1dfa3b6f36438b2d52dea316d829cb2e5934872af269a`.
- Built `relayops-web:local`: `sha256:e14af4e9db3a87e363cfd9008133319f3f841c59cfa44e3dd52005814a9fdb4e`.
- Trivy zero-finding scan IDs: bundled `sha256:558725da437c3391e3b1b73e1459c2ceff7d04d4338bcc56e4987040ccd27f31`; API `sha256:fc96beaf05d02942abc0e3e4d9d734027dcba716602d2d87c0e8137cd0ca4755`; web `sha256:a1776ad20a55d6d617835710c3a7a0416676e0df1264e60ba1ad083ec37c137e`. Later immutable-base/health/header configuration rebuilds changed image IDs. These reports are evidence for the scanned images, not certification of final digests. Refresh image-level SBOM/scans on the actual chosen publication artifacts before release.
- First Redis-recovery E2E failed at keyboard selection with the menu still open. The test now navigates Home/ArrowDown and asserts focus before Enter and menu dismissal afterward; recovered two-node scenario passed without changing product behavior or loosening its budgets. Redis absence, outage and recovery are distinct recorded checks.
- Independent local source scans were added during publication preparation: Gitleaks 8.30.1 reported zero leaks in the exact staged tree and the publication range; Semgrep 1.175.1 ERROR findings were fixed. GitHub-hosted Security run `34477531894` completed successfully; manual assistive-technology review is deferred by owner.
- Source candidate: `node scripts/release/source-candidate.mjs` generates `artifacts/relayops-source-candidate.tar.gz` with a file-hash manifest from the current working tree. It excludes private local state, environment secrets, unused legacy marketing assets and the separate legacy Planka importer. It is not a commit, Git history export, or proof of a clean GitHub checkout. The archive is a review package; publication still needs the decisions below.

## External/manual production gates still open

- Legacy Planka CLI holder text remains `Copyright (c) 2026 Kaneo MCP contributors`. Its original directory-level MIT license is preserved without guessing or replacing the holder. A new directory NOTICE marks it as private upstream compatibility code; it is absent from Docker/static/Helm/source-candidate release artifacts and is not represented as RelayOps-authored work.

- Manual screen-reader/assistive-technology review required by S10/S14 is deferred by explicit owner approval for this demo; automated axe/keyboard/zoom is not a substitute and the production gate remains open.
- The public repository is `https://github.com/godaylor/relayops`; `publication/main` contains the current branch, while upstream `origin` remains untouched. Pages run `34475695046` completed successfully and published `https://godaylor.github.io/relayops/`.
- Choose hosting, database/storage/backup policy and public URL. Supply production secrets through the chosen secret manager, preserve encryption keyrings, set exact client/API/CORS/OAuth URLs, verify HTTPS/WSS, DNS and restore/upgrade on the target environment.
- GitHub CI and Security have run for the publication branch; the manual release workflow dry-run and public image/tag/chart publication remain separate production decisions. The static site deployment is complete.
- The RelayOps name is approved only for noncommercial portfolio/demo. Formal trademark/domain review remains required for commercial/full-production name/domain/package/image publication; no legal clearance is claimed.
- OAuth, SMTP, billing, third-party integrations and external callbacks have not been exercised with real accounts. They remain optional/off until selected and configured; do not enable them on the strength of mocked tests.
- Kubernetes runtime deployment is not verified; if Helm is selected, verify it on the actual cluster. Existing Helm installations must preserve prior resource/PVC names with explicit overrides when changing the chart name; never blindly replace PVC bindings.
