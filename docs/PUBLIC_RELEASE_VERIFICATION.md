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
