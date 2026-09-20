# RelayOps — portfolio handoff

Updated 2026-09-20. **Public runtime live on Render Free + Neon Free; core incident workflow verified over HTTPS.**

## Product

**RelayOps** coordinates incident response from the first signal to recovery: affected services, responders, decisions and a durable timeline in one workspace.

It helps an engineering team understand what is affected, record actions, coordinate response and review recovery metrics.

## Contribution and provenance

RelayOps-specific work adds the Service/Signal/Incident domain, append-only timeline and transactional outbox, versioned incident commands, capability policies, server-filtered virtualized workbench and saved views, accessible state-machine board, realtime recovery/presence, signal intake and analytics. This pass adds ordinary incident creation throughout the app, reliable retry after a lost response, simpler onboarding, patched dependencies, graph-independent dependency CI, and a persistent HTTPS deployment stack.

This is an independent **derivative of Kaneo**, not a claim that the entire runtime was written from scratch. Kaneo authentication/workspace infrastructure, legacy code, integrations and parts of the UI remain. Original MIT copyright and notices are retained. RelayOps additions use LICENSE-RELAYOPS. Fonts are Geist/Geist Mono under OFL; the RelayOps mark is source-defined. See NOTICE, THIRD_PARTY_NOTICES and generated per-artifact inventories. Manifest license metadata has no unresolved entries; this is not legal clearance for every possible redistribution.

## Actual stack

- React, TypeScript, Vite, Tailwind CSS, Base UI/coss, retained Radix primitives, TanStack Router and Query, dnd-kit, Framer Motion, Tiptap, i18next.
- Node.js 24, Hono, Zod/OpenAPI, typed Hono client, Better Auth, Drizzle ORM, PostgreSQL, WebSockets and transactional outbox.
- Optional Redis fan-out, SMTP/React Email/Nodemailer, S3 and external integrations; none is needed for the basic single-instance flow.
- Next.js for the separate static information site; pnpm 10.32.1 and Turborepo.
- Vitest, Playwright/Chrome, axe, Biome, Gitleaks, CodeQL, pnpm audit; Docker, Nginx, Compose, Caddy; existing Coolify and Helm alternatives.

## Main capabilities

1. Service catalog with ownership, runbooks and reversible archiving.
2. Ordinary incident creation with severity/summary and idempotent network retries.
3. Server-filtered, virtualized Incident Workbench with shareable URLs and saved views.
4. Response Board with authorized, conflict-aware lifecycle transitions and keyboard alternatives.
5. Incident Room with durable updates, responders, concurrent-edit recovery and realtime.
6. Manual and signed webhook signals associated with services/incidents.
7. MTTA/MTTR, sample counts, service/severity analytics and drill-downs.
8. Workspace isolation and roles, RU/EN, responsive layouts and optional marked demo fixtures.

## Architecture

Browser → typed Hono API → workspace authorization → PostgreSQL transaction. Incident changes, timeline entries and outbox rows commit together. The outbox publishes realtime invalidations; reconnect refetches authoritative records. One app container bundles the SPA/Nginx/API, one PostgreSQL stores durable records, and Caddy terminates public HTTPS. Uploads use a persistent volume. Redis is optional.

## Links and images

- GitHub: https://github.com/godaylor/relayops
- Live application: https://relayops-godaylor.onrender.com
- Public information page only: https://godaylor.github.io/relayops/
- Deployment: [PRODUCTION_DEPLOY.md](docs/PRODUCTION_DEPLOY.md).
- Screenshots: `docs/screenshots/create-incident.png`, `docs/screenshots/incident-room.png`. These show local verification data, not production traffic.

## Verification and production truth

Free-hosting continuation (2026-09-13): added `render.yaml` with an explicit Free
single-instance plan and `RELAYOPS_RESOURCE_PROFILE=free`, plus persistent generated
secrets and Render origin discovery. API unit tests (460), all workspace tests,
workspace typecheck/build (7 tasks each), Biome (no errors), Docker build, and all
13 browser scenarios passed. Browser verification used a 512 MiB container with
about 264 MiB observed memory, including two-session realtime and signal intake.
The test containers were stopped by verified IDs. No other project was stopped.

Render Free and Neon Free are provisioned. All 51 migrations completed. Public creation, timeline, board/actions, completion, reload persistence and analytics passed. See [public verification](docs/PUBLIC_RELEASE_VERIFICATION.md). No paid resources were created.

Full workspace typecheck (7 tasks), unit tests (808 tests across 10 tasks), production builds (7 tasks), PostgreSQL integration (261 passed, 2 optional performance tests skipped), and 13 real-browser scenarios passed during this implementation. Biome has no errors and retains existing warnings/information. Locale key parity passes. The new browser test loses an already-committed create response and verifies retry uses the same idempotency key and yields one incident.

Published implementation: `a4db45b9014463bcac7f8ad734357dfb67a641a6`. GitHub [CI](https://github.com/godaylor/relayops/actions/runs/34542873720), [Security including Dependency audit](https://github.com/godaylor/relayops/actions/runs/34542873775), and [Pages](https://github.com/godaylor/relayops/actions/runs/34542873772) all completed successfully. The local application on port 32000 now uses the verified image. The temporary verification app/database containers were stopped without deleting volumes or touching other projects.

The updated full dependency audit has **zero high/critical**, with two moderate development-tool advisories still open. Source license inventory covers 1468 packages without unresolved metadata. Production Compose validates; the bundled Docker image builds. This does not substitute for a test on the actual public host.

**Actually running in public production:** RelayOps API/web on Render Free and PostgreSQL on Neon Free. Free services sleep and have shared quotas. Manual screen-reader review and optional integrations remain follow-ups.
