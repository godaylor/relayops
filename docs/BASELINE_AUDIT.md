# Baseline-аудит Kaneo

**Дата фиксации:** 2026-08-27  
**Рабочая папка baseline-аудита:** `01-kaneo-transform` (историческое имя; runtime и tooling не зависят от абсолютного пути)  
**Ветка / commit:** `main` / `8100f3b1ab47a0b49c7ac6deabe64eb0d1d9970d`  
**Версия:** `2.22.0`  
**Статус документа:** S0 execution baseline; gate green

## Итог

Kaneo — зрелый modular monolith, а не минимальный Kanban-клон. В репозитории уже есть React SPA, Hono API, PostgreSQL, Better Auth, granular RBAC, OpenAPI/typed client, события, WebSockets, optional Redis, несколько представлений задач, интеграции, MCP, Docker и Helm.

S0 устранил воспроизводимый CRLF blocker и выровнял toolchain на Node `24.19.0` / pnpm `10.32.1`. Production API и web images собираются штатными Dockerfiles, clean PostgreSQL получает все 45 миграций, API и web стартуют через Compose, а минимальный Chromium journey проходит без обхода entrypoint.

Состояние запуска:

| Проверка | Результат |
|---|---|
| Host-native `pnpm dev` | Не используется для gate: host Node `22.15.1`; exact toolchain запущен в Linux container |
| Compose config | Успешно валидирован |
| API production build | Успешно |
| Web production build | Успешно |
| Fresh PostgreSQL migrations | Успешно |
| API runtime health | `200`, `{"status":"ok"}` |
| Web runtime через штатный entrypoint | Успешно, `/` вернул `200`, 8300 bytes |
| Browser smoke | `pnpm smoke:browser`: 1 passed, signup → workspace → project → task |

### S0 execution record

Проверки выполнены 2026-08-27 на Windows host с Docker Desktop/WSL2 Linux containers. Host Node не изменялся; reproducible gate использовал Node `24.19.0` и pnpm `10.32.1`, совпадающие с package contract, CI и Dockerfiles.

| Проверка | Фактический результат |
|---|---|
| LF characterization | 4 tracked `*.sh` имеют `i/lf w/lf attr/text eol=lf`; `pnpm check:line-endings` green |
| Read-only Biome | 1334 files checked, 0 errors; 71 existing warnings и 2 infos не блокируют CI |
| i18n | Все locales соответствуют `en-US` |
| Typecheck | 7/7 workspace tasks green, 8.752 s |
| Unit tests | 123 files, 656 tests green, 9.166 s |
| PostgreSQL integration | 33 files, 224 tests green, 113.18 s |
| Production build | 7/7 workspace tasks green, 13.266 s; web build 11.89 s |
| Drizzle drift | 37 tables; `No schema changes, nothing to migrate`; migration hash unchanged |
| Fresh DB startup | 45 migrations applied; API container healthy |
| OpenAPI export | Semantic diff отсутствует; hash различается только из-за CRLF/LF serialization |
| Compose smoke | PostgreSQL/API healthy, web running; health/config/OpenAPI/web root return 200 |
| Browser smoke | 1 Chromium test passed in 4.7 s, journey itself 4.1 s |
| LICENSE | Working-tree blob равен `HEAD:LICENSE` (`ee7aa902...`) |

Из обязательных S0 checks не пропущено ничего. Redis multi-instance, production-sized fixtures, realtime propagation и accessibility conformance не входят в этот baseline smoke и остаются gates соответствующих последующих этапов.

## Метод аудита

Исследование было разделено на четыре независимые роли:

1. архитектура, стек, frontend/backend, API, БД и зависимости;
2. продукт, user journeys и UI/UX;
3. тесты, безопасность, performance, accessibility и технический долг;
4. лицензирование, third-party components, assets и границы распространения.

Среда допускала только три прямых дочерних identity у root. После первичного license pass роль №4 была отдельно выполнена dedicated nested subagent лицензирования, созданным quality-аудитором; именно его независимый отчёт синтезирован в финальный baseline. Таким образом, все четыре исследовательские роли завершены, хотя четвёртый агент находился не среди прямых children root.

После статических отчётов результаты были сверены командами в репозитории и изолированным Docker smoke-run. Использовались только тестовые credentials и отдельный Compose project `kaneo-baseline-codex`. Созданные контейнеры, сеть, volume, images и временные env/override-файлы удалены.

## Воспроизводимый baseline

### Репозиторий

| Параметр | Значение |
|---|---|
| Branch | `main`, tracking `origin/main` |
| Commit | `8100f3b1ab47a0b49c7ac6deabe64eb0d1d9970d` |
| Commit date | `2026-08-26T02:59:13Z` |
| Root version | `2.22.0` |
| Package manager | `pnpm@10.32.1` |
| Node engine | `>=24.0.0` |
| Workspace | `apps/**`, `packages/**` |
| SQL migrations | 45 files in `apps/api/drizzle` |
| Frontend route files | 51 `.tsx` files in `apps/web/src/routes` |
| Test files | 156 `*.test.*` / `*.spec.*` files |
| Committed OpenAPI snapshot | OpenAPI 3.1.0; 111 paths; 150 operations; info version `1.0.0` |

### Host environment

| Инструмент / artifact | Состояние |
|---|---|
| Node | `v22.15.1` — ниже project engine |
| Corepack | `0.32.0` |
| pnpm | Не найден в PATH |
| Docker | `29.6.2` |
| Docker Compose | `v5.3.1` |
| `node_modules` | Отсутствует |
| `.env` | Отсутствует |
| `apps/api/dist` | Отсутствует |
| `apps/web/dist` | Отсутствует |

Корневой `AGENTS.md` до аудита указывал Node `20.19+`, но `package.json`, CI, Dockerfiles и `CONTRIBUTING.md` требуют Node 24. Источником истины следует считать root `package.json`.

## Smoke-run: что именно проверено

### Подготовка

- Compose-конфигурация прошла `docker compose ... config --quiet`.
- Использовались `apps/api/Dockerfile`, `apps/web/Dockerfile` и `compose.local.yml`.
- PostgreSQL был доступен только во внутренней Docker network; существующие host listeners не затрагивались.
- Redis, SMTP, OAuth providers, S3, Sentry и billing не включались.

### Build

API image:

- Node base image: `24.19.0-alpine`;
- frozen lockfile принят pnpm `10.32.1`;
- `@kaneo/email` и `@kaneo/permissions` собраны;
- API bundle `dist/index.js`: около 1.5 MB;
- esbuild завершился успешно.

Web image:

- Vite `8.2.1` обработал 7534 modules;
- production build завершился примерно за 15.25 s после установки зависимостей;
- `index.html`: 8.30 kB;
- основной CSS chunk: 300.62 kB, gzip 39.54 kB;
- build предупредил о chunks больше 500 kB, broken Tailwind sourcemap и будущей несовместимости native Vite config loader.

Крупные lazy chunks включают `comment-editor` около 807 kB, отдельные syntax/diagram chunks около 600–790 kB и основной `index` chunk около 503 kB. Это не равно initial transfer целиком, но требует route-level bundle budget и проверки фактического loading waterfall.

### API runtime

Fresh database startup прошёл:

- legacy compatibility checks;
- 45 Drizzle migrations;
- post-migration helpers;
- plugin initialization;
- scheduler initialization;
- WebSockets через `InMemoryBroadcastAdapter`.

Наблюдаемые ответы:

| Endpoint | Status | Content type / size |
|---|---:|---|
| `http://127.0.0.1:1337/api/health` | 200 | JSON, 15 bytes |
| `http://127.0.0.1:1337/api/config` | 200 | JSON, 386 bytes |
| `http://127.0.0.1:1337/api/openapi` | 200 | JSON, 171548 bytes |

Warnings о незаполненных GitHub/Google/Discord OAuth credentials ожидаемы для self-hosted smoke-конфигурации.

### Web runtime blocker и S0 resolution

`apps/web/Dockerfile` копирует `apps/web/env.sh` в `/docker-entrypoint.d/env.sh` и делает файл executable. В текущем Windows worktree:

```text
git ls-files --eol apps/web/env.sh
i/lf    w/crlf  attr/    apps/web/env.sh
```

Первые байты файла содержат `23 21 2F 62 69 6E 2F 73 68 0D 0A`, то есть shebang оканчивается `CRLF`. В Alpine это интерпретируется как путь `/bin/sh\r`, и nginx entrypoint сообщает:

```text
/docker-entrypoint.sh: line 31: /docker-entrypoint.d/env.sh: not found
```

До S0 контейнер входил в restart-loop с exit code `127`. S0 добавил `*.sh text eol=lf`, нормализовал четыре tracked shell scripts и добавил CI byte-level characterization check. Штатный `/docker-entrypoint.d/env.sh` теперь выполняется, подставляет `KANEO_API_URL`/`KANEO_CLIENT_URL`, после чего nginx стабильно отдаёт `200`.

Диагностический запуск того же web image напрямую через nginx вернул `200` для `/`, что подтверждает наличие собранных static assets. Он намеренно обходил environment substitution; поэтому ответы `/api/*`, полученные через этот обход, не являются доказательством end-to-end proxying. В separate-host mode frontend должен получить явный `KANEO_API_URL=http://localhost:1337`; `apps/web/nginx.conf` сам API не проксирует.

### Итог запуска

Правильная формулировка baseline:

> S0 baseline builds and tests on Node 24.19.0/pnpm 10.32.1, migrates a clean PostgreSQL database, starts the stock API/web Compose flow from the Windows checkout, and passes the recorded minimal browser journey.

## Архитектурный baseline

### System map

| Surface | Назначение | Ключевые пути |
|---|---|---|
| API | Domain behavior, auth, RBAC, OpenAPI, integrations, events, WebSockets | `apps/api/src/index.ts`, `apps/api/src/openapi.ts` |
| Web | React SPA, routing, server state, views, realtime cache | `apps/web/src/main.tsx`, `apps/web/src/routes`, `apps/web/src/hooks` |
| Site | Public Next.js site | `apps/site` |
| Docs | Product/API docs and committed OpenAPI snapshot | `apps/docs` |
| Typed client | Hono RPC client and URL helpers | `packages/libs/src/hono.ts` |
| Permissions | Canonical permission vocabulary and built-in roles | `packages/permissions/src/index.ts` |
| MCP | Published stdio MCP package | `packages/mcp` |
| Email | SMTP and React Email templates | `packages/email` |
| Import | Planka migration CLI | `packages/planka-import` |
| Deployment | Docker, Compose, Helm | `Dockerfile.kaneo`, `compose*.yml`, `charts/kaneo` |

API является modular monolith с вертикальными feature slices. Типичный feature содержит `index.ts`, `schema.ts`, `response.ts` и `controllers/*`. Handlers остаются тонкими; domain logic и Drizzle queries находятся в controllers.

### Request and realtime flow

```text
React component
  -> TanStack mutation/query hook
  -> typed fetcher
  -> @kaneo/libs Hono client
  -> OpenAPI route + workspace resolution + permission middleware
  -> controller / Drizzle transaction
  -> publishEvent()
  -> WebSocket adapter
  -> remote TanStack Query invalidation
```

Ключевые доказательства:

- `apps/web/src/fetchers/task/create-task.ts`;
- `apps/web/src/hooks/mutations/task/use-create-task.ts`;
- `apps/api/src/task/index.ts`;
- `apps/api/src/task/controllers/create-task.ts`;
- `apps/api/src/events/index.ts`;
- `apps/api/src/ws/index.ts`;
- `apps/web/src/hooks/use-project-websocket.ts`.

Важный инвариант: инициирующее browser window исключается из собственного WebSocket broadcast через `userId:windowId`, поэтому mutation hook обязан сам обновить или инвалидировать локальный cache.

Redis остаётся optional fan-out transport. Без него single-instance mode работает через in-memory adapter. Текущий event bus — process-local `EventEmitter`, а не durable queue.

### Authentication and authorization

Better Auth поддерживает email/password, magic links, OTP, social/custom OAuth, API keys, device authorization, organizations и admin plugin. Workspace authorization централизована в:

- `packages/permissions/src/index.ts`;
- `apps/api/src/utils/require-workspace-permission.ts`;
- `apps/api/src/utils/workspace-access-middleware.ts`.

API, а не UI, является authority. API key scopes должны накладываться поверх workspace permissions.

### Database

`apps/api/src/database/schema.ts` включает identity/auth, workspaces, roles, teams, projects, columns, tasks, relations, activity, comments, notifications, integrations, assets, billing и MCP state.

Task одновременно хранит `status`, `columnId` и `position`; любое наследованное поведение должно сохранять их согласованность до удаления старой task domain model.

## Продуктовый и UX baseline

Kaneo уже содержит:

- Workspace -> Project hierarchy;
- Board/List/Backlog/Calendar/Gantt;
- task drawer и canonical full page;
- rich text, relations, subtasks, activity/comments;
- bulk actions, command palette и global search;
- custom roles, public projects и integrations;
- realtime cache invalidation.

Сильнейший reusable pattern — быстрый inspector в drawer с переходом на полноценную deep-linked страницу.

Главные продуктовые разрывы:

- onboarding создаёт workspace, но не доводит до первого результата;
- workspace landing почти равен списку проектов;
- нет cross-project workbench и аналитического центра;
- filters/sort/view mode преимущественно находятся в local state/localStorage;
- URL хранит `taskId`, но не воспроизводит весь view state;
- realtime существует как transport, но почти невидим пользователю;
- optimistic errors, rollback и bulk partial failures обрабатываются непоследовательно;
- несколько card/list/backlog variants одной сущности расходятся по UX.

## Tests and quality baseline

Статически найдено 156 test files:

- `tests/api`: 60;
- `tests/api-integration`: 33;
- `apps/web`: 42;
- остальные packages: 21.

Сильные зоны: RBAC/workspace isolation, auth/session, billing/webhooks, MCP OAuth, direct-address SSRF cases, migrations и Redis user broadcast failure.

Пробелы:

- нет browser E2E критических journeys;
- нет автоматического accessibility gate;
- нет real WebSocket handshake/reconnect suite;
- нет load/performance budgets;
- coverage configs существуют, но CI threshold не зафиксирован;
- нет SBOM/container scan/SAST/secret scanning gates.

S0 прогнал exact-toolchain suites в Linux container: 656 unit tests, 224 PostgreSQL-backed integration tests, 7/7 typecheck tasks и 7/7 production build tasks завершились успешно. Browser coverage намеренно ограничен одним critical-path smoke; это не полная E2E regression suite.

## Приоритетные риски

| Severity | Находка | Доказательство / граница утверждения |
|---|---|---|
| High | SSRF через redirects и DNS rebinding в notification delivery | `apps/api/src/notification-preferences/delivery.ts`, `apps/api/src/utils/assert-public-destination.ts`; нужен exploit regression test |
| High | REST API key rate limit, вероятно, только читается, но не enforce-ится | `authenticate-api-request.ts`, `verify-api-key.ts`; подтвердить integration test |
| High | MCP client state и sessions имеют неполные caps/TTL cleanup | `apps/api/src/mcp/oauth.ts`, `apps/api/src/mcp/index.ts` |
| High | Integration credentials хранятся plaintext в JSON config | `apps/api/src/database/schema.ts`, `apps/api/src/external-link/index.ts` |
| High | Kanban reorder создаёт O(n) REST mutations и partial-failure риск | `apps/web/src/components/kanban-board/index.tsx` |
| Medium/High | Нет общих body/request/WS limits и безопасных standalone defaults | Требует runtime/reverse-proxy verification |
| Medium | Board получает весь dataset и poll-ит каждые 30 s вместе с realtime | `get-tasks.ts`, `use-get-tasks.ts`, `use-project-websocket.ts` |
| Medium | Global search использует `%query%`/`ILIKE` без подтверждённой index strategy | `apps/api/src/search/controllers/global-search.ts` |
| Medium | DB не закрепляет некоторые workspace uniqueness constraints | `workspace_member`, `workspace_role` definitions |
| Medium | Accessibility не имеет automation и keyboard parity на всех DnD surfaces | static audit; нужен browser/manual pass |
| Low/Medium | Success toast вызывается после failed delete | `apps/web/src/components/kanban-board/task-card.tsx` |

## Performance baseline

- Web fetcher получает whole-board response; API уже умеет optional filtering/sorting/pagination, но web этим не пользуется.
- Compression добавлен из-за потенциально multi-megabyte board JSON.
- Project WebSocket events часто инвалидируют весь tasks query.
- Search и activity/notification queries нуждаются в `EXPLAIN (ANALYZE, BUFFERS)` на representative data.
- Крупные editor/syntax/diagram chunks требуют route-level lazy-loading и budgets.

S0 measurement snapshot:

| Dimension | Result | Interpretation |
|---|---:|---|
| API health latency, local, 30 requests | median 9.86 ms; p95 10.65 ms; max 82.11 ms | Startup/sanity baseline, не domain-query SLO |
| Payloads | health 15 B; config 386 B; OpenAPI 171,546 B; web HTML 8,300 B | Сравнительная точка для contract/startup |
| Web artifact | 60,984 KiB on disk, включая sourcemaps/assets; JS total 18,180,941 B | Не равно initial route transfer |
| Largest minified JS chunk | `comment-editor` 807,440 B / 252.82 kB gzip | Existing warning; editor обязан остаться lazy |
| Main index chunk | 502,532 B / 163.09 kB gzip | Existing application baseline |
| API bundle | 1,547,960 B | Bundled server entry |
| `SELECT count(*) FROM task` | 0.115 ms execution; sequential scan, 1 row | Только smoke query plan, не representative performance |
| Realtime commit → second browser | not yet reproducible | Требует двухконтекстного incident flow из S1/S6 |

D-04 подтверждён без изменения provisional product budgets: incident query p95 ≤300 ms на 100k incidents, table ≥55 fps, realtime p95 ≤750 ms, reconnect ≤5 s, initial Workbench route ≤250 kB gzip JS и отсутствие новых неутверждённых synchronous chunks >500 kB minified. S0 не выдаёт one-row query или текущий Kaneo bundle за representative RelayOps measurement; budgets проверяются на указанных fixtures в owning stages.

## Accessibility baseline

Положительное:

- Base UI/Radix primitives;
- часть DnD использует KeyboardSensor;
- reduced-motion rules;
- 18 locales и runtime `document.lang`.

Проблемы:

- нет global skip link и стабильного `<main>` landmark;
- imperative navigation используется вместо links;
- часть icon-only controls и permission switches не имеет надёжного accessible name;
- Gantt resize, project reorder и отдельные DnD surfaces не имеют keyboard alternative;
- hard-coded English и locale-insensitive dates;
- встречаются слишком малые touch targets и снятый outline без равноценного focus-visible.

Target для трансформации — [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/), включая keyboard access, visible/unobscured focus, dragging alternatives и minimum target size.

## Лицензия и границы распространения

Root `LICENSE` — MIT, `Copyright (c) 2024 Andrej Acevski`. Лицензия разрешает модификацию, коммерческое использование и закрытую производную работу при сохранении copyright и permission notice. Первичный текст: [OSI MIT License](https://opensource.org/license/mit).

Обязательные границы:

- не удалять и не искажать root `LICENSE`;
- сохранить upstream copyright и честную ссылку на Kaneo;
- не представлять fork как официальный Kaneo product;
- сохранить `apps/docs/LICENSE` при сохранении Mintlify-derived content;
- сохранить локальные package licenses;
- до public release сформировать `THIRD_PARTY_NOTICES` и SPDX/CycloneDX SBOM для source и каждого распространяемого artifact;
- вложить root MIT notice в Docker images, Helm package и static-site artifacts: parent `LICENSE` сейчас автоматически туда не попадает;
- вложить OFL notice/copyright для уже распространяемых Geist/Geist Mono assets и отдельно документировать provenance новых fonts;
- разрешить неопределённость лицензии exact runtime artifact `creem@1.6.0`: получить подтверждение, заменить версию/SDK либо удалить dependency до distribution;
- проверить выбранный license path и notices для dual-licensed DOMPurify, Apache dependencies/base images и всех runtime transitives;
- полностью заменить Kaneo logos, favicons, cloud claims и marketing achievements;
- отдельно проверить GitHub/Product Hunt brand assets;
- выяснить корректного holder для подозрительного `packages/planka-import/LICENSE`.

Подтверждённые distribution blockers текущего baseline:

| Blocker | Evidence / required action |
|---|---|
| `creem@1.6.0` | Direct production dependency попадает в API/runtime images, но exact npm artifact не содержит надёжно подтверждённого license metadata/file. До release требуется документированное разрешение, замена или удаление. [npm artifact](https://www.npmjs.com/package/creem/v/1.6.0) |
| MIT text отсутствует в packaged artifacts | `Dockerfile.kaneo`, API/web images, Helm chart package и static export не доказывают включение root `LICENSE`; добавить artifact-level license inventory и CI inspection |
| Geist OFL notice | Bundled Geist assets и Fontsource packages распространяются, но OFL notice в репозитории не найден. Добавить официальный [Geist license](https://github.com/vercel/geist-font/blob/main/LICENSE.txt) в notices/artifacts |
| Upstream identity | Public names/scopes/images/chart/metadata всё ещё используют Kaneo/`@kaneo`/`usekaneo`; modified release требует cleared identity, upstream provenance и non-endorsement |
| Asset provenance | Product Hunt badge, screenshots, OG/marketing assets и `CONTRIBUTORS.svg` требуют удаления либо per-asset provenance/permission evidence |

Это инженерный compliance-аудит, не юридическое заключение. Неизвестная или неподтверждённая лицензия блокирует распространение, а не автоматически означает нарушение.

Root MIT не является trademark grant. Название новой концепции в planning docs — рабочий codename, а не юридически очищенный бренд.

Рекомендуемая attribution line:

> Derived from Kaneo (https://github.com/usekaneo/kaneo), originally copyright © 2024 Andrej Acevski, licensed under the MIT License. This project is independently maintained and is not presented as an official Kaneo product.

## Инварианты для трансформации

- API остаётся единственным authority для authn/authz.
- Workspace isolation проверяется на каждом scoped endpoint и в DB constraints.
- Zod request/response schemas, OpenAPI metadata и typed client меняются синхронно.
- `createRoute({ middleware })` middleware читает raw request, поскольку выполняется до validators.
- DB changes включают forward migration для существующих installations и upgrade tests.
- Realtime mutation имеет local cache path, remote WebSocket path и reconnect refetch path.
- Redis, S3, SMTP, Sentry и billing не становятся обязательными для single-instance self-hosting.
- Поддерживаются bundled same-origin и separately hosted API/web.
- Secrets не попадают в responses, logs, events, WebSockets, MCP и docs.
- User-visible copy использует static i18n keys; `i18n/en-US.json` остаётся source of truth.
- Большие datasets обрабатываются server-side pagination/filter/sort и virtualization.
- Root MIT license и upstream provenance сохраняются.

## Не подтверждено этим baseline

- actual coverage и coverage threshold;
- Redis-enabled multi-instance realtime;
- role denial через реальный browser/API session;
- performance на production-like data;
- CVE state dependency tree;
- WCAG conformance;
- legal clearance нового названия и assets.

## Результат S0 gate

S0 green: line endings, exact toolchain, static checks, typecheck, unit/integration tests, build, migration drift, fresh Compose startup, API/web smoke, minimal browser journey и comparison measurements подтверждены. Coverage percentage не измерялся, потому что S0 требует green suites и baseline artifacts, но не вводит новый coverage threshold.

S1 не начат и требует отдельного разрешения владельца проекта.
