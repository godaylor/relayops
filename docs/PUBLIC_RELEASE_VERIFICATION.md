# Public runtime verification — 2026-09-18

## Deployed runtime

- Application: https://relayops-godaylor.onrender.com
- Repository: https://github.com/godaylor/relayops
- Deployed source: `4f28dbebfb3ed0a2ae8f8310bd54781419d446f4`.
- Render: `relayops-godaylor`, service `srv-damos14ri2ms73b91ij0`, Docker **Free**,
  Frankfurt. Successful deployment: `dep-damparsri2ms73bapgig`.
- Neon: project `relayops` (`spring-dust-10604127`), branch `main`
  (`br-plain-leaf-b2khwin6`), database `relayops`, PostgreSQL 18, Frankfurt,
  **Free**. No other project's resources were modified.
- Existing startup migration path completed all 51 Drizzle migrations. The
  incident, timeline and transactional outbox tables exist in the hosted database.
- Public HTTPS `GET /api/health`: **200**, `{"status":"ok"}`. Response includes
  `X-Frame-Options: SAMEORIGIN` and `X-Content-Type-Options: nosniff`.
- Anonymous browser reaches the real application registration screen.

## Hosted checks

- [CI](https://github.com/godaylor/relayops/actions/runs/35387645228): success,
  including Docker build, integration, unit, typecheck, build, lint and i18n.
- [Security](https://github.com/godaylor/relayops/actions/runs/35387645301): success.

## Public acceptance

Completed through the public HTTPS UI on 2026-09-20 with the owner account registered by the user.

- Created synthetic service `Release verification` and incident `INC-1` (SEV4), ID `ny3eebt3uu03btzpdwujlxmy`.
- Published a timeline update and moved the card into triage using the board menu.
- Used incident actions for mitigation, monitoring, and resolution with a written summary.
- Reloaded: resolved state, summary, timestamps and all six ordered timeline versions persisted.
- Analytics: 1 incident, MTTA p50 9m, MTTR p50/p90 11m, mitigation p50/p90 10m, 0 reopened and 0 active. Service ranking and daily volume show the same incident.
- Realtime reconnected and displayed online. Hosted two-user realtime was not independently tested; local two-session tests passed previously.

The synthetic service and resolved incident remain labeled for inspection. Optional integrations and manual screen-reader review remain follow-ups. No direct production database mutation was used for this acceptance scenario.

## Cost and operational limits

Render and Neon both use their Free plans; no paid resources were created.
Render Free sleeps while idle and can have a cold start of roughly one minute.
Its quota is shared with other services in the owner's workspace. Do not add
keepalive pings or change other services to reclaim quota. Free hosting provides
no availability SLA. See [FREE_TIER_DEPLOY.md](FREE_TIER_DEPLOY.md).

Production credentials are environment secrets in the RelayOps Render service.
No secret value is included in source or this report. The temporary ignored local
connection handoff file was removed after the explicitly authorized transfer.

## V3 newcomer and collaboration pass — 2026-09-28

This pass keeps the existing API, PostgreSQL schema, authorization and Free Render/Neon target. It adds RU/EN explanations and a non-mutating payment-failure example before login, visible account/workspace/role context, links to existing invitations, explicit sign-out, a restartable six-step guide, and assignment of an existing member as response coordinator. The guide is in document flow, supports Escape and focus return, and handles unavailable targets without changing data. Plain progress/status/analytics copy replaces implementation-oriented explanations.

Local verification uses only the isolated `relayops-v3-20260928` Compose project and temporary PostgreSQL storage, using the repository's existing verification ports 32040/32041 after checking availability. No production database is used for tests. No neighboring resources were changed.

- Chrome: newcomer registration → own workspace → service → incident → coordinator → progress update with network loss/recovery → resolved summary → refresh → analytics → sign-out passed.
- Separate sessions: invited viewer can read its workspace but cannot mutate; an independently registered outsider and anonymous guest cannot read another workspace; the new account and guest do not become instance admins; sign-out yields 401 and protected navigation returns to login.
- The existing browser suites also cover keyboard board transitions, two-user realtime/conflicts, lost-response retry without duplicate incident creation, RU/EN persistence, empty states and reduced motion.
- Long unbroken incident titles now wrap rather than expanding the Overview. Entry and four main routes passed shell-overflow checks at 320, 360, 390, 430, 639, 640, 767, 768, 1023, 1024, 1280, 1440, 1920, 2560, 3840, 5120 and 7680 CSS pixels. Large widths are emulation, not physical-device tests.
- A rapid next action during an offline update exposed a version conflict. Status actions now wait for the pending update, and publishing waits for a pending transition. The browser scenario and a focused regression test cover this boundary; backend conflict enforcement remains intact.
- Screenshots inspected: [entry on mobile](screenshots/v3-entry-mobile.png), [long incident title](screenshots/v3-incident-desktop.png), [saved result in analytics](screenshots/v3-analytics-desktop.png). These are local, synthetic training data.

Performance observations before publication: a warm public root request took 192 ms and a subsequent health request 74 ms. Existing Render startup logs showed about 44 seconds from the startup wrapper to API readiness. This is not a measured end-to-end visitor cold start. Render itself warns of 50 seconds or more after inactivity; the app now explains this before login. No keepalive, tier change or new hosting service was introduced.

Limitations: native iPhone Safari, physical 4K/8K screens, screen-reader review and a study with actual novice users are not claimed. Existing text-zoom checks are not native browser zoom. Email delivery/password recovery cannot be claimed without a configured mail provider. The earlier public owner acceptance above remains historical evidence, not a substitute for verifying this deployment.

Additional engine result: WebKit passed both V3 scenarios, including the width matrix. Firefox could run the independent-account API checks but its Playwright 1.55.1 driver failed during page creation (`_page` undefined), before application navigation; the Firefox UI pass is therefore not verified. Browsers were installed only in this project's ignored `.local` directory.

Validation commands: Docker same-origin build succeeded; web TypeScript and locale parity passed. The 15 Chrome browser scenarios all passed (13 in the full run, the remaining two after updating their old copy expectations). The WebKit V3 pair passed. Targeted Biome checks passed with existing warnings; the commit hook performs the repository-wide Biome check.

Final web unit run: **220 tests passed in 60 files**, one worker.
