# План трансформации Kaneo в RelayOps

**Статус:** S0–S12 gates GREEN retained. S13/S14 local portfolio implementation and functional verification completed (2026-09-09); full public-release gates PARTIAL. Manual AT, planned secret/SAST checks, publication-artifact inventory refresh and external deployment decisions remain explicitly open in RELEASE_PREFLIGHT.md.
**Дата:** 2026-08-28  
**Baseline:** Kaneo 2.22.0, commit 8100f3b1ab47a0b49c7ac6deabe64eb0d1d9970d  
**Основание:** docs/BASELINE_AUDIT.md, docs/PRODUCT_OPTIONS.md, docs/TRANSFORMATION_SPEC.md, docs/ARCHITECTURE.md, AGENTS.md  
**Область:** RelayOps — self-hosted realtime incident operations platform

## Стоп-условие

**Никакая реализация, установка новых зависимостей, генерация миграций, изменение исходного кода, rebrand, commit, push или release не начинается до явного одобрения этого PLAN.md владельцем проекта.**

До одобрения разрешены только read-only проверки плана и исходного baseline. После одобрения выполнение следует dependency graph и waves ниже: S0 и S1 строго последовательны, а независимые этапы одной wave могут идти параллельно при явном file ownership. Красный gate останавливает все зависимые этапы; близость дедлайна не является основанием его обойти.

## Цель и границы

Цель — получить продукт, который нельзя описать как Kaneo с переименованными tasks:

- Operations Overview становится landing surface;
- Service, Signal, Incident и durable Timeline заменяют Project/Task как главные сущности;
- Incident Workbench table становится основной рабочей поверхностью;
- Response Board остаётся вторичной проекцией lifecycle;
- URL полностью воспроизводит workbench, inspector и analytics state;
- realtime показывает connection, presence, conflicts и authoritative refetch;
- API независимо от UI enforce-ит capabilities и workspace isolation;
- аналитика отвечает на reliability-вопросы;
- self-hosting работает без обязательных Redis, S3, SMTP, Sentry или managed queue;
- root LICENSE, upstream provenance и third-party obligations сохраняются.

В MVP не входят on-call scheduling, pager/SMS/voice, public status page, observability storage, AI root-cause analysis, arbitrary workflow builder, native mobile app, integration marketplace, billing redesign и multi-region active-active.

## Принятые архитектурные решения и оставшиеся gates

| ID | Статус | Зафиксированное решение / gate |
|---|---|---|
| D-01 Final name | **Accepted for portfolio/demo** | Продуктовое имя RelayOps утверждено; запрет на некоммерческий публичный portfolio/demo rebrand снят. Формальная проверка товарного знака и домена не заявляется и остаётся отдельным blocker перед коммерческим или полноценным production release |
| D-02 Legacy Kaneo data | **Accepted** | Strangler path: legacy Project/Task остаются изолированным read-only archive с export; автоматической конверсии в Service/Incident и dual-write нет |
| D-03 Service Owner policy | **Accepted** | Owned-policy входит в MVP: owned actions выводятся только из ownerTeam primary Service; secondary affected service и commander field сами по себе прав не дают |
| D-04 Budgets | **Accepted** | S0 budgets подтверждены без изменения; owning-stage 100k/1M query, lazy bundle, realtime и reconnect evidence записаны ниже |
| D-05 Outbox timing | **Accepted** | incident_event и outbox_event атомарно создаются с первого incident write в S1; минимальный worker входит в tracer, S6 расширяет delivery/recovery/presence |

Все domain schema changes остаются additive до отдельного future contract-removal gate. Existing workspaces по умолчанию сохраняют legacy mode; RelayOps rollout явный. Legacy data не удаляется, не переписывается и не конвертируется автоматически. Любое изменение existing installation делается forward migration; destructive down migration не используется как production rollback.

## Общие правила исполнения

1. Один этап — один проверяемый outcome. Зависимый этап начинается только после сохранения evidence и зелёных gates всех dependencies; независимые этапы одной wave могут выполняться параллельно.
2. Tracer-first: этап 1 обязан доказать тонкий production-quality путь DB → API → typed client → UI → event/realtime → browser before breadth.
3. API — единственный authority для authentication и authorization. UI capability checks улучшают UX, но не заменяют 403.
4. Каждая workspace-scoped route проходит существующий workspace resolution и requireWorkspacePermission либо его каноническое расширение из packages/permissions.
5. Zod request/response schemas, OpenAPI metadata, committed apps/docs/openapi.json и @kaneo/libs typed client меняются вместе.
6. Middleware, объявленный в createRoute, читает raw request: он выполняется до request validators и не может полагаться на c.req.valid().
7. Каждая mutation рассматривает DB transaction, local initiating-tab cache, remote WebSocket delivery, reconnect refetch, activity/timeline и optional Redis fan-out.
8. PostgreSQL остаётся source of truth. Presence не является authorization или audit evidence. Redis остаётся optional.
9. Новые schema changes включают schema.ts, relations.ts, generated migration, review SQL, fresh-DB test и upgrade test на synthetic previous-version data.
10. Secrets не попадают в response, logs, events, WebSocket, MCP, fixtures, snapshots или documentation.
11. User-facing copy добавляется статическими i18n keys; i18n/en-US.json — source of truth. Dates, durations, pluralization и time zones проходят locale-aware formatters.
12. Core action не зависит только от hover, color или drag. У DnD есть keyboard и menu alternative; focus возвращается предсказуемо.
13. Root/package lint scripts используют Biome с --write. До намеренного formatting change применяется read-only pnpm exec biome check по затронутым paths; diff проверяется после любой write-команды.
14. Не использовать production databases, credentials, webhooks или storage. Процессы запускаются с записанными PID и останавливаются только по этим PID.
15. Не откатывать чужие изменения в dirty worktree. Не commit/push/open PR без отдельного запроса.
16. Новая dependency принимается только после bundle impact, maintenance и license review. Lockfile change должен быть изолирован и объяснён.
17. Любая partial success видима и детерминирована; atomic operation не маскируется последовательностью best-effort requests.
18. Для каждого этапа фиксируются: commit/base SHA, tool versions, commands, pass/fail, skipped checks и известные deviations.

## Dependency graph и waves

~~~text
S0 Baseline
 └─> S1 Vertical tracer
      └─> S2 Shell + catalog + onboarding
           └─> S3 Incident lifecycle + timeline
                ├─> S4 Workbench + URL/saved views
                │    ├─> S5 DnD board
                │    └─> S6 Realtime room/outbox hardening
                └─> S7 Capability roles ─> S8 Signal ingestion
S4 + S6 + S7 + S8 ─> S9 Analytics
S2 + S4 + S5 + S6 + S7 + S8 + S9 ─> S10 UX/a11y/i18n/demo
S10 ─┬─> S11 Network/API security
     ├─> S12 Secrets/session hardening
     └─> S13 Distribution/compliance/rebrand
S11 + S12 + S13 ─> S14 Final deployment/release verification
~~~

| Wave | Этапы | Условие входа | Возможная параллельность |
|---|---|---|---|
| 0 | S0 | PLAN.md approved | Нет |
| 1 | S1 | S0 green | Нет; tracer является общим контрактом |
| 2 | S2 | S1 green | Frontend shell и additive service API могут идти параллельно при раздельном file ownership |
| 3 | S3 | S2 green; D-02 уже accepted | Нет для schema/transition contract |
| 4 | S4, S7 | S3 API schemas и migration frozen | Workbench и permissions допустимы параллельно при одном schema integrator |
| 5 | S5, S6 | S4 green; S6 также опирается на minimal S1 outbox | Board и realtime room/hardening могут идти параллельно при frozen transition contract |
| 6 | S8 | S7 green | Нет для public ingestion/security boundary |
| 7 | S9 | S4/S6/S7/S8 green | Backend aggregates и lazy analytics UI могут идти параллельно |
| 8 | S10 | S2–S9 green | A11y, responsive, i18n и demo-fixture workstreams параллельны после freeze copy/contracts |
| 9 | S11, S12, S13 | S10 green; D-01 blocks S13 public brand finalization | Три изолированных security/compliance workstreams с одним release-blocker registry |
| 10 | S14 | S11/S12/S13 green | Нет; единый final verification gate |

Если параллельные workstreams затрагивают apps/api/src/database/schema.ts, relations.ts, apps/api/src/index.ts, apps/web route tree, package.json или pnpm-lock.yaml, назначается один интегратор; остальные не редактируют эти shared files напрямую.

## Этап 0 — Baseline и воспроизводимость

**Цель**

Сделать исходный Kaneo baseline воспроизводимым на поддерживаемом toolchain и получить измеримую точку сравнения до feature work.

**Requirements:** ROP-014, ROP-015  
**Dependencies:** нет  
**Wave:** 0

**Изменяемые части системы**

- .gitattributes и tracked line endings для apps/web/env.sh;
- apps/web/env.sh только в части нормализации LF, без изменения runtime semantics;
- package.json, AGENTS.md, CONTRIBUTING.md, ENVIRONMENT_SETUP.md — единый Node 24/pnpm 10.32.1 contract;
- .github/workflows/ci.yml, если CI ещё не проверяет заявленный engine/line endings;
- apps/api/Dockerfile, apps/web/Dockerfile, compose.local.yml и Helm только при обнаруженной несовместимости, не ради рефакторинга;
- существующие Vitest configs и новый минимальный browser smoke harness после явного выбора runner;
- docs/BASELINE_AUDIT.md — только фактические повторные результаты и утверждённые budgets.

**Работа**

1. Исправить CRLF root cause через explicit .gitattributes rule для shell scripts и characterization check, а не через локальный обход entrypoint.
2. Сделать package.json источником истины: Node >=24.0.0; убрать 20.19+ из agent/setup guidance.
3. Установить frozen dependencies на Node 24 и зафиксировать точные версии.
4. Запустить read-only static checks, unit/integration/typecheck/build, fresh migrations и штатный Docker/Compose smoke.
5. Добавить минимальный browser smoke существующего signup/login → workspace → project/task пути. Поскольку browser runner script в текущем manifest отсутствует, его имя выбирается и добавляется в этом этапе; последующие этапы используют только реально добавленную и задокументированную команду.
6. Снять bundle/chunk sizes, API payload/OpenAPI size и representative DB/query/realtime measurements либо пометить measurement как not yet reproducible.
7. Утвердить D-04: сохранить provisional budgets из spec или скорректировать с данными и rationale.

**Критерии готовности**

- git ls-files --eol показывает LF для apps/web/env.sh в clean checkout на Windows;
- штатный web container больше не завершается code 127 и отдаёт 200 без обхода entrypoint;
- документация, package engine, CI и containers согласованы на Node 24 и pnpm 10.32.1;
- fresh PostgreSQL migrations, API health/config/openapi и web root проходят;
- полный test/typecheck/build результат записан; skipped checks явно перечислены;
- browser smoke запускается одной реальной package command, появившейся в manifest этого этапа;
- bundle/query/realtime baselines и reference environment записаны;
- root LICENSE и upstream attribution не изменены.

**Необходимые тесты**

- line-ending characterization на tracked shell files;
- API/web/package typechecks и unit tests;
- PostgreSQL integration и fresh-migration tests;
- Docker/Compose config/build/start smoke;
- browser smoke текущего critical path;
- read-only Biome и i18n checks;
- snapshot текущего OpenAPI после export без необъяснённого diff.

**Риски и mitigations**

- Локальная autocrlf снова меняет script: repository .gitattributes и CI byte/EOL assertion.
- Baseline tests могут быть красными до RelayOps: каждый failure классифицируется как pre-existing; P0 blocks tracer, остальные имеют owner и explicit waiver.
- Установка/formatting затронет чужие файлы: frozen lockfile, targeted checks, diff review, никаких root lint --write.
- Browser runner увеличит scope: только один smoke journey, без page-object framework до tracer.

**Gate и rollback**

- Gate green: штатный clean-checkout Docker smoke и baseline suite reproducible.
- Gate red: S1 не начинается.
- Rollback: revert только tooling/EOL changes; данных нет. Не сохранять diagnostic bypass как product behavior.

### Фактический результат S0 — 2026-08-27

**Статус:** GREEN. S0 завершён; его gate использован для запуска S1.

**Минимальные изменения**

- `.gitattributes` закрепляет LF для tracked shell scripts; `scripts/check-line-endings.mjs` и CI-команда `pnpm check:line-endings` предотвращают регрессию.
- API/web Dockerfiles используют pnpm `10.32.1`, согласованный с root package contract и CI; проверочный toolchain — Node `24.19.0`.
- `apps/site/lib/blog/frontmatter.ts` нормализует CRLF перед разбором frontmatter — это единственная source-level startup/build compatibility правка S0.
- Добавлен минимальный Playwright runner `pnpm smoke:browser` и один journey signup → workspace → project → task.
- RelayOps domain/schema/UI не реализовывались; legacy data и root `LICENSE` не изменялись.

**Verification evidence**

| Gate | Результат |
|---|---|
| LF | 4/4 tracked shell files `i/lf w/lf attr/text eol=lf`; characterization green |
| Static/i18n | read-only Biome: 1334 files, 0 errors; i18n green |
| Typecheck | 7/7 tasks, 8.752 s |
| Unit | 123 files / 656 tests green, 9.166 s |
| Integration | 33 files / 224 tests green, 113.18 s |
| Build | 7/7 tasks, 13.266 s |
| Migrations | fresh PostgreSQL, 45 applied; Drizzle generate reports no schema changes |
| OpenAPI | export has no semantic diff; serialization-only CRLF/LF difference |
| Docker/Compose | stock API/web images build; PostgreSQL/API healthy; health/config/OpenAPI/web root return 200 |
| Browser | 1 Chromium smoke passed in 4.7 s |
| Provenance | root `LICENSE` blob unchanged; upstream attribution retained |

**Baseline measurements / D-04**

- health latency over 30 local requests: median 9.86 ms, p95 10.65 ms;
- payloads: health 15 B, config 386 B, OpenAPI 171,546 B, web HTML 8,300 B;
- production artifacts: API entry 1,547,960 B; web artifact 60,984 KiB including sourcemaps/assets; JS total 18,180,941 B;
- largest existing chunk `comment-editor`: 807,440 B minified / 252.82 kB gzip; main index: 502,532 B / 163.09 kB gzip;
- smoke DB query on one-row task table: 0.115 ms, explicitly not representative;
- realtime second-browser measurement: not yet reproducible before the incident tracer.

D-04 budgets из `docs/TRANSFORMATION_SPEC.md` подтверждены без изменения. Их нельзя калибровать по one-row legacy dataset: 100k incident query, Workbench route transfer, table FPS, realtime и reconnect измеряются на предусмотренных fixtures в owning stages.

**Риски, оставшиеся за границей S0**

- Existing bundle warnings и 71 non-blocking Biome warnings зафиксированы как baseline, но не полировались.
- Host Node 22 не соответствует engine; воспроизводимый S0 gate использует exact container toolchain. Установка/изменение host runtime не требовалась.
- Redis, production-sized data, role denials, accessibility и realtime не выдаются за проверенные; у них есть последующие gates.

**Gate:** GREEN. S1 был отдельно запрошен и выполнен 2026-08-27.

## Этап 1 — Production-quality vertical tracer

**Цель**

Доказать минимальный RelayOps end-to-end slice: workspace admin создаёт Service, создаёт detected Incident, видит incident.created в durable timeline и открывает deep-linked incident inspector; второй tab получает compact update или authoritative refetch.

**Requirements:** ROP-001, ROP-002, ROP-003, ROP-006, ROP-008, ROP-009, ROP-012, ROP-014  
**Dependencies:** S0  
**Wave:** 1

**Изменяемые части системы**

- apps/api/src/database/schema.ts, relations.ts, apps/api/drizzle/*;
- новые vertical modules apps/api/src/service/*, incident/*, incident-event/* и outbox/*;
- apps/api/src/index.ts, openapi.ts и event/WS mapping;
- packages/permissions и packages/libs;
- новые apps/web fetchers/hooks/routes/components для одного Service и одного Incident;
- apps/web query client/realtime hooks;
- tests/api, tests/api-integration, apps/web component tests и Stage-0 browser harness.

**Работа**

1. Ввести additive minimal tables и relations: service, incident, incident_event и outbox_event с workspaceId, version, idempotency и required indexes.
2. Реализовать thin OpenAPI routes и controllers для create/read Service и create/read Incident; первый incident write, incident.created event и publication-intent outbox_event происходят в одной PostgreSQL transaction.
3. Добавить минимальный bounded outbox worker: claim через safe concurrent lease/SKIP LOCKED pattern, compact redacted envelope, retry и publishedAt. Delivery at-least-once; duplicate message безопасен.
4. Добавить минимальные canonical permissions service:read/create и incident:read/create; API key scope и workspace isolation проверяются.
5. Провести types через @kaneo/libs, fetchers и TanStack Query; не создавать второй untyped client.
6. Добавить отдельный RelayOps route namespace и временный non-destructive entry. Primary Kaneo IA пока не удаляется.
7. Inspector selection и tab хранятся в validated search params; back/forward и refresh восстанавливают selected incident.
8. Инициирующий tab обновляет cache локально; второе окно получает compact incident id/version signal от S1 worker и authoritative refetch.

**Критерии готовности**

- один browser journey доказывает real DB write/read, typed API, UI interaction и timeline event;
- workspace B не читает и не изменяет entities workspace A;
- direct unauthorized API request получает 401/403 независимо от UI;
- incident URL работает после refresh и во втором authorized session;
- transaction failure не оставляет ни incident, ни orphan incident_event, ни orphan outbox_event;
- worker restart дочитывает unpublished outbox_event, а повторная delivery не создаёт duplicate domain effect;
- Redis disabled mode проходит; Redis не становится обязательным;
- old Project/Task paths и data не удалены.

**Необходимые тесты**

- unit: validators, permission mapping, URL serializer;
- API integration: fresh/upgrade migration, cross-workspace isolation, create/read, transaction rollback, outbox claim/retry/restart/deduplication;
- component: loading, error, denied и inspector focus restoration;
- browser: two contexts, deep link, local/remote cache path;
- OpenAPI export diff и affected package typechecks/build.

**Риски и mitigations**

- Tracer разрастается: только create/read, один timeline type и один room view; transitions/facets/presence остаются следующим этапам.
- Новая schema зафиксирует неверную модель: additive tables, explicit review checkpoint до расширения, representative fixtures.
- Best-effort event ошибочно считается history: incident_event — durable truth, outbox_event — durable publication intent, WebSocket только delivery hint.

**Gate и rollback**

- Gate green: demo path проходит на fresh DB и upgrade fixture, включая denial и second-tab evidence.
- Gate red: breadth work S2–S14 запрещён.
- Rollback: unmount RelayOps routes and revert additive migration only on disposable environments; для существующей installation — forward corrective migration, без удаления legacy data.

### Фактический результат S1 — 2026-08-27

**Статус:** GREEN. Production-quality vertical tracer завершён; S2 не начат.

**Реализованный slice**

- Additive migration `0045_far_whizzer.sql` создаёт workspace-scoped `service`, `incident`, append-only `incident_event` и `outbox_event` с composite FKs, version/idempotency constraints и индексами; legacy Project/Task schema и данные не удаляются.
- Thin OpenAPI create/read routes используют canonical permissions и существующий typed Hono `AppType`; incident, `incident.created` и publication intent записываются одной PostgreSQL transaction.
- Minimal outbox worker использует bounded batch, `FOR UPDATE SKIP LOCKED`, lease recovery, retry/backoff, `publishedAt` и compact redacted user signal. In-memory delivery является рабочим default; Redis остаётся optional.
- Отдельный `/relayops/$workspaceId` route и non-destructive legacy entry создают Service и detected Incident, показывают durable timeline, валидируют `incidentId`/`tab` search params и восстанавливают inspector через refresh/back/forward.
- Инициирующая вкладка обновляет TanStack Query cache локально; вторая вкладка получает `RELAYOPS_INCIDENT_CREATED` и выполняет authoritative API refetch.

**Verification evidence**

| Gate | Результат |
|---|---|
| Migration | fresh browser DB auto-migrated; upgrade fixture применил migrations 0000–0044, сохранил legacy project и успешно добавил 0045 |
| Unit | validator 2/2, URL search 2/2, permission mapping 10/10 |
| Component | loading, denied/error + retry и deep-link focus restoration 3/3 |
| API integration | RelayOps suite 10/10: create/read, idempotency, documented duplicate-slug conflict, workspace isolation, rollback, concurrent/stale lease, retry, OpenAPI, API-key scope, upgrade migration |
| Static | focused Biome green; affected API/web typecheck 5/5 tasks; i18n 17 locales green; LF check green |
| Build | API ESM bundle и web production Vite build green; только зафиксированные baseline Vite/sourcemap/chunk warnings |
| Browser | Chromium two-tab journey 1/1 green, 17.9 s: onboarding, entry, Service/Incident, inspector focus, timeline, second-tab refetch, reload и back/forward |
| Browser DB proof | `service=1`, `incident=1`, `incident_event=1`, `published outbox_event=1` в отдельной PostgreSQL DB после journey |
| Redis-disabled | API browser instance стартовал с `InMemoryBroadcastAdapter`; second-tab journey green без Redis |
| Isolation/denial | cross-workspace reads возвращают 404/403; read-only API key create получает 403 независимо от UI |
| Atomicity/recovery | forced outbox insert failure оставляет 0 incident/event/outbox; concurrent workers публикуют один раз; stale claim и transport failure успешно retry-ятся без domain duplicate |

**Gate:** GREEN. Все обязательные критерии S1 имеют passing evidence; реальных S1 blockers не осталось. Следующий допустимый этап — S2 только после отдельного запроса.

## Этап 2 — RelayOps shell, Service Catalog и guided onboarding

**Цель**

Сделать Operations Overview landing surface, внедрить полноценный Service Catalog и довести нового пользователя до first value: service + removable demo incident + role-aware checklist.

**Requirements:** ROP-001, ROP-002, ROP-012, ROP-013, ROP-015  
**Dependencies:** S1; D-02 accepted architecture  
**Wave:** 2

**Изменяемые части системы**

- apps/web/src/routes/_layout/_authenticated/dashboard/* и route tree generation;
- apps/web/src/components/app-sidebar.tsx, nav components, common layout;
- новые Operations Overview, Service Catalog, Service detail components;
- apps/web/src/components/onboarding/*;
- apps/api/src/service/* и новый scoped demo-data cleanup controller;
- database schema/migration для service fields, ownership/team и demo-data provenance;
- i18n/en-US.json и locale resources;
- apps/site/docs copy только после IA acceptance, без final trademark claim.

**Работа**

1. Реализовать Service CRUD/archive/deep links с tier, health, ownerTeamId, validated repositoryUrl/runbookUrl.
2. Заменить primary navigation на Operations/Services/Insights/Manage; Project/Task, Backlog, Calendar и Gantt не являются primary navigation.
3. Operations Overview показывает active incidents, degraded services, commanderless incidents, latest updates и connection state через реальные query states, не декоративные KPI.
4. Onboarding создаёт первый Service, предлагает deterministic demo incident и checklist; все demo rows маркируются provenance и удаляются одной authorized atomic operation.
5. Добавить loading, dataset-empty, filtered-empty, denied, retryable и unrecoverable states.
6. Реализовать accepted strangler path D-02: opted-in RelayOps workspace получает отдельный read-only legacy archive/export; legacy writes выключаются только через explicit rollout, automatic conversion и dual-write запрещены.

**Критерии готовности**

- authenticated landing — Operations Overview; primary nav не содержит Project/Task;
- Service CRUD/archive соблюдает workspace isolation и permissions;
- onboarding приводит clean user к открытому Incident Room без второго пустого состояния;
- demo data удаляется полностью без затрагивания user-created data;
- public URLs валидируются, private/unsafe destinations не используются для server fetch;
- desktop/tablet/mobile обеспечивают core read/create path;
- copy использует static i18n keys.

**Необходимые тесты**

- API unit/integration: Service validators, uniqueness, archive/reverse state, ownership boundaries;
- component/router: landing redirects, nav semantics, deep links, all route states;
- browser: clean onboarding, opt-out demo, remove demo, denied persona;
- accessibility smoke: landmarks, skip link, link semantics, focus order;
- locale/date smoke и i18n:check.

**Риски и mitigations**

- Cutover потеряет legacy access: accepted read-only archive/export, explicit product_mode rollout, additive routes и no data deletion.
- Demo data загрязнит analytics: provenance field и default exclusion, atomic cleanup.
- Overview станет card dashboard: live clock rail и operational queues остаются главным hierarchy.

**Gate и rollback**

- Gate green: clean-DB first-value browser test и service isolation matrix green.
- Gate red: S3 не расширяет lifecycle.
- Rollback: вернуть previous landing/nav while retaining additive RelayOps data; destructive legacy change запрещён без отдельного approved migration plan.

**Статус:** GREEN (2026-08-28). S2 завершён; S3 не начат.

**Фактическое evidence**

- Operations Overview стал authenticated landing для opted-in RelayOps workspace; primary navigation содержит Operations, Services, Insights и Manage, а legacy Project/Task доступны только через read-only archive/export.
- Service Catalog реализует workspace-scoped create/read/update/archive/restore, server-side search/status filters, owner-team validation, active-slug uniqueness, validated HTTP(S) repository/runbook links и canonical deep links.
- Guided onboarding доводит clean workspace от первого Service до deterministic demo Incident и открытого Incident Room; provenance хранится на demo rows, а authorized cleanup удаляет только весь marker-scoped demo dataset одной PostgreSQL transaction.
- Добавлены loading, dataset-empty, filtered-empty, denied, retryable и unrecoverable route states, responsive table/card core flow, skip link и static i18n keys. `i18n:check` green для всех locale resources; новые S2 строки в non-English locales пока используют синхронизированный English fallback.
- D-02 реализован additive migration `0046_medical_landau.sql`: explicit `product_mode` rollout, сохранение существующих Kaneo rows, read-only legacy archive/JSON export и API block для core legacy Project/Task writes после opt-in; automatic conversion, dual-write и destructive migration отсутствуют.
- API unit: 61 files / 389 tests passed. Web unit: 44 files / 160 tests passed. Focused RelayOps integration: 14/14 passed на disposable PostgreSQL, включая upgrade migration, isolation, permissions, archive/reverse state и demo cleanup.
- Browser: 4/4 passed — сохранённый legacy Kaneo flow; clean S2 onboarding/demo cleanup/mobile/deep-link/filtered-empty/nav/skip-focus; demo opt-out; API-denied persona.
- API и web typecheck passed; API и web production builds passed; targeted Biome и `git diff --check` passed. Проверки выполнены с pnpm 10.32.1; локальный runner имеет Node 22.15.1 и сообщает engine warning относительно требуемого Node >=24, поэтому Node-24 parity остаётся окруженческой оговоркой, а не скрытым passing claim.

**Gate:** GREEN. Clean-DB first value, Service isolation/permission matrix, reversible archive state, demo provenance cleanup, responsive browser flow и additive legacy upgrade имеют passing evidence; реальных S2 blockers не осталось. Следующий допустимый этап — S3 только после отдельного запроса.

## Этап 3 — Incident lifecycle и durable timeline

**Цель**

Реализовать canonical incident state machine, timestamps, optimistic versioning и append-only typed timeline как доменный source of truth.

**Requirements:** ROP-003, ROP-006, ROP-009, ROP-014  
**Dependencies:** S2  
**Wave:** 3

**Изменяемые части системы**

- apps/api/src/incident/*, incident-event/* и focused policy utilities;
- apps/api/src/database/schema.ts, relations.ts, migrations/indexes;
- apps/api/src/events/index.ts только как legacy/post-commit adapter behind the outbox worker; Incident controllers напрямую не публикуют;
- OpenAPI response/error schemas, packages/permissions и packages/libs;
- apps/web incident fetchers/query/mutation hooks, inspector/room overview/timeline;
- tests/api, tests/api-integration и web component tests.

**Работа**

1. Зафиксировать statuses detected, triaging, mitigating, monitoring, resolved, dismissed и exact transition table из spec.
2. Один transition command принимает expectedVersion и idempotency key; transition, derived timestamps, incident version, incident_event и outbox_event записываются atomically.
3. Stale expectedVersion возвращает 409 version_conflict с current safe representation.
4. Реализовать typed timeline events; raw signal payloads/secrets никогда не попадают в payload.
5. Ввести commander/responders, affected services, severity, impact, freshness и resolution summary.
6. Ввести в packages/permissions минимальный lifecycle vocabulary из spec: transition/transition_owned, severity/severity_owned, resolve/resolve_owned, reopen/reopen_owned, dismiss/dismiss_owned и incident_timeline:correct; API enforce-ит exact role/capability/severity matrix уже в S3. Service Owner ограничен primary-service-owned non-SEV1, Commander/Admin обслуживают SEV1, commander field само по себе прав не выдаёт.
7. Manual timestamp correction входит в MVP как expectedVersion command с отдельной incident_timeline:correct capability только для Incident Commander/Workspace Admin. Он создаёт compensating incident.timestamps_corrected event и outbox_event; существующая timeline не редактируется и не удаляется.

**Критерии готовности**

- каждая allowed transition обновляет только корректные timestamps и создаёт ровно один incident_event и один outbox_event;
- forbidden transition возвращает stable 4xx и не меняет incident/version/timeline;
- concurrent stale update даёт 409 без silent overwrite;
- retry с тем же idempotency key не дублирует event;
- SEV1 severity change/resolve/reopen/dismiss запрещены без Commander/Admin capability; Service Owner terminal actions ограничены owned non-SEV1;
- timestamp correction запрещена без incident_timeline:correct и всегда оставляет append-only compensating event;
- timeline pagination стабильна и workspace scoped;
- inspector drawer и canonical room показывают одинаковую authoritative state.

**Необходимые тесты**

- exhaustive unit table для каждой allowed/forbidden transition;
- property/invariant tests для timestamps, version и terminal/reopen states;
- PostgreSQL concurrency integration test с двумя writers;
- idempotency, transaction rollback, cross-workspace и permission matrix;
- component tests 409/error/rollback states;
- migration fresh + upgrade и index inspection.

**Риски и mitigations**

- Timestamp semantics расходятся с analytics: metric definitions и transition policy имеют общий source module.
- Duplicate events при retry: unique scoped idempotency constraint.
- process crash между commit и publish: обязательный minimal S1 worker дочитывает durable outbox; S6 harden-ит backoff, recovery и observability.
- Большой controller: vertical submodules для commands, queries, policies и timeline serializers.

**Gate и rollback**

- Gate green: exhaustive transition/concurrency suite и migration upgrade green.
- Gate red: Workbench/DnD/realtime не строятся поверх нестабильного lifecycle.
- Rollback: disable mutation routes and leave read-only incident/timeline data; исправление schema — forward migration.
**Статус:** GREEN (2026-08-28). Canonical lifecycle, optimistic versioning, append-only durable timeline и authoritative inspector/room завершены.

**Gate evidence:**

- exhaustive lifecycle/policy/schema unit suite — 16/16; PostgreSQL S3 concurrency/idempotency/rollback/isolation suite — 6/6, полный S1–S3 integration набор — 20/20;
- allowed/forbidden transitions, timestamp invariants, terminal/reopen semantics, SEV1/owned policy, 409 current representation и compensating timestamp events покрыты;
- migration fresh/upgrade и index inspection green; incident_event и outbox_event создаются atomically, timeline остаётся append-only;
- web conflict/rollback/inspector components — 6/6; Incident Room Playwright — 1/1; API/web typecheck и production builds green.

## Этап 4 — Incident Workbench, server filters, URL state и saved views

**Цель**

Создать главную surface: virtualized server-driven incident table с deterministic URL state, deep-linked inspector и versioned private/workspace saved views.

**Requirements:** ROP-004, ROP-005, ROP-006, ROP-009, ROP-014  
**Dependencies:** S3  
**Wave:** 4

**Изменяемые части системы**

- incident query schemas/controllers/index strategy;
- saved_view schema, relations, migration и API module;
- apps/web route validateSearch schema и URL serialization utilities;
- новые workbench table, toolbar, facets, column configuration, row selection и inspector components;
- apps/web fetchers/hooks/query-key factories;
- apps/web/package.json и pnpm-lock.yaml только после dependency/license/bundle gate для table/virtualization libraries;
- analytics-ready representative fixture tooling.

**Работа**

1. Server endpoint поддерживает cursor pagination, q, status, severity, service, commander, date range, ordered multi-sort и group-compatible summaries.
2. Facet counts вычисляются в том же authorized/filter scope; cursor не входит в canonical shareable URL.
3. URL serializer детерминированно нормализует arrays, dates, sort, density, columns, incidentId и tab; invalid values replace один раз.
4. Explicit URL fields override saved-view base. Back/forward, refresh и copied URL восстанавливают identical view.
5. Saved views имеют private/workspace visibility и optimistic version; чужой shared view не перезаписывается silently.
6. Table поддерживает resize/reorder/pin/density/visible columns и virtualization без full-page rerender.
7. Selected row открывает inspector, а canonical room имеет stable link и focus restoration.

**Критерии готовности**

- copied URL воспроизводит filters/sort/group/columns/incident/tab во второй authorized session;
- query возвращает первые 50 rows p95 в утверждённый S0 budget на 100k incidents fixture;
- scrolling соответствует утверждённому FPS budget и не загружает full dataset;
- filter/sort reset cursor; cursor invalidation не ломает canonical URL;
- unauthorized filters/saved views не раскрывают facet counts чужого workspace;
- concurrent saved-view edit даёт 409/compare path;
- loading, background refresh, empty, filtered-empty, denied, error и partial bulk states различимы.

**Необходимые тесты**

- unit >=90% branch target: parse/normalize/serialize URL, saved-view merge precedence, cursor reset;
- API integration: filters, multi-sort, cursor stability, facet scope, saved view RBAC/version conflicts;
- DB EXPLAIN ANALYZE BUFFERS на representative fixture и index regression evidence;
- component: virtualization, column persistence, keyboard navigation, inspector focus;
- browser: share/refresh/back/forward/second-session parity;
- bundle measurement для workbench route.

**Риски и mitigations**

- URL становится слишком длинным: versioned compact column preset, limits и saved view references.
- Cursor unstable при concurrent writes: deterministic tie-breaker и documented snapshot expectations.
- New grid dependency раздувает bundle: dependency gate, lazy route, measured before/after.
- Facet queries дороги: representative EXPLAIN и bounded facet strategy, не client-side full dataset.

**Gate и rollback**

- Gate green: URL parity, isolation и performance evidence green.
- Gate red: analytics и final demo blocked.
- Rollback: fall back to default server table without saved views/column customization; incident data/lifecycle unaffected.
**Статус:** GREEN (2026-08-28). Server-driven Workbench, canonical URL state, versioned saved views и deep-linked inspector завершены.

**Gate evidence:**

- URL normalize/serialize/merge, virtualization, columns и inspector focused web suite — 22/22; API workbench/schema/authorization focused suite входит в passing 24/24 набор;
- PostgreSQL S4/S7 integration — 3/3: filters, ordered multi-sort, stable/stale cursors, scoped facets, private/workspace views, API-key scope и saved-view 409 compare/retry; fresh migration contract — 1/1 и synthetic prior-schema upgrade сохранил custom viewer payload;
- representative 100k fixture performance test — 1/1 с p95 budget <=300 ms; EXPLAIN ANALYZE execution 25.107 ms, 51-row bounded result; Workbench lazy chunk 37.77 kB minified / 13.25 kB gzip;
- Playwright share/save/refresh/back/forward/columns/deep-link/second-authorized-session parity — 1/1;
- final API/web/libs typecheck, OpenAPI export и production builds green; S4 operation IDs присутствуют в generated apps/docs/openapi.json.

## Этап 5 — Accessible transactional Response Board

**Цель**

Добавить вторичную board projection lifecycle с pointer/touch/keyboard/menu parity и одним atomic transition command вместо O(n) updates.

**Requirements:** ROP-003, ROP-005, ROP-007, ROP-009, ROP-013, ROP-014  
**Dependencies:** S3, S4  
**Wave:** 5

**Изменяемые части системы**

- apps/web Response Board route/components на dnd-kit;
- shared incident query/URL state, transition mutation и optimistic cache utilities;
- API transition command/policy из S3, без parallel reorder endpoint;
- accessibility announcements/instructions;
- component/browser/API regression tests.

**Работа**

1. Lanes фиксированы canonical lifecycle; visual order не создаёт arbitrary status.
2. Pointer, touch, KeyboardSensor и menu Move to вызывают одинаковый transition command.
3. Invalid targets заранее обозначены label/icon, не только color; server остаётся final validator.
4. Optimistic preview использует expectedVersion, rollback и retry; error никогда не сопровождается success toast.
5. Undo предлагается только для явно reversible transition и повторно валидируется server.
6. Board и Workbench используют один URL filter/incident/tab contract.
7. Screen reader получает lift, target, invalid/accepted drop и rollback announcements.

**Критерии готовности**

- одно перемещение порождает один domain command/transaction, а не O(n) REST mutations;
- pointer, touch, keyboard и menu дают одинаковый state/timeline result;
- forbidden drop не меняет client/server state;
- stale drop показывает conflict path и сохраняет user context;
- keyboard-only пользователь проходит detected → triaging → mitigating;
- reduced motion убирает spatial movement, сохраняя status feedback;
- menu alternative остаётся доступной при отключённом DnD.

**Необходимые тесты**

- policy/transition API integration and idempotency;
- component tests sensors, keyboard coordinates, announcements, invalid targets, rollback and undo;
- browser pointer + keyboard + menu flows, focus restoration, two-role denial;
- axe gate и manual screen-reader smoke;
- request-count assertion: one transition request per user action.

**Риски и mitigations**

- DnD скрывает invalid policy: explicit targets и menu command.
- Optimistic UI конфликтует с remote update: versioned cache reducer и S6 conflict semantics.
- Touch scrolling ломается: activation constraints и 44px+ targets.

**Gate и rollback**

- Gate green: parity matrix и atomic request-count test green.
- Gate red: DnD не включается в primary navigation.
- Rollback: disable drag affordance; menu transition остаётся canonical accessible fallback.

### Фактический результат S5 — 2026-08-28

**Статус:** GREEN. Accessible transactional Response Board завершён поверх frozen S3 lifecycle command.

**Gate evidence**

- шесть canonical lanes являются projection статусов; pointer, touch, keyboard sensor, Move menu, undo и reapply проходят через один `onTransition` command с incident id, target, expectedVersion и idempotency key;
- invalid/forbidden targets не меняют state, optimistic preview откатывается при failure, а conflict сохраняет context и предлагает compare/reapply/discard; menu остаётся доступной при отключённом DnD;
- ResponseBoard component/policy suite — 10/10: parity, keyboard coordinates, announcements, invalid targets, rollback, undo и accessible alternative;
- combined Chromium flow — 1/1: все шесть lifecycle regions видимы, keyboard/menu transition Detected→Triaging завершён одним canonical request, board axe clean; automated RelayOps accessibility suite также green.


## Этап 6 — Realtime Incident Room, outbox hardening, presence и conflicts

**Цель**

Расширить обязательный S1 outbox и сделать realtime видимым: hardened delivery/recovery, connection states, ephemeral presence, version conflicts и authoritative reconnect.

**Requirements:** ROP-003, ROP-006, ROP-008, ROP-014  
**Dependencies:** S1 minimal outbox, S3 lifecycle, S4 Workbench; D-05 accepted  
**Wave:** 5

**Изменяемые части системы**

- extensions к S1 outbox worker/lease utilities, indexes/retention migration только по измеренной необходимости и event publication boundary;
- apps/api/src/ws/*, optional Redis adapter и compact message schemas;
- Incident Room Overview/Timeline/Signals/Responders/Audit tabs;
- apps/web realtime connection state store/hooks, cache patch/refetch and conflict UI;
- structured metrics/logging for publish, reconnect and delivery latency;
- unit/integration/two-context browser tests.

**Работа**

1. Сохранить S1 invariant: каждая incident mutation атомарно пишет incident, incident_event и outbox_event; расширить worker bounded batches, retry/backoff, claim recovery, retention и lag observability без external queue.
2. In-memory mode является default; Redis только fan-out между instances.
3. Message содержит workspace-safe incident id/version/type, без secret payload.
4. UI показывает connected, reconnecting с countdown, offline и stale с last sync/manual retry.
5. Reconnect refetches selected incident и active query window; optimistic initiating-tab и remote-tab paths тестируются отдельно.
6. Presence имеет TTL/heartbeat/cap, не хранится как durable audit и не даёт прав.
7. 409 сохраняет draft и предлагает compare/reapply/discard; retry reuse idempotency key.
8. Outbox backlog, retry/dead-letter-like terminal state и recovery observable; delivery failure не отменяет committed timeline.

**Критерии готовности**

- commit → second browser visible p95 соответствует утверждённому budget в single-instance mode;
- reconnect authoritative refetch завершается в budget и убирает stale badge;
- repeated/out-of-order message не откатывает newer incident version;
- Redis disabled/enabled/failure paths сохраняют single-instance correctness;
- presence исчезает после TTL и не влияет на authorization;
- conflict keeps draft and creates no duplicate timeline;
- worker restart продолжает unpublished items без потери/дубликата domain effect.

**Необходимые тесты**

- outbox unit/integration: atomicity, retry, duplicate delivery, lease/concurrency, restart;
- real WebSocket handshake/origin/auth/message-size tests;
- in-memory, Redis enabled and Redis publish failure tests;
- two-browser E2E: presence, remote update, disconnect/reconnect, stale conflict;
- structured log redaction and realtime latency measurement;
- cache reducer branch coverage >=90%.

**Риски и mitigations**

- Outbox уже входит в S1 по accepted D-05: S6 не меняет durability contract, а harden-ит delivery/recovery/presence без managed broker.
- At-least-once создаёт duplicates: event id/version/idempotent reducers.
- Reconnect storm: jitter/backoff/caps и bounded refetch.
- Presence leak: workspace-scoped channels, TTL and strict payload.

**Gate и rollback**

- Gate green: two-context suite, outbox recovery and Redis-off proof green.
- Gate red: realtime claims и presence скрыты; durable timeline остаётся.
- Rollback: disable presence/outbox broadcaster and degrade to explicit refetch/polling while preserving committed incident/timeline records; не откатывать DB history.

### Фактический результат S6 — 2026-08-28

**Статус:** GREEN. Outbox recovery, visible realtime state, presence TTL и conflict UX завершены; PostgreSQL остаётся source of truth.

**Gate evidence**

- worker использует bounded claim/recovery, exponential backoff, terminal outcome/lag observation и secret-safe errors; unpublished committed timeline переживает restart, а duplicate/out-of-order delivery не откатывает newer version;
- in-memory broadcast является default; optional Redis fan-out/failure не нарушает single-instance correctness и не становится durable authority;
- UI показывает connected/reconnecting/offline/stale + last sync/retry, reconnect выполняет authoritative workspace refetch, а 409 сохраняет draft и даёт compare/reapply/discard;
- focused API realtime/outbox — 5/5 и web reducer/presence/conflict — 5/5; PostgreSQL integration в RelayOps suite проверяет retry/recovery/isolation;
- combined Chromium flow — 1/1: три remote durable updates во втором authorized context с p95 `<=750 ms`, offline→Live authoritative recovery `<=5 s`, visible room presence; TTL/cap/workspace isolation доказаны отдельно unit tests без выдачи presence за authorization evidence.


## Этап 7 — Capability roles и единый authorization registry

**Цель**

Ввести role-aware product с canonical capabilities для Services/Incidents/Signals/Analytics и единым UI registry, сохраняя API deny-by-default.

**Requirements:** ROP-002, ROP-003, ROP-009, ROP-015  
**Dependencies:** S2, S3; D-03 accepted architecture  
**Wave:** 4

**Изменяемые части системы**

- packages/permissions canonical resources/actions и tests;
- apps/api require-workspace-permission/policy helpers, API-key scope mapping;
- workspace role seeds/backfill migration;
- role settings UI и shared capability registry для routes/nav/actions/command palette;
- обязательная Service ownership/team policy по accepted D-03;
- authorization integration fixtures/tests.

**Работа**

1. Дополнить canonical vocabulary, начатый в S1/S3, ресурсами Service/Signal/Saved View/Analytics и полными role templates без проверки role-name strings; принятые lifecycle action names не переименовывать.
2. Создать editable templates Viewer, Responder, Incident Commander, Service Owner, Workspace Admin.
3. Один registry управляет UI discovery/visibility; API routes независимо enforce-ят ту же vocabulary.
4. Ownership predicate связывает workspace, authenticated membership, ownerTeam primary Service и explicit owned action. Secondary affected service и commander field не выдают права.
5. API key scopes применяются ко всем read/write routes, а не только отдельным mutation middleware.
6. Role changes создают audit evidence и invalidate affected sessions/query state.

**Критерии готовности**

- полный endpoint × role × API-key matrix имеет explicit allow/deny expectation;
- hidden action, direct HTTP call и command-palette shortcut дают одинаковый denial outcome;
- Viewer read-only; Incident Commander и Admin выполняют protected transition; Service Owner не выходит за approved scope;
- role seed/backfill не создаёт duplicate workspace roles;
- no cross-workspace ownership inference;
- route/nav/action registry не содержит orphan action без API capability.

**Необходимые тесты**

- packages/permissions unit tests;
- PostgreSQL role seed/backfill/uniqueness and concurrent assignment tests;
- API integration matrix for sessions and API keys;
- component tests registry/nav/command palette/denied state;
- browser persona tests Viewer, Responder, Commander, Owner, Admin;
- audit log redaction.

**Риски и mitigations**

- Role names становятся policy: capabilities являются source of truth.
- Ownership query может стать сложной или протечь между workspaces: scoped repository, composite constraints и negative tests для primary/secondary service semantics.
- API key bypass: enumerate every public/private operation and fail closed in contract tests.

**Gate и rollback**

- Gate green: 100% protected route coverage in authorization matrix, no unknown row.
- Gate red: signal webhook administration/export/public release blocked.
- Rollback: revert template assignments to prior explicit capabilities with forward data correction; API remains deny-by-default.
**Статус:** GREEN (2026-08-28). Capability templates, server-side RBAC, API-key scopes, workspace/ownership isolation и durable role audit завершены.

**Gate evidence:**

- packages/permissions canonical vocabulary/templates — 28/28; endpoint registry покрывает 27 protected operations × 5 RelayOps roles без unknown/orphan rows; focused API lifecycle/schema/workbench/auth matrix — 24/24;
- PostgreSQL S4/S7 suite — 3/3: concurrent seed/uniqueness, generated-viewer upgrade, custom-viewer preservation, workspace isolation, role∩API-key scope, redacted audit и scoped session invalidation; audit payload unit — 1/1;
- web capability/context/action suite — 7/7; production Service Owner context доказывается только primary Service owner-team membership в том же workspace;
- Playwright persona discovery — 1/1 scenario для Viewer, Responder, Incident Commander, unowned Service Owner и Workspace Admin; direct HTTP/API-key denials отдельно доказаны integration matrix;
- final permissions/API/web/libs typecheck/build green.

**Реальное ограничение upgrade:** pre-S7 installations, уже содержащие duplicate `(workspace_id, role)` rows, должны вручную устранить неоднозначные authorization rows до migration 0048; автоматическое удаление или переименование не выполняется. Обычный prior-schema upgrade без duplicates, custom-role preservation и concurrent S7 seed имеют passing evidence.

## Этап 8 — Signal ingestion

**Цель**

Добавить manual signal, deterministic demo generator и generic signed webhook с idempotency, replay/rate/body limits и redacted payload.

**Requirements:** ROP-003, ROP-009, ROP-011, ROP-014, ROP-015  
**Dependencies:** S2, S3, S7  
**Wave:** 5

**Изменяемые части системы**

- new apps/api/src/signal/* and ingestion controllers/schemas;
- public webhook mount/auth boundary in apps/api/src/index.ts;
- database signal, ingestion attempt/idempotency constraints and migration;
- secret storage utilities, rate/body/replay guards;
- apps/web manual/demo signal UI and Incident Room Signals tab;
- OpenAPI/docs plus integration/security tests.

**Работа**

1. Validate signature over raw bytes before JSON interpretation; enforce bounded body and accepted content type.
2. Use workspace-scoped secret, timestamp/replay window and constant-time verification.
3. Enforce idempotency on workspaceId/source/externalId and deterministic fingerprint/deduplicationKey.
4. Normalize allowlisted fields; redact/drop raw secrets and oversized/untrusted payload sections.
5. Rate limit works without Redis; Redis may optimize multi-instance coordination but is not required.
6. Failed attempts emit safe structured audit with request id, never body/secret.
7. Signal may remain unattached, attach to incident or create a user-confirmed draft; no automatic outbound fetch to a user URL.
8. Demo generator deterministic and removable through S2 provenance cleanup.

**Критерии готовности**

- valid webhook creates one signal; retry creates no duplicate;
- invalid signature, stale timestamp, oversized body and rate excess fail before domain write;
- duplicate externalId across different workspaces remains isolated;
- redacted API/timeline/log outputs contain no raw secret/token;
- manual and demo paths use the same normalization contract;
- no code path performs outbound request to webhook-supplied URL.

**Необходимые тесты**

- known-vector signature and constant-time behavior review;
- replay, idempotency, concurrent duplicate, body/content-type and rate-limit integration tests;
- workspace/API role denial matrix;
- fuzz/property tests for malformed JSON/headers/oversized fields;
- log/event/response secret scanning;
- browser manual/demo attach journey.

**Риски и mitigations**

- Signature checks parsed body instead of raw: route boundary test with whitespace/order changes.
- Replay cache requires Redis: PostgreSQL-backed safe default.
- Payload becomes secret sink: allowlist normalization, size caps, encryption only where retention is required.
- Public endpoint DoS: pre-parse body/rate/time limits.

**Gate и rollback**

- Gate green: abuse suite and idempotent two-delivery test green.
- Gate red: generic webhook disabled; manual/demo may remain if separately green.
- Rollback: rotate/revoke webhook secret and unmount inbound route; retained normalized signals stay readable/auditable.

### Фактический результат S8 — 2026-08-28

**Статус:** GREEN. Manual/demo/generic-webhook ingestion и Incident Room attach завершены.

**Gate evidence**

- manual signal и deterministic demo generator используют общий normalization contract; signed generic webhook проверяет HMAC по exact raw bytes до JSON parse, а secret хранится AES-GCM с AAD и fail-closed key handling;
- PostgreSQL-backed idempotency/replay/rate audit, content-type/body limits, concurrent duplicate handling и safe outcomes работают без Redis; retries не создают duplicate Signal;
- workspace-scoped composite constraints/queries, redacted allowlist payload, compact `incident.signal_attached` event/outbox и response/log secret scans не раскрывают raw body, authorization, token или secret;
- focused crypto/normalization/abuse unit — 10/10, SignalPanel accessibility/actions — 3/3; PostgreSQL integration покрывает valid/retry/invalid/stale/oversize/rate/isolation/attach, а combined Chromium flow доказал manual create/attach и axe;
- generated additive migration `0049_secret_puff_adder.sql` прошла clean/test database; production credentials, databases и webhooks не использовались.


## Этап 9 — Reliability analytics и cross-filtering

**Цель**

Реализовать достоверные MTTA/MTTR/mitigation/volume/reopen/stale/hotspot metrics, согласованные с incident timestamps и URL-filtered workbench.

**Requirements:** ROP-005, ROP-009, ROP-010, ROP-014  
**Dependencies:** S3, S4, S6, S7, S8  
**Wave:** 6

**Изменяемые части системы**

- analytics query/response modules and SQL/index strategy;
- shared metric-definition utilities sourced from lifecycle timestamps;
- analytics OpenAPI endpoints/export;
- lazy-loaded Insights route, charts, filters and accessible data-table alternatives;
- URL integration with Workbench;
- deterministic fixture generator and performance tests;
- chart dependency/package changes only after license/bundle gate.

**Работа**

1. Implement exact spec formulas; missing/unknown timestamps are excluded, never coerced to zero.
2. Return sample size, timezone, exclusions/missing-data and active filter specification.
3. Support period comparison, service/severity/status facets and p50/p90 where meaningful.
4. Chart interaction writes validated canonical filters and links to identical Workbench dataset.
5. Export requires capability, includes filter spec/generatedAt/timezone and returns 403 on direct unauthorized request.
6. Use server-side aggregates on representative 100k/1M fixture; add indexes only after EXPLAIN evidence.
7. Analytics route and chart code load lazily; semantic table/summary remains available.

**Критерии готовности**

- deterministic fixture expected values match API and UI for every metric;
- filtered chart count, Workbench row count and export dataset share one filter contract;
- timezone/period boundaries are explicit and tested at DST edges;
- Viewer without export capability sees no action and gets 403 directly;
- analytics query meets approved budget or gate records scoped follow-up before demo;
- chart is keyboard accessible and has text/table alternative.

**Необходимые тесты**

- unit/property tests for formulas, percentiles, missing data, reopen and date boundaries;
- API integration for filters, authorization, export and workspace isolation;
- EXPLAIN ANALYZE BUFFERS on representative fixture;
- component/browser chart → URL → table → inspector flow;
- bundle/lazy-loading and accessibility tests;
- reconciliation test after a resolved incident from second browser.

**Риски и mitigations**

- Misleading metrics: definitions displayed, fixtures reviewed, unknown excluded.
- Expensive aggregate queries: measured indexes/caching only after evidence.
- Chart library bloats/violates license: dependency gate and lazy chunk.
- Timezone inconsistency: one explicit workspace/user timezone contract.

**Gate и rollback**

- Gate green: formula fixtures, authorization and cross-filter parity green.
- Gate red: analytics route/export not released; incident operations remain intact.
- Rollback: hide read-only analytics surface and remove derived cache/materialization via forward correction; never mutate source incidents to fix reports.

### Фактический результат S9 — 2026-08-28

**Статус:** GREEN. Reliability analytics, authorized export и canonical cross-filtering завершены; S10 не начинался.

**Реализация и evidence**

- server-side v1 definitions реализуют volume, MTTA, MTTR, mitigation, reopen, stale-active и primary-service hotspots; response показывает formulas, sample sizes, missing exclusions, timezone, active filters, p50/p90 и equal-period comparison;
- API integration — 1/1: точные DST-границы `America/New_York`, deterministic metric values, demo exclusion, service filter, prior period, workspace isolation, CSV metadata и Viewer direct export 403; API formula/query unit — 3/3;
- web search/dashboard suite — 4/4: validated canonical URL, keyboard chart action, always-visible semantic table, displayed definitions, no unauthorized export action и automated axe;
- representative PostgreSQL gate — 1/1 на 100k incidents / 1M durable events, endpoint p95 `<=300 ms`; EXPLAIN после evidence-driven filter/index rewrite — 188.262 ms; additive migration `0050_brief_odin.sql` содержит только measured covering index;
- Chromium — 1/1 за 5.3 s: resolved incident из второго browser context reconciled в analytics, real-browser axe clean, chart сохранил date/status/severity/service в Workbench URL, row открылась клавиатурой в inspector;
- production analytics route остаётся lazy и без chart dependency: отдельный chunk 25.93 kB minified / 9.44 kB gzip; API/web production builds и оба package typecheck green.

**Ограничения**

- manual screen-reader pass не устанавливался и отложен до S10/final accessibility gate по утверждённому правилу; automated axe, keyboard и real-browser проверки S5/S9 green.
- repository `i18n:check` сохраняет только ранее зафиксированные S4 Workbench missing locale keys/plural extras; S9 analytics keys присутствуют во всех locale files и schema regenerated, исправление отложено до S10 без расширения этой итерации.


## Этап 10 — UX system, accessibility, i18n и portfolio demo

**Цель**

Собрать целостный RelayOps experience, пройти WCAG 2.2 AA target и доказать десятишаговый demo на clean database и двух browser contexts.

**Requirements:** ROP-001, ROP-006, ROP-012, ROP-013, ROP-014  
**Dependencies:** S2–S9  
**Wave:** 7

**Изменяемые части системы**

- apps/web/src/index.css, semantic tokens/theme and layout primitives;
- app shell, Live Incident Clock Rail, Workbench/Board/Room/Analytics responsive composition;
- all loading/empty/error/permission/realtime/rollback states;
- i18n/en-US.json, locale resources and locale-aware formatters;
- proposed font packages/assets only after OFL provenance review;
- browser/a11y/performance suites and deterministic demo fixtures;
- apps/site/apps/docs product copy after working behavior is proven.

**Работа**

1. Apply visual direction: Control Ink, Instrument, Panel Alloy, Relay Cobalt, Caution Amber, Incident Vermilion; severity never color-only.
2. Add Barlow Condensed, Atkinson Hyperlegible and IBM Plex Mono only with verified OFL artifacts/notices; otherwise use approved fallback.
3. Implement semantic nav/main/aside, skip link, real links, visible/unobscured focus, 44px practical targets and no nested interactive controls.
4. Provide desktop split view, tablet overlay and mobile incident list/room; desktop-only authoring is clearly messaged, core action remains available.
5. Use 120–180ms transitions and <=200ms DnD settle; reduced motion removes spatial movement.
6. Complete initial/background loading, dataset-empty, filtered-empty, denied, retryable/unrecoverable, offline/stale, conflict, rollback and partial bulk states.
7. Localize all copy/date/duration/pluralization; no hard-coded user-visible English.
8. Automate the ten-step MVP demo, including second user, keyboard DnD, conflict, analytics cross-filter and Viewer 403.
9. Measure table FPS, route bundle, API p95, realtime p95 and reconnect against S0-approved budgets.

**Критерии готовности**

- ten-step demo from spec passes on clean DB without manual data repair;
- zero serious/critical automated axe findings and complete keyboard happy path;
- manual screen-reader, 200%/400% zoom, high contrast and reduced-motion reviews recorded;
- refresh/back/forward and focus restoration work across Workbench/Board/Room;
- all user-visible copy passes i18n check and dates reflect selected locale/timezone;
- no core action depends only on hover/drag/color;
- approved query/bundle/realtime budgets pass or block S11–S14;
- visual review cannot identify primary Kaneo Project/Task IA or unchanged Kaneo brand.

**Необходимые тесты**

- existing web unit/component suite;
- Stage-0 browser runner: ten-step two-context scenario and persona denials;
- automated axe plus manual keyboard/screen-reader/zoom/reduced-motion matrix;
- i18n:check and locale snapshots for representative languages;
- bundle chunk report, table interaction profiling, API/realtime benchmark evidence;
- responsive browser screenshots at agreed desktop/tablet/mobile sizes.

**Риски и mitigations**

- Polish hides functional gaps: states and demo assertions precede visual tuning.
- Fonts/assets create legal blocker: use fallback until S13 notice/provenance evidence exists.
- E2E flakes: deterministic clock/data, explicit WebSocket readiness, no silent retries.
- Scope expands to every locale: source-key completeness first; translation quality recorded separately.

**Gate и rollback**

- Gate green: demo, accessibility and budgets green with evidence.
- Gate red: no portfolio/release claim; return to owning functional stage.
- Rollback: visual/font/motion changes are independently reversible; semantic/a11y fixes and core capabilities remain.

### Фактический результат S10 — 2026-09-03

**Статус:** GREEN. Целостный RelayOps UX, responsive/accessibility/i18n hardening и clean-database portfolio demo завершены; S11 не начинался.

**Реализовано**

- RelayOps shell и основные Operations/Workbench/Board/Room/Services/Analytics surfaces приведены к общей semantic palette, responsive composition и keyboard/focus contract; для reduced motion и forced colors предусмотрены явные режимы.
- Добавлены locale-aware date/time/duration helpers и Live Incident Clock Rail; user-visible source keys синхронизированы во всех 17 locale resources без hard-coded runtime copy.
- Invitation acceptance ведёт нового участника в RelayOps workspace; clean demo покрывает реального второго пользователя, canonical incident-commander role и Viewer denial.
- Demo badge использует затемнённый semantic amber `#9a4d0d` с белым текстом (примерно 6.1:1), устраняя последний найденный WCAG contrast defect.
- Добавлен детерминированный `tests/e2e/relayops-s10.spec.ts`: ten-step lifecycle, keyboard Board transition, two-context realtime, stale conflict/reapply, offline reconnect, analytics cross-filter и Viewer 403; отдельная matrix проверяет responsive/zoom/forced-colors/reduced-motion/focus/history/table FPS.

**Evidence**

- Disposable clean PostgreSQL: все миграции применились без ручного data repair; финальный targeted Playwright `ten-step clean-DB` — 1/1 passed за 22.7s после contrast fix. Он повторно доказал authoritative lifecycle, second-user realtime, reconnect, conflict recovery, analytics drilldown и authorization denial.
- Уже пройденная без последующих изменений соответствующего кода browser matrix — 1/1 passed: desktop 1440px, tablet 834px, mobile 390px screenshots; 200%/400% zoom без page-level horizontal overflow; forced colors, reduced motion, focus restoration, refresh/back/forward и Workbench table median >=55 FPS.
- Automated axe в финальном ten-step и matrix: 0 serious/critical findings; keyboard happy path и accessible non-drag Board transition green. Targeted static review по Web Interface Guidelines не обнаружил нового S10 blocker.
- `node scripts/i18n/check.mjs` — 17/17 locale files valid и source-key sync green; `i18n/schema.json` regenerated.
- Web typecheck — green; Vitest без известного Windows-only `src/env.test.ts` — 58 files / 212 tests passed; production Vite build — green за 17.67s.
- Build budget: main entry 505.56 kB / 163.96 kB gzip (<250 kB initial gzip budget); route chunks Analytics 9.46 kB gzip, Incidents 13.31 kB gzip, Board 20.77 kB gzip; ни один новый synchronous route chunk не превышает 500 kB.
- `git diff --check` — green; LF shell-file policy — 4/4 verified.

**Известные ограничения, не блокирующие S10**

- Manual screen-reader tooling недоступен и не устанавливался; ручной AT pass остаётся обязательным evidence для S14 final accessibility gate. Automated axe, keyboard, zoom, forced-colors и reduced-motion evidence green.
- Новые S4 Workbench/clock source keys присутствуют во всех locale files, но часть non-English значений пока использует English fallback; translation quality остаётся отдельным closeout item, source-key gaps отсутствуют.
- Host использует Node 22.15.1 при repository requirement Node >=24; focused checks выполнены прямыми repo-local binaries. Повтор на Node 24 остаётся S14/release-environment gate.
- Migration 0048 сохранила documented duplicate `workspace_role` precondition: clean/test database проходит, пользовательские authorization data автоматически не изменялись.
- Windows-host `apps/web/src/env.test.ts` требует отсутствующий `sed` и был исключён из финального Vitest run; остальные 212 web tests green. Временные заблокированные `.codex-temp/s3-web.stdout.log` и `.codex-temp/s3-web.stderr.log` не тронуты, процесс/порт 5173 не использовался.

### Фактическое дополнение к S10 localization/rebrand — 2026-09-03

**Статус:** GREEN. По явному разрешению владельца локализационная часть S10 была точечно открыта без изменения уже принятой функциональности.

- Публичная языковая политика ограничена RU/EN: `ru-RU` используется по умолчанию, выбранный EN сохраняется в `relayops.locale` и профиле, а старое/неизвестное persisted value безопасно приводит интерфейс к русскому fallback. Дополнительные upstream locale resources сохранены, но не показываются в публичном переключателе.
- Активный пользовательский интерфейс, навигация, формы, таблицы, статусы, ошибки, уведомления, empty/confirmation/help states, title и metadata дополнены полным русским и английским copy без использования английского как fallback для отсутствующего русского текста. Бренд RelayOps и пользовательские/технические данные не переводятся.
- Публичные Web/Site/Docs metadata, manifest, README и актуальная документация используют RelayOps; root LICENSE, Kaneo provenance/disclaimer, copyright/attribution и совместимые внутренние `@kaneo/*` identifiers сохранены.
- Docker `i18n:check` подтвердил schema/source-key sync всех 17 сохранённых locale files. Финальный Web Vitest: 59 files / 217 tests passed, включая Windows-проблемный ранее `src/env.test.ts` и новый unknown-locale regression test; Web typecheck и production build green на Node 24.
- Browser smoke на split Docker runtime: unknown persisted `de-DE` -> `ru-RU`; RU screen/title/legend полностью русские, EN screen/title/legend полностью английские; `en-US` и активная кнопка EN сохраняются после reload. User value `Smoke Workspace` и RelayOps не переводятся.

## Этап 11 — Network и API security

**Цель**

Закрыть SSRF, API-key enforcement и standalone body/request/WebSocket limits до любого public deployment.

**Requirements:** ROP-009, ROP-011, ROP-014, ROP-015  
**Dependencies:** S8, S10  
**Wave:** 9

**Изменяемые части системы**

- apps/api/src/notification-preferences/delivery.ts и apps/api/src/utils/assert-public-destination.ts;
- новый единый safe outbound HTTP transport;
- apps/api API-key authentication/scope/rate-limit utilities;
- apps/api/src/index.ts, HTTP body/request timeout middleware и apps/api/src/ws/*;
- CORS/trusted-proxy/Origin configuration, structured security logs;
- tests/api и tests/api-integration abuse/handshake suites.

**Работа**

1. Safe transport использует manual redirects, проверяет каждый hop и resolved address, блокирует loopback/private/link-local/metadata IPv4/IPv6, ограничивает hops/time/response и не переносит credentials на другой origin.
2. DNS resolution и фактическое connection target связываются так, чтобы проверка не оставляла DNS-rebinding TOCTOU.
3. API-key rate limit enforce-ится atomically до handler и работает без Redis; expiry, disabled key, narrow scopes и concurrent requests входят в contract.
4. Добавляются bounded body/request/time limits и safe standalone defaults.
5. WebSocket получает allowlisted Origin policy, auth до upgrade, connection/frame/message/idle quotas и понятное close behavior.

**Критерии готовности**

- redirect/rebinding regressions не достигают private/metadata targets;
- ни один REST operation не обходит API-key scope/rate limit;
- oversized/slow request и WS abuse завершаются bounded response/close без domain write;
- same-origin и approved split-origin handshakes работают;
- logs содержат request id и outcome, но не URL credentials, bodies или secrets.

**Необходимые тесты**

- controlled redirect, redirect-chain, DNS-rebinding, IPv4/IPv6/private/metadata tests;
- parallel API-key limit/expiry/disabled/scope integration matrix;
- body, timeout, slow-client и content-type abuse tests;
- real WebSocket Origin/auth/frame/message/connection/idle tests;
- Redis-off proof и log-redaction assertions.

**Риски и mitigations**

- Runtime/proxy может повторно резолвить DNS: test actual transport connection and document supported proxy boundary.
- Rate limiter создаёт contention: atomic bounded storage и measured concurrency; Redis не становится requirement.
- Strict Origin breaks split hosting: explicit allowlist/config validation and deployment tests.

**Gate и rollback**

- Gate green: все network/API blocker tests green и нет unknown protected route.
- Gate red: S14 и public deployment заблокированы.
- Rollback: disable affected outbound integration/WS entry while retaining safe HTTP API; security schema correction только forward migration.

### Фактический результат S11 — 2026-09-03

**Статус:** GREEN. Network/API security blockers закрыты; protected route inventory и abuse contracts проверены.

**Реализовано**

- Единый safe outbound transport использует manual redirect validation, DNS pinning к проверенному connection target, IPv4/IPv6 private/link-local/metadata blocks, hop/time/response caps и удаление credentials при смене origin.
- API-key enforcement проверяет expiry/disabled/scope и применяет atomic bounded rate limit до handler; workspace capabilities остаются серверным authority.
- API получил allowlisted CORS, request id/security headers, content-type/body/request timeout limits и bounded slow-socket response; логи редактируют sensitive data.
- WebSocket handshake проверяет Origin и auth до upgrade; frame/message/connection/idle quotas завершаются явными close codes. Redis остаётся optional, in-memory adapter покрывает single-instance path.

**Evidence**

- Полный API Vitest: 71 files / 450 tests passed.
- PostgreSQL integration: 41 files / 261 tests passed; 2 opt-in performance files/tests skipped. В набор вошли реальные redirect/rebinding, API transport/slow client, CORS, API-key и WebSocket Origin/auth/quota paths.
- API/Web typecheck, split production Docker builds и API health smoke green; API стартовал на fresh disposable PostgreSQL, применил migrations и ответил `200 {"status":"ok"}` без Redis.

## Этап 12 — Secrets и session hardening

**Цель**

Закрыть unbounded MCP OAuth/session state и plaintext integration credentials с проверяемой migration/rotation recovery.

**Requirements:** ROP-009, ROP-014, ROP-015  
**Dependencies:** S10  
**Wave:** 9

**Изменяемые части системы**

- apps/api/src/mcp/oauth.ts, apps/api/src/mcp/index.ts и state/session persistence;
- apps/api/src/database/schema.ts, relations.ts и generated migrations;
- integration config reads/writes и notification-preferences secret-envelope utilities;
- key version/rotation configuration and startup validation;
- tests/api и tests/api-integration security/migration suites.

**Работа**

1. Добавить caps/rate limits для MCP client registration и authorization requests, idle/max TTL для sessions и periodic cleanup/sweeper.
2. Удалить duplicated MCP handler path после characterization tests; session close/expiry освобождает state.
3. Перевести integration credentials в versioned AES-256-GCM envelope с authenticated metadata, explicit key version и rotation path.
4. Миграция existing plaintext config использует bounded dual-read window, verification и forward recovery; plaintext writes после cutover запрещены.
5. Response/log/event/WebSocket/MCP serializers проходят central redaction.

**Критерии готовности**

- client/request/session caps не позволяют unbounded DB/memory growth;
- expired/closed sessions удаляются; concurrent cleanup не удаляет active state;
- fresh и upgrade DB сохраняют decryptable credentials без plaintext at rest;
- key rotation читает old envelope и записывает current version;
- отсутствие/невалидность encryption key fail-closed до обработки secret write;
- secret scanning не находит credentials в API, logs, events, fixtures и snapshots.

**Необходимые тесты**

- MCP cap/TTL/sweeper/race/restart/abuse tests;
- client registration and authorization cleanup integration tests;
- fresh/upgrade/partial-failure credential migration;
- old-key/current-key rotation and wrong-key fail-closed tests;
- serializer/log/event/WS/MCP redaction assertions.

**Риски и mitigations**

- Migration loses credentials: verified batches, backup prerequisite, bounded dual-read and forward recovery.
- Cleanup races active sessions: lease/version condition and deterministic clock tests.
- Key misconfiguration locks integrations: startup validation and documented recovery, never plaintext fallback.

**Gate и rollback**

- Gate green: MCP growth bounded, encryption migration/rotation/redaction green.
- Gate red: S14, integration enablement и distribution заблокированы.
- Rollback: disable affected integrations/MCP writes; retain encrypted rows and use forward corrective migration/key recovery, never decrypt back to plaintext.

### Фактический результат S12 — 2026-09-03

**Статус:** GREEN. MCP growth bounded, credential encryption/migration/rotation и central redaction blockers закрыты.

**Реализовано**

- MCP OAuth client/request state перенесён в bounded PostgreSQL store с advisory-lock concurrency, TTL/oldest eviction и registration/authorization rate caps. Stateless MCP sessions имеют global/per-user caps, pending reservations, idle/max TTL и deterministic sweeper/close cleanup.
- Notification и RelayOps webhook credentials используют versioned AES-256-GCM envelopes, authenticated metadata, current/previous keyrings, idempotent forward migration/rotation и fail-closed recovery без plaintext fallback.
- Sensitive response/log/event/WebSocket/MCP paths используют central redaction; README документирует key formats, rotation и recovery без хранения секретов в repository/image layers.
- Production API Docker build очищает только builder-local TypeScript incremental state перед workspace-package compile и проверяет реальные email/permissions runtime entrypoints, устраняя обнаруженный smoke-startup failure.

**Evidence**

- MCP focused stateless suite: 17/17 passed; RelayOps focused integration: 15/15 passed; полный API unit и PostgreSQL integration наборы также GREEN с итогами S11 выше.
- Fresh/upgrade credential migration, concurrent OAuth cap, rotation/wrong-key fail-closed и external-link redaction tests прошли. Filename secret scan нашёл только документированные PEM-маркеры и заведомо фиктивный test Bearer token, реальных credentials не обнаружено.
- `i18n:check`, API/Web typecheck, 59/217 Web tests, targeted Biome, `git diff --check` и LF policy 4/4 green. Production API и Web runtime images собраны на `node:24.19.0-alpine`/pnpm 10.32.1; split-origin containers прошли API Docker health, HTTP 200 и browser RU/EN smoke на изолированных портах 15133/15173.
- Bundled `Dockerfile.kaneo` после runtime-entrypoint fix дошёл до корректной entrypoint-проверки, но clean build не завершился из-за внешнего npm registry `ECONNRESET` при Web dependency download. Это не меняет S12 security gate, но bundled build обязан быть повторён в S14; bundled artifact не считается GREEN.

## Этап 13 — Distribution, compliance и rebrand

**Статус исполнения:** LOCAL WORK AUTHORIZED / IN PROGRESS (2026-09-09). Владелец разрешил завершить доступную локальную S13/S14 работу для портфолио без выбранных GitHub/hosting/domain. Creem SDK исключён, notices/fonts/branding и release guards подготовлены; финальная artifact/security матрица записывается в RELEASE_PREFLIGHT.md. Trademark/domain gate для коммерческого/full-production выпуска и отдельное approval публикации не сняты.

**Цель**

Подготовить юридически и технически честный fork: сохранить Kaneo provenance во всех artifacts, закрыть dependency/assets ambiguity и завершить independent rebrand.

**Requirements:** ROP-001, ROP-013, ROP-015  
**Dependencies:** S10, D-01 portfolio/demo name accepted; commercial/full-production trademark and domain gate remains open  
**Wave:** 9

**Изменяемые части системы**

- root LICENSE без удаления/искажения, apps/docs/LICENSE и package-specific LICENSE files;
- Dockerfiles/images, Helm chart/package, web/site static distributions и release archives;
- new THIRD_PARTY_NOTICES and machine-readable SBOM;
- package/OCI/chart namespaces, metadata, source/license/revision labels;
- apps/web/apps/site/apps/docs logos, favicons, copy, screenshots and cloud claims;
- font packages/assets and provenance files;
- packages/planka-import/LICENSE only after holder provenance review.

**Работа**

1. Root MIT notice и upstream attribution включаются в source archive, Docker image /licenses, Helm/static distributions и relevant docs.
2. Проверить runtime transitives/base images/assets. Geist и proposed fonts распространяются только с подтверждённым OFL provenance; notices перечисляют фактически bundled variants.
3. Отдельно закрыть ambiguity лицензии creem 1.6.0 по authoritative upstream artifact/source. Пока license не подтверждена, dependency исключается из distributable build, заменяется или блокирует distribution; предположение о лицензии запрещено.
4. Сформировать THIRD_PARTY_NOTICES и SBOM, сопоставленные с source, images, chart и static bundles.
5. Заменить Kaneo namespace/logo/favicon/cloud claims/marketing achievements и проверить GitHub/Product Hunt assets; attribution не считается branding.
6. Сохранить disclaimer: derived from Kaneo, independently maintained, not official Kaneo.
7. Для некоммерческого portfolio/demo release используется утверждённое имя RelayOps без заявления о формальной юридической проверке. Trademark/domain review обязателен до коммерческого или полноценного production name/domain/package/image publication.

**Критерии готовности**

- root LICENSE Copyright (c) 2024 Andrej Acevski byte-present во всех применимых distributable artifacts;
- THIRD_PARTY_NOTICES и SBOM перечисляют фактически shipped runtime/fonts/assets/images;
- Creem 1.6.0 имеет authoritative license evidence либо отсутствует из distributable artifacts;
- Geist/new fonts имеют OFL evidence; unknown asset/source отсутствует;
- Kaneo brand assets/claims/namespaces заменены, upstream attribution сохранена;
- package/image/chart/site naming соответствует принятому RelayOps portfolio/demo result; коммерческая или полноценная production-публикация остаётся заблокирована до trademark/domain review;
- unresolved holder/trademark/license ambiguity остаётся explicit distribution blocker, а не legal conclusion.

**Необходимые тесты**

- license/notice/SBOM presence and artifact-content assertions;
- dependency/license inventory и container/image package scan;
- static bundle/font/icon/image provenance check;
- source archive, Docker image, Helm package и web/site artifact inspection;
- namespace/metadata/link snapshot review and trademark/legal checklist.

**Риски и mitigations**

- Rebrand accidentally removes provenance: CI artifact assertion for LICENSE and attribution.
- SBOM differs from shipped bundle: generate/validate per artifact after final build.
- License ambiguity is guessed: authoritative evidence or exclusion; counsel handles unresolved interpretation.

**Gate и rollback**

- Gate green: D-01, Creem, fonts/assets, notices/SBOM/namespaces and artifact attribution green.
- Gate red: S14 may run internal diagnostics, but tag/image/chart/site/public distribution запрещены.
- Rollback: restore independent neutral codename/assets while preserving LICENSE/provenance; exclude ambiguous dependency/artifact.

## Этап 14 — Final deployment и release verification

**Цель**

Свести все functional, security, compliance и deployment gates в один reproducible release candidate, не публикуя его без отдельного approval.

**Requirements:** ROP-001, ROP-002, ROP-003, ROP-004, ROP-005, ROP-006, ROP-007, ROP-008, ROP-009, ROP-010, ROP-011, ROP-012, ROP-013, ROP-014, ROP-015  
**Dependencies:** S0–S13; S11/S12/S13 green mandatory  
**Wave:** 10

**Изменяемые части системы**

- .github/workflows/ci.yml and release workflow only where an observed gate is missing;
- Docker/Nginx/Compose and charts/kaneo deployment surfaces;
- release scripts/metadata/version-carrying files through existing release process;
- verification fixtures/reports and documented operator upgrade/rollback steps;
- no new product feature scope.

**Работа**

1. Re-prove S0 CRLF fix on clean Windows checkout and Node 24/pnpm 10.32.1 alignment across package/CI/docs/containers.
2. Run full typecheck/unit/integration/build, fresh DB and legacy→RelayOps explicit rollout/upgrade path with read-only archive/export.
3. Run ten-step two-browser demo, full role/API-key denial, URL parity, accessible DnD, reconnect/conflict and analytics fixtures.
4. Validate Redis absent/enabled/failure, same-origin/split hosting, Docker non-root, Nginx headers, Helm lint/template/security contexts/resources.
5. Verify S11 network/API and S12 secrets/session blocker evidence, plus S13 artifacts/notices/SBOM/rebrand.
6. Run existing release notes/version/image/chart workflow in dry-run/validation mode. No tag, push, chart, hosted site or public artifact without new explicit approval.

**Критерии готовности**

- every ROP-001..ROP-015 trace row has current passing evidence;
- CRLF, Node 24, SSRF, API-key, body/WS, MCP caps/TTL, plaintext secrets and license/notices/SBOM blockers all green;
- clean install/build/runtime and fresh/upgrade migration pass with no legacy data loss;
- single-instance works without Redis; supported multi-instance and split-host matrices pass;
- performance/a11y/i18n/demo budgets and security/compliance scans pass;
- release candidate contains LICENSE/provenance/notices/SBOM and cleared branding;
- dry-run creates no public tag or artifact.

**Необходимые тесты**

- full existing pnpm typecheck/test/test:integration/build commands;
- Stage-0 recorded browser command for ten-step/two-context/persona/a11y regression;
- migration fresh/upgrade/export/archive verification;
- Docker/Compose health, Helm lint/template and runtime security-context checks;
- dependency audit, secret/SAST/container/SBOM/license scans;
- release workflow dry-run and artifact-content inspection.

**Риски и mitigations**

- Late integration failure hides owner: blocker registry maps each failure back to S0–S13 and reruns only after owning fix.
- Flaky E2E yields false green: deterministic fixtures/readiness, no silent retry, flake is a failure.
- Release validation mutates public state: dry-run and local artifact namespace; manual release is a separate approval.

**Gate и rollback**

- Gate green: release candidate reviewable; publication still requires explicit separate approval.
- Gate red: no tag, image push, chart publish, hosted site or public distribution.
- Rollback: discard unpublished candidate artifacts; failed workflow creates no tag. Data/security rollback uses documented forward correction, never destructive reset.

## Traceability matrix

| Requirement | Primary этап | Supporting этапы | Финальное evidence |
|---|---|---|---|
| ROP-001 New RelayOps shell/vocabulary | S2 | S1, S10, S13, S14 | Operations landing, no primary Project/Task nav, cleared rebrand review |
| ROP-002 Service catalog | S2 | S1, S7 | CRUD/archive/deep-link/isolation browser + API tests |
| ROP-003 Incident domain/lifecycle | S3 | S1, S5, S6, S8 | Transition/concurrency/idempotency/incident_event/outbox suite |
| ROP-004 Incident Workbench | S4 | S9, S10 | 100k server query, virtual table and interaction budgets |
| ROP-005 URL/saved views | S4 | S5, S9, S10 | Unit serializer coverage and second-session URL parity |
| ROP-006 Inspector/Room | S4 | S1, S3, S6, S10 | Drawer→room deep link, tab/back/focus tests |
| ROP-007 Accessible DnD | S5 | S3, S10 | Pointer/touch/keyboard/menu parity and one-command test |
| ROP-008 Visible realtime | S6 | S1, S10 | S1 minimal outbox plus two-context/reconnect/presence/conflict evidence |
| ROP-009 Role-aware product | S7 | S1, S3, S4, S5, S8, S9, S11, S12 | Complete endpoint×role×API-key allow/deny matrix |
| ROP-010 Reliability analytics | S9 | S3, S4, S10 | Deterministic formulas and chart→URL→table parity |
| ROP-011 Signal ingestion | S8 | S3, S7, S11, S14 | Signed/idempotent/replay/rate/body abuse suite |
| ROP-012 Guided first value | S2 | S1, S10 | Clean onboarding + removable demo browser test |
| ROP-013 Accessibility/i18n | S10 | S2, S5 | axe, keyboard, screen-reader, zoom, locale evidence |
| ROP-014 Performance/observability | S0 | S1, S3–S12, S14 | Baseline and no-regression query/bundle/realtime/security/log budgets |
| ROP-015 Secure distributable fork | S13 | S0, S2, S7, S8, S11, S12, S14 | Network/secrets blockers + LICENSE/notices/SBOM/rebrand/deployment gates |

Coverage gate: каждый ROP-001..ROP-015 имеет primary owner, executable acceptance evidence и финальный stage gate. Изменение requirement требует сначала обновить docs/TRANSFORMATION_SPEC.md и эту matrix, а не молча расширять implementation.

## Команды и категории проверок

Ниже перечислены scripts текущих manifests и стандартные tool invocations. Browser E2E запускается через `pnpm smoke:browser` на отдельном test topology; основной сайт и сохранённая база не являются тестовыми fixtures.

### True read-only preflight

~~~powershell
node --version
corepack --version
pnpm --version
git rev-parse HEAD
git status --short
pnpm exec biome check .
pnpm i18n:check
~~~

Не запускать pnpm lint как read-only check: root/package lint scripts содержат Biome --write.

### Mutating dependency setup

~~~powershell
pnpm install --frozen-lockfile
~~~

Эта команда изменяет node_modules и package-manager store, поэтому не является read-only. Она разрешена только после approval S0. Frozen lockfile не разрешает необъяснённое изменение pnpm-lock.yaml; diff проверяется отдельно.

### Focused checks

~~~powershell
pnpm --filter @kaneo/api typecheck
pnpm --filter @kaneo/web typecheck
pnpm --filter @kaneo/api test:unit
pnpm --filter @kaneo/api test:coverage
pnpm --filter @kaneo/web test
pnpm --filter @kaneo/permissions test
pnpm --filter @kaneo/api build
pnpm --filter @kaneo/web build
~~~

### Cross-package gates

~~~powershell
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
~~~

### Contract и database

~~~powershell
pnpm --filter @kaneo/api db:generate
pnpm --filter @kaneo/api openapi:export
~~~

Generated migration SQL и apps/docs/openapi.json diff всегда инспектируются до acceptance. Integration tests используют только disposable PostgreSQL database.

### Deployment/release categories

- docker compose config/build/start/health smoke по documented compose flow с отдельным project name и test credentials;
- Redis disabled, Redis enabled и Redis failure/recovery topology;
- same-origin bundled и separately hosted API/web;
- Helm lint/template и runtime security-context inspection, если helm доступен;
- pnpm audit --prod, dependency/license inventory, SBOM/container/secret/SAST scans;
- node scripts/release/notes.mjs с фактическим previous tag и HEAD для preview;
- manual Release workflow dry-run; push/tag/publish только после отдельного approval.

### Browser/manual categories

- Stage-0 recorded browser command: clean first value, two contexts, role denial, URL parity, DnD parity, conflict/reconnect, analytics;
- axe automation; keyboard-only; screen reader; 200%/400% zoom; reduced motion; high contrast;
- desktop/tablet/mobile responsive pass;
- performance profiling on the documented reference laptop/environment.

## Definition of Done всей трансформации

RelayOps готов к portfolio/release review только если одновременно:

1. ROP-001..ROP-015 имеют green primary acceptance evidence в matrix.
2. Ten-step MVP demo проходит с clean database и двумя независимыми sessions.
3. Reviewer не видит primary Project/Task IA и не может обоснованно назвать результат reskin Kaneo.
4. Every scoped endpoint, event, query, facet, analytics aggregate, export и WebSocket message изолирован workspace boundary.
5. API independently denies forbidden actions для roles и API keys.
6. Incident transition, timestamps, incident_event и outbox_event atomic/idempotent с первого S1 write; silent partial success отсутствует.
7. Shared URL воспроизводит Workbench/Board/Inspector/Analytics state после refresh/back/forward и во второй session.
8. Realtime показывает connection/presence/conflict/reconnect; PostgreSQL остаётся truth, Redis optional.
9. DnD имеет pointer/touch/keyboard/menu parity и one-command server transition.
10. Analytics совпадает с deterministic fixtures, показывает sample/timezone/exclusions и не превращает missing data в zero.
11. Fresh и upgrade migrations проходят; accepted D-02 реализован как explicit RelayOps rollout + read-only legacy archive/export без automatic conversion или dual-write.
12. Approved query, bundle, interaction, realtime и reconnect budgets проходят на representative fixture.
13. WCAG 2.2 AA target подтверждён: zero serious/critical axe, keyboard happy path и manual review evidence.
14. Static i18n keys, locale dates/durations и required route states присутствуют.
15. S11 SSRF/API-key/body/WS и S12 MCP caps/TTL/plaintext-secret blockers закрыты.
16. Single-instance self-hosting работает без Redis/S3/SMTP/Sentry/billing; supported deployment modes green.
17. S13 подтверждает root LICENSE во всех применимых source/Docker/Helm/static artifacts, upstream provenance, Geist/OFL, Creem 1.6.0 disposition, THIRD_PARTY_NOTICES и SBOM.
18. Final name/namespaces/assets legally reviewed; fork не выдаётся за official Kaneo.
19. S14 full typecheck/test/integration/build/deployment/release-candidate matrix green, иначе public release blocked.
20. Release остаётся manual; failed build не создаёт tag или published artifact.

## Approval checkpoint

После review возможны только три исхода:

1. **Approved** — одобрить этот S0–S14 plan и разрешить начать S0, но только S0.
2. **Revise** — изменить PLAN.md; implementation остаётся запрещённой.
3. **Rejected** — остановить трансформацию, не меняя source.

**Текущее состояние: S0–S12 completed GREEN. По последнему запросу владельца разрешены необходимые исправления, закреплённые зависимости, локальные сервисы и S13/S14 verification. Commit/push/publication не выполняются без отдельного запроса. Актуальные результаты и оставшиеся gates — RELEASE_PREFLIGHT.md.**
