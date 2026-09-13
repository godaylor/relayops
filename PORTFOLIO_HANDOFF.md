# RelayOps — portfolio handoff

Updated 2026-09-11. **Working application verified locally; public runtime deployment is pending.** Do not present the Pages site as a live application.

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
- Live application: **not deployed**.
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

Render account inspection confirmed Hobby, no card, and $0 accrued. Supabase's
free-project quota is full; no existing project was changed. The chosen isolated
database option is Neon Free, but its GitHub sign-in timed out in the browser.
No cloud RelayOps resources were created and no paid resource was authorized.
The remaining action is account access, database provisioning, Render deployment,
then anonymous/new-user acceptance on the assigned public URL. See
[FREE_TIER_DEPLOY.md](docs/FREE_TIER_DEPLOY.md).

Full workspace typecheck (7 tasks), unit tests (808 tests across 10 tasks), production builds (7 tasks), PostgreSQL integration (261 passed, 2 optional performance tests skipped), and 13 real-browser scenarios passed during this implementation. Biome has no errors and retains existing warnings/information. Locale key parity passes. The new browser test loses an already-committed create response and verifies retry uses the same idempotency key and yields one incident.

Published implementation: `a4db45b9014463bcac7f8ad734357dfb67a641a6`. GitHub [CI](https://github.com/godaylor/relayops/actions/runs/34542873720), [Security including Dependency audit](https://github.com/godaylor/relayops/actions/runs/34542873775), and [Pages](https://github.com/godaylor/relayops/actions/runs/34542873772) all completed successfully. The local application on port 32000 now uses the verified image. The temporary verification app/database containers were stopped without deleting volumes or touching other projects.

The updated full dependency audit has **zero high/critical**, with two moderate development-tool advisories still open. Source license inventory covers 1468 packages without unresolved metadata. Production Compose validates; the bundled Docker image builds. This does not substitute for a test on the actual public host.

**Actually running in public production:** the static Pages information site only. No public auth, database, incident creation, storage or realtime endpoint is claimed. To finish, provision an isolated free PostgreSQL database and the prepared Render Free service, configure backups, and verify the full journey over HTTPS/WSS. Manual screen-reader review remains a follow-up. Optional real mail/OAuth/integrations have not been verified.

## Readiness assessment

Percentages are engineering estimates, not test coverage. Overall is the unweighted average.

| Category | Readiness | Finished / verified | Remaining |
|---|---:|---|---|
| Concept and purpose | 95% | Clear incident-operations domain and end-to-end workflow | Feedback from real users |
| UX/UI | 85% | Real incident form, simpler onboarding, RU/EN and responsive/keyboard browser checks | Manual assistive-technology review, further copy refinement |
| Core functionality | 90% | Service → incident → response/timeline → analytics; signals, roles and persistence checked | Longer real-use validation and optional integration checks |
| Testing/security/quality | 85% | Typecheck, unit/integration/browser tests, build, lint and high/critical dependency fixes; GitHub CI/Security green | Two moderate tool advisories and deployment security checks |
| Backend/database/auth | 90% | PostgreSQL, Better Auth, API authority, transactional history/outbox and uploads | Production backup/restore and operational configuration |
| Public production deploy | 10% | Deployable image and validated HTTPS/persistent Compose | Provision host and verify the actual public runtime |
| GitHub/docs/licensing | 85% | Personal origin/main corrected, About/topics, README, notices, inventory and hosted verification | Production URL and deployment-specific notices |
| Personal Portfolio №09 handoff | 70% | This handoff, actual stack/contribution and screenshots | Working public URL and production evidence |

**Overall: 76.25%.** The missing public runtime is a blocking gap regardless of the average.
