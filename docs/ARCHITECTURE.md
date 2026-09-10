<!-- generated-by: gsd-doc-writer -->
# Целевая архитектура RelayOps

**Статус:** целевая архитектура, implementation-ready, без реализации  
**Дата:** 2026-08-27  
**Основа:** Kaneo 2.22.0, commit 8100f3b1ab47a0b49c7ac6deabe64eb0d1d9970d  
**Продукт:** RelayOps — рабочий codename до trademark clearance

## 1. Назначение и границы

RelayOps — self-hosted realtime incident operations platform. Система принимает ручные и подписанные входящие сигналы, связывает их с сервисами и инцидентами, координирует response через управляемый lifecycle, сохраняет неизменяемую operational timeline и строит reliability analytics. Основной архитектурный стиль — modular monolith с вертикальными domain slices, транзакционной PostgreSQL-моделью и best-effort доставкой realtime-подсказок поверх durable state.

Цель трансформации — заменить Project/Task-центричную модель Kaneo доменом Service/Signal/Incident, не разрушая зрелые платформенные возможности: Better Auth, workspace RBAC, Hono/OpenAPI, typed client, TanStack Router/Query, WebSockets, optional Redis, Docker и Helm.

### Неподвижные инварианты

- PostgreSQL — единственный обязательный stateful dependency и источник истины.
- API — единственный authority для authentication, authorization и domain policy.
- Каждый domain read/write явно scoped по workspace; client-supplied workspaceId не считается доказательством доступа.
- Mutation, изменяющая incident, атомарно записывает incident state, incident_event и outbox_event.
- WebSocket не является журналом и не восстанавливает пропущенные сообщения; reconnect завершается authoritative refetch.
- Redis не требуется в single-instance deployment. Он нужен только как optional multi-instance fan-out и shared ephemeral coordination.
- API contracts определяются Zod-схемами через @hono/zod-openapi; OpenAPI и Hono typed client меняются синхронно.
- Workbench URL детерминированно описывает shareable view state. Cursor, selection и transient UI state в URL не попадают.
- Large datasets обслуживаются server-side filter/sort/facets, keyset pagination и viewport virtualization; full-dataset fetch запрещён.
- Domain behavior остаётся внутри modular monolith. Выделение микросервисов не является целью MVP.
- Bundled same-origin и split web/API deployments остаются поддерживаемыми.
- Root LICENSE, upstream provenance и third-party notices сохраняются во всех распространяемых artifacts.

### Явные не-цели

- Event sourcing всего продукта.
- Обязательный Kafka, RabbitMQ, Redis Streams или внешний warehouse.
- Автоматическое преобразование Kaneo Task в RelayOps Incident.
- Multi-region active-active, public status pages, on-call paging и arbitrary workflow builder.
- Клиентская авторизация по названиям ролей.

## 2. Архитектурные решения

| ADR | Решение | Статус | Ключевое следствие |
|---|---|---|---|
| ADR-001 | Сохранить modular monolith и pnpm monorepo | Accepted | Один deployable API, одна SPA и одна PostgreSQL schema; boundaries обеспечиваются модулями и tests |
| ADR-002 | Организовать новый домен вертикальными slices | Accepted | Service, Incident, Signal, Saved View и Analytics владеют своими routes/controllers/repositories/contracts |
| ADR-003 | PostgreSQL — durable source of truth, Redis optional | Accepted | Single-instance полностью работает без Redis; correctness не зависит от cache/fan-out |
| ADR-004 | Явный workspaceId во всех domain rows и composite foreign keys | Accepted | Cross-workspace ссылки блокируются не только controller-кодом, но и DB constraints |
| ADR-005 | Optimistic concurrency через expectedVersion | Accepted | Stale write возвращает typed 409 с текущим представлением; last-write-wins запрещён |
| ADR-006 | Durable incident_event и transactional outbox с первого incident write | Accepted | Tracer включает minimal worker; later realtime hardens delivery, но Timeline и publication intent всегда коммитятся вместе |
| ADR-007 | At-least-once realtime invalidation, не WebSocket replay | Accepted | Duplicate messages безопасны, offline gaps закрываются refetch |
| ADR-008 | URL — canonical workbench state | Accepted | System defaults < saved view < явно присутствующие URL params; cursor остаётся Query pageParam |
| ADR-009 | Server-driven table и keyset pagination | Accepted | TanStack Table управляет table model, TanStack Virtual — viewport; данные и facets принадлежат API |
| ADR-010 | Analytics выполняется в PostgreSQL без раннего warehouse | Accepted | Формулы, exclusions и timezone централизованы; rollups появляются только после измерений |
| ADR-011 | Server-authoritative scoped capabilities | Accepted | Service Owner использует explicit owned-actions и primary-service ownership; commander field не выдаёт права |
| ADR-012 | Strangler migration без dual-write Task/Incident | Accepted | Legacy Kaneo остаётся изолированным read-only path; destructive contract gate требует export/backup и major release |
| ADR-013 | Поддерживать same-origin и split deployment одной кодовой базой | Accepted | API/WS URL resolver, cookie/CORS policy и reverse proxy являются конфигурацией, а не forked builds |
| ADR-014 | Не вводить PostgreSQL RLS в MVP | Accepted | Isolation обеспечивают scoped repositories, composite constraints и negative integration tests; RLS можно пересмотреть отдельно |

### Authoritative decisions and remaining gates

Accepted:

- PostgreSQL outbox входит в первый Incident write. Vertical tracer включает minimal worker для claim, in-memory publish, mark-published и restart retry; later realtime hardens backoff, metrics, retention и optional Redis fan-out.
- Service Owner owned-scope входит в MVP и определяется ownerTeam primary service. Owned severity/resolve/reopen/dismiss доступны только для non-SEV1; secondary affected service сам по себе прав не выдаёт.
- Legacy Task/Project data не конвертируется в Incident/Service автоматически и не dual-write-ится. Существующим installations предоставляется read-only archive/export; иной semantic import требует отдельного explicit tool и решения.

Pending gates:

- Final product name и public namespace требуют trademark clearance.
- Provisional bundle/query/table/reconnect/realtime budgets калибруются по Phase-0 measurements.

## 3. System context

~~~mermaid
flowchart LR
    responder[Responder / Incident Commander]
    admin[Workspace Admin / Reliability Lead]
    source[Monitoring source or generic webhook]
    web[RelayOps React SPA]
    api[RelayOps Hono API]
    pg[(PostgreSQL)]
    redis[(Redis optional)]
    ext[Optional SMTP / S3 / Sentry]

    responder -->|HTTPS| web
    admin -->|HTTPS| web
    web -->|Typed HTTP API| api
    web <-->|Authenticated WebSocket| api
    source -->|Signed webhook| api
    api -->|Transactions and analytics SQL| pg
    api <-->|Multi-instance fan-out only| redis
    api -.->|Optional integrations| ext
~~~

Пользовательский browser никогда не обращается к PostgreSQL или Redis напрямую. Generic webhook не создаёт outbound request к переданному пользователем URL. Analytics и export проходят ту же workspace authorization boundary, что и operational reads.

## 4. Containers и runtime topology

~~~mermaid
flowchart TB
    subgraph Browser
        router[TanStack Router and validated URL codec]
        query[TanStack Query cache]
        table[TanStack Table controlled model]
        virtual[TanStack Virtual viewport]
        ui[Workbench / Board / Room / Analytics]
        wsclient[Realtime coordinator]
        router --> ui
        query --> ui
        table --> ui
        virtual --> ui
        wsclient --> query
    end

    subgraph API["Hono modular monolith"]
        auth[Better Auth and API key auth]
        policy[Workspace access and capability policy]
        slices[Service / Incident / Signal / Saved View / Analytics]
        worker[Outbox worker]
        gateway[WebSocket gateway]
        adapter[In-memory or Redis broadcast adapter]
        auth --> policy --> slices
        worker --> adapter --> gateway
    end

    subgraph Data
        db[(PostgreSQL)]
        optionalRedis[(Redis optional)]
    end

    ui -->|@kaneo/libs typed client during migration| auth
    slices --> db
    worker --> db
    adapter -. optional .-> optionalRedis
    gateway --> wsclient
~~~

### Deployable units

| Unit | Текущая база | Целевая ответственность |
|---|---|---|
| API | apps/api | Auth, policies, OpenAPI routes, domain transactions, ingestion, analytics SQL, outbox worker, WebSockets |
| Web | apps/web | React/Vite shell, routes, Query cache, workbench, board, room, analytics, visible realtime state |
| PostgreSQL | existing deployment | Durable operational state, timeline, outbox, saved views и analytics source |
| Redis | apps/api/src/redis и apps/api/src/ws/redis-broadcast-adapter.ts | Только cross-instance fan-out/presence/rate-limit coordination when enabled |
| Site/docs | apps/site и apps/docs | Rebranded public material, user docs, API snapshot и OSS notices |
| Shared packages | packages/libs, packages/permissions, packages/email | Typed client/URL helper, canonical capability vocabulary, notifications |

## 5. Module boundaries

### Backend slices

| Slice | Владеет | Не владеет | Целевой путь |
|---|---|---|---|
| Service | Catalog CRUD/archive, tier/health/owner, URL validation, ownership lookup | Incident lifecycle, analytics formulas | apps/api/src/service |
| Incident | Incident aggregate, lifecycle, responders, affected services, durable timeline, version conflicts | Webhook verification, saved view persistence | apps/api/src/incident |
| Signal | Manual/demo ingestion, signed webhook, normalization, deduplication, attach-to-incident command | Incident transition policy | apps/api/src/signal |
| Saved View | Versioned named view definitions, visibility, sharing authorization | Runtime URL parsing в browser, incident query execution | apps/api/src/saved-view |
| Analytics | Read-only metric queries, export, exclusions/timezone/sample metadata | Operational writes, warehouse/ETL | apps/api/src/analytics |
| Outbox | Claim/retry/publish/retention mechanics и event envelope | Domain decision о том, какое событие создать | apps/api/src/outbox |

Каждый HTTP slice следует существующему Kaneo pattern:

- index.ts — createRoute declarations, middleware и thin handlers;
- schema.ts — request params/query/body Zod schemas;
- response.ts — reusable named OpenAPI response schemas;
- controllers/ — application commands и queries;
- repository.ts или repositories/ — reusable scoped Drizzle access, если query повторяется;
- policy.ts — resource-level policy, если одного requireWorkspacePermission недостаточно.

Controller одного slice не импортируется другим controller напрямую. Cross-slice orchestration использует узкий exported application command или repository contract. Например, Signal вызывает Incident command attachSignal, а не пишет incident_event сам.

### Frontend boundaries

Сохраняются существующие Kaneo conventions:

- HTTP calls: apps/web/src/fetchers/service, incident, signal, saved-view, analytics;
- server state: apps/web/src/hooks/queries и apps/web/src/hooks/mutations;
- domain surfaces: apps/web/src/components/incident-workbench, response-board, incident-room, service-catalog, reliability-analytics;
- route search codec: apps/web/src/utils/incident-workbench-search.ts с colocated tests;
- realtime coordinator: apps/web/src/hooks/use-workspace-realtime.ts и use-incident-realtime.ts;
- routes: apps/web/src/routes/_layout/_authenticated/operations, services и insights.

Целевые public routes:

~~~text
/operations/:workspaceId
/operations/:workspaceId/incidents
/operations/:workspaceId/response-board
/operations/:workspaceId/incidents/:incidentId
/services/:workspaceId
/services/:workspaceId/:serviceId
/insights/:workspaceId/reliability
~~~

Legacy dashboard/project routes остаются отдельной migration surface и не импортируются в новые components.

### Target directory map

~~~text
apps/api/src/
├── service/
├── incident/
├── signal/
├── saved-view/
├── analytics/
├── outbox/
├── database/
├── ws/
└── openapi.ts

apps/web/src/
├── components/
│   ├── incident-workbench/
│   ├── response-board/
│   ├── incident-room/
│   ├── service-catalog/
│   └── reliability-analytics/
├── fetchers/{service,incident,signal,saved-view,analytics}/
├── hooks/queries/
├── hooks/mutations/
├── hooks/use-workspace-realtime.ts
├── hooks/use-incident-realtime.ts
├── routes/_layout/_authenticated/{operations,services,insights}/
└── utils/incident-workbench-search.ts

packages/
├── libs/
└── permissions/
~~~

TanStack Table и TanStack Virtual являются целевыми dependencies и должны быть добавлены отдельным dependency change с bundle/license review. Сейчас apps/web/package.json содержит Query и Router, но не Table/Virtual.

## 6. Domain model

~~~mermaid
erDiagram
    WORKSPACE ||--o{ SERVICE : owns
    WORKSPACE ||--o{ INCIDENT : owns
    WORKSPACE ||--o{ SIGNAL : owns
    WORKSPACE ||--o{ SAVED_VIEW : owns
    WORKSPACE ||--|| INCIDENT_COUNTER : allocates
    SERVICE ||--o{ INCIDENT : primary_service
    INCIDENT ||--o{ INCIDENT_SERVICE : affects
    SERVICE ||--o{ INCIDENT_SERVICE : affected_by
    INCIDENT ||--o{ INCIDENT_RESPONDER : staffed_by
    INCIDENT ||--o{ INCIDENT_SIGNAL : groups
    SIGNAL ||--o{ INCIDENT_SIGNAL : attached_to
    INCIDENT ||--o{ INCIDENT_EVENT : records
    INCIDENT_EVENT ||--|| OUTBOX_EVENT : publishes
    WORKSPACE ||--o{ SIGNAL_SOURCE : configures
~~~

### Tables и ownership

| Table | Основные поля | Ограничения и lifecycle |
|---|---|---|
| workspace | existing fields, product_mode | Existing rows default legacy; new RelayOps workspace получает relayops только через explicit rollout gate |
| incident_counter | workspace_id, last_number | Одна row на workspace; atomic increment выдаёт human number без global sequence |
| service | id, workspace_id, slug, name, tier, health, owner_team_id, repository_url, runbook_url, archived_at, timestamps | Unique active slug per workspace; normal API архивирует, не hard-delete |
| incident | id, workspace_id, number, title, summary, status, severity, impact, primary_service_id, commander_user_id, lifecycle timestamps, last_update_at, version, created_by, timestamps | Unique workspace+number; version > 0; state changes только через commands |
| incident_service | workspace_id, incident_id, service_id | Composite PK; хранит только additional affected services, primary service остаётся в incident |
| incident_responder | workspace_id, incident_id, user_id, joined_at | Composite PK; user должен быть member того же workspace |
| signal_source | id, workspace_id, name, source, encrypted_secret, nonce, key_version, enabled, timestamps | Secret показывается один раз, хранится encrypted; unique source name per workspace |
| signal | id, workspace_id, source, external_id, fingerprint, deduplication_key, service_id, title, summary, observed_at, severity_hint, redacted_payload, ingestion_status, timestamps | Partial unique external id; raw body/signature не сохраняются |
| incident_signal | workspace_id, incident_id, signal_id, attached_by, attached_at | Composite PK; повторный attach idempotent |
| incident_event | id, workspace_id, incident_id, incident_version, type, actor_user_id, occurred_at, payload, idempotency_key | Append-only application contract; manual correction создаёт новый event |
| outbox_event | id, workspace_id, aggregate_type, aggregate_id, aggregate_version, event_type, payload, attempts, available_at, claimed_at, published_at, last_error, created_at | Publication state; compact redacted payload; retention after publish |
| saved_view | id, workspace_id, owner_user_id, name, visibility, schema_version, definition, version, timestamps | private/workspace; optimistic version; definition проходит тот же canonical codec |

Все новые timestamps — timestamptz и нормализуются в UTC. Timezone применяется только на query/format boundary. JSONB допускается для typed event payload, redacted signal payload и saved-view definition, но не заменяет индексируемые operational columns.

### Workspace isolation в БД

Каждая domain table содержит workspace_id, даже если workspace можно вывести через parent. Это преднамеренная денормализация ради policy clarity, индексов и composite constraints.

На service, incident, signal и saved_view создаётся UNIQUE(workspace_id, id). Cross-domain foreign keys имеют форму:

~~~sql
FOREIGN KEY (workspace_id, primary_service_id)
  REFERENCES service (workspace_id, id)

FOREIGN KEY (workspace_id, incident_id)
  REFERENCES incident (workspace_id, id)
~~~

До добавления foreign keys migration должна:

1. удалить или объединить дубликаты workspace_member по (workspace_id, user_id);
2. добавить UNIQUE(workspace_id, user_id) в workspace_member;
3. backfill workspace_id в новых relation rows;
4. выполнить orphan/cross-workspace audit;
5. только затем сделать columns NOT NULL и добавить constraints.

API repositories принимают workspaceId обязательным первым параметром. Методы getIncident(id) без workspace context запрещены, кроме внутреннего resolver middleware, который сначала получает workspace и затем повторно авторизует request.

PostgreSQL RLS не вводится в MVP: текущий connection model Kaneo не устанавливает безопасный per-request DB context. Возврат к RLS возможен отдельным ADR после proof с pooling, migrations и background workers.

### Check constraints

- incident.version > 0;
- incident.number > 0;
- lifecycle timestamps не могут быть раньше detected_at;
- resolved_at и dismissed terminal state согласуются domain command, но сложная state-machine логика остаётся в application layer;
- service.tier, service.health, incident.status/severity/impact и signal.ingestion_status ограничены DB enum/check и теми же Zod enums;
- saved_view.version > 0;
- outbox_event.attempts >= 0.

### Индексы

Начальный набор минимален и проверяется EXPLAIN (ANALYZE, BUFFERS) на fixture 100k incidents / 1M events:

| Query | Индекс |
|---|---|
| Stable incident feed | incident(workspace_id, detected_at DESC, id DESC) |
| Active clock rail | Partial incident(workspace_id, severity, detected_at, id) WHERE status NOT IN ('resolved','dismissed') |
| Filter by primary service | incident(workspace_id, primary_service_id, detected_at DESC, id DESC) |
| Commander queue | incident(workspace_id, commander_user_id, status, detected_at DESC, id DESC) |
| Status/severity facets | incident(workspace_id, status, severity) |
| Incident text search | GIN over generated tsvector from number/title/summary using simple configuration |
| Timeline page | incident_event(workspace_id, incident_id, occurred_at DESC, id DESC) |
| Event retry dedupe | UNIQUE incident_event(workspace_id, incident_id, idempotency_key) WHERE idempotency_key IS NOT NULL |
| Signal idempotency | UNIQUE signal(workspace_id, source, external_id) WHERE external_id IS NOT NULL |
| Signal triage | signal(workspace_id, ingestion_status, observed_at DESC, id DESC) |
| Outbox claims | Partial outbox_event(available_at, created_at) WHERE published_at IS NULL |
| Outbox dedupe | UNIQUE outbox_event(aggregate_type, aggregate_id, aggregate_version, event_type) |
| Saved views | saved_view(workspace_id, visibility, owner_user_id, updated_at DESC) |

Новые combinatorial indexes добавляются только по query plans и production-like traces. Exact total count не выполняется на каждом scroll request; UI получает hasNextPage, facets и отдельный count только там, где он нужен продукту.

### Delete и archive semantics

- Service архивируется; hard-delete запрещён, пока на него ссылается incident.
- Incident не удаляется через routine UI: false positive переводится в dismissed, recovery — в resolved.
- Incident event не редактируется и не удаляется отдельным endpoint.
- Удаление всего workspace сохраняет текущую продуктовую семантику cascade и требует существующей destructive confirmation.
- Удаление user ставит nullable actor/commander references в null, но event type/timestamp/payload остаются.

## 7. Incident aggregate и транзакции

Incident — consistency boundary. Один incident command:

1. загружает scoped aggregate или делает conditional update по workspace_id, id и expectedVersion;
2. проверяет coarse capability и resource policy;
3. валидирует transition/preconditions;
4. увеличивает version ровно на 1;
5. обновляет lifecycle timestamps;
6. вставляет ровно один typed incident_event для новой версии;
7. вставляет соответствующий outbox_event;
8. коммитит transaction;
9. возвращает authoritative representation.

Compound UI intents раскладываются на отдельные команды. Bulk command может атомарно изменить несколько incidents, но для каждого incident создаёт собственные version/event/outbox rows. Silent partial success запрещён.

### Lifecycle policy

Таблица ниже — authoritative lifecycle contract. Diagram в product spec визуализирует ровно эти переходы и не расширяет их.

| From | To |
|---|---|
| `detected` | `triaging`, `dismissed` |
| `triaging` | `mitigating`, `monitoring`, `resolved`, `dismissed` |
| `mitigating` | `monitoring`, `resolved` |
| `monitoring` | `mitigating`, `resolved` |
| `resolved` | `monitoring` via explicit reopen |
| `dismissed` | `triaging` via explicit reopen |

`dismissed` reachable только из `detected`/`triaging`. Reopen означает только `resolved -> monitoring` или `dismissed -> triaging`; restore в `detected` не существует.

Одна функция policy возвращает allowed/denied с machine-readable reason. `incident:transition` покрывает только non-terminal transitions. Переход в `resolved`, переход в `dismissed` и выход из terminal state требуют соответственно `resolve`, `dismiss` и `reopen`. HTTP command, DnD, keyboard action и menu alternative вызывают один application command; UI не содержит отдельной state machine.

Service Owner использует `severity_owned`, `resolve_owned`, `reopen_owned` и `dismiss_owned` только для incident, primary service которого принадлежит ownerTeam пользователя. Terminal actions требуют current severity не `sev1`; severity change требует, чтобы current и target severity не были `sev1`. Любой SEV1 severity change, resolve, reopen или dismiss требует workspace-wide capability Incident Commander либо Workspace Admin. Значение commander_user_id само по себе privileges не повышает.

### Optimistic concurrency

Versioned mutation принимает expectedVersion:

~~~json
{
  "to": "mitigating",
  "expectedVersion": 7,
  "idempotencyKey": "client-generated-stable-key"
}
~~~

SQL update включает WHERE workspace_id = ? AND id = ? AND version = ?. Если update не вернул row:

- scoped incident отсутствует — 404;
- row существует, но version отличается — 409 version_conflict;
- policy не разрешает action — 403 независимо от version.

Typed 409 response:

~~~json
{
  "code": "version_conflict",
  "message": "Incident changed after this view was loaded.",
  "requestId": "request-id",
  "expectedVersion": 7,
  "currentVersion": 8,
  "current": {
    "id": "incident-id",
    "version": 8
  }
}
~~~

Client сохраняет draft, показывает compare/reapply/discard и повторяет команду с тем же idempotencyKey только после явного выбора пользователя. Success toast на 409 не показывается.

## 8. API и OpenAPI contract

### Route construction

Новые routes используют createRoute и apiRouter из apps/api/src/openapi.ts. Feature schema.ts содержит request schemas, response.ts — named schemas с .openapi("Name"). Route middleware читает raw c.req.param/query/header, потому что createRoute middleware выполняется до validators.

Representative target surface:

| Method | Path | Назначение |
|---|---|---|
| GET | /api/workspaces/{workspaceId}/services | Catalog query |
| POST | /api/workspaces/{workspaceId}/services | Create service |
| GET | /api/workspaces/{workspaceId}/services/{serviceId} | Service detail |
| PATCH | /api/workspaces/{workspaceId}/services/{serviceId} | Versioned update |
| POST | /api/workspaces/{workspaceId}/services/{serviceId}/archive | Explicit archive command |
| GET | /api/workspaces/{workspaceId}/incidents | Workbench query, facets, cursor |
| POST | /api/workspaces/{workspaceId}/incidents | Create incident |
| GET | /api/workspaces/{workspaceId}/incidents/{incidentId} | Inspector/room detail |
| PATCH | /api/workspaces/{workspaceId}/incidents/{incidentId} | Versioned operational fields |
| POST | /api/workspaces/{workspaceId}/incidents/{incidentId}/transitions | Lifecycle command |
| PUT/DELETE | /api/workspaces/{workspaceId}/incidents/{incidentId}/responders/{userId} | Join/unassign responder |
| GET/POST | /api/workspaces/{workspaceId}/incidents/{incidentId}/timeline | Cursor timeline / publish update |
| POST | /api/workspaces/{workspaceId}/incidents/{incidentId}/signals/{signalId} | Idempotent attach |
| GET/POST | /api/workspaces/{workspaceId}/signals | Triage query / manual signal |
| POST | /api/webhooks/{sourceId}/signals | Raw-body signed ingestion |
| GET/POST | /api/workspaces/{workspaceId}/saved-views | List/create |
| PATCH/DELETE | /api/workspaces/{workspaceId}/saved-views/{viewId} | Versioned update/delete |
| GET | /api/workspaces/{workspaceId}/analytics/reliability | Metrics and chart series |
| GET | /api/workspaces/{workspaceId}/analytics/reliability.csv | Authorized streaming export |

Paths являются target contract и вводятся рядом с legacy singular routes; legacy contract не переименовывается массово.

### Standard responses

- 200/201 — typed JSON response;
- 400 — malformed param/query/body/cursor;
- 401 — no valid session/API key;
- 403 — workspace/capability/scope denial;
- 404 — resource отсутствует в authorized workspace, без cross-workspace oracle;
- 409 — expectedVersion conflict или idempotency key reused with another command;
- 422 — syntactically valid, но невозможный domain transition;
- 429 — enforced rate limit с Retry-After;
- 500 — redacted error с requestId.

RelayOps routes вводят structured Problem schema; legacy text/plain errors меняются только при миграции конкретного route. Нельзя расширять typed response union, не обновив frontend status narrowing.

### Cursor pagination

Incident list использует keyset pagination:

- allowed sort fields перечислены server-side;
- null ordering определён для каждого field;
- id всегда добавляется последним deterministic tie-breaker;
- cursor — opaque versioned base64url payload с sort tuple, id и hash canonical filter/sort signature;
- reuse cursor с другим filter signature возвращает 400 invalid_cursor;
- page size по умолчанию 50, server max 100;
- OFFSET не используется.

Response:

~~~json
{
  "items": [],
  "pageInfo": {
    "nextCursor": null,
    "hasNextPage": false
  },
  "facets": {
    "status": [],
    "severity": [],
    "service": []
  },
  "meta": {
    "requestId": "request-id",
    "generatedAt": "2026-08-27T00:00:00.000Z"
  }
}
~~~

Facet semantics фиксируются contract tests: count каждого dimension считается с активными filters остальных dimensions, но без собственного filter. Facets могут иметь отдельный short-lived Query cache, однако не становятся client-computed.

### Typed client

packages/libs/src/hono.ts остаётся единственным web client boundary до controlled rebrand package scope. Не создаётся параллельный axios/fetch layer. Каждый fetcher:

- вызывает inferred Hono client method;
- передаёт credentials и инициирующий window id;
- narrow-ит response по status;
- преобразует non-2xx в typed application error;
- не дублирует request/response TypeScript interfaces вручную.

Header X-Kaneo-Window-Id переименовывается только вместе с backward-compatible server acceptance обоих имён; это correlation hint, не security credential.

## 9. URL state contract

### Canonical codec

apps/web/src/utils/incident-workbench-search.ts экспортирует одну Zod-backed пару parse/serialize. Она используется route validateSearch, saved-view editor, Copy link и analytics cross-filter navigation.

Parser сохраняет набор явно присутствовавших keys до применения defaults. Это необходимо, чтобы отличить «param отсутствует» от «param равен default».

### Precedence

Эффективное состояние строится строго в таком порядке:

1. Versioned system defaults.
2. Доступная saved view, если присутствует view.
3. Только явно присутствующие и валидные URL fields.
4. Ephemeral component state, которое не влияет на shareable result.

incidentId и tab всегда принадлежат route и не сохраняются в Saved View. User preferences применяются только к shell chrome; они не переопределяют workbench filters/sort/columns/density.

Если view не существует, private для другого пользователя или имеет неподдерживаемую schema_version, API не раскрывает metadata; route показывает recoverable state и может удалить только invalid view param через replace.

### Normalization rules

- q trim-ится и ограничивается 200 characters;
- arrays dedupe-ятся и сортируются;
- dates сериализуются в ISO format;
- sort сохраняет order и direction, затем получает id tie-breaker на server;
- columns содержит versioned compact preset;
- invalid input нормализуется один раз и вызывает router replace, не push;
- serializer должен быть idempotent: serialize(parse(serialize(x))) равно serialize(x);
- изменение query/filter/sort/group очищает Query pages и pageParam;
- cursor, scroll position, row selection, hovered row, open menu и DnD state не сериализуются;
- back/forward восстанавливает effective view, incidentId и tab без ручной sync-effect петли.

«Copy current view» материализует resolved filters/sort/group/columns в URL. Ссылка, содержащая только view, намеренно следует текущей версии shared view; immutable historical snapshot не входит в MVP.

### Saved View concurrency

Saved View definition хранит canonical object, schema_version и version. Update принимает expectedVersion и получает такой же typed 409 contract. private view видит только owner; workspace view читают authorized members, изменяют owner или capability holder. Обновление shared view никогда не происходит автоматически при изменении URL.

## 10. Frontend state ownership

| State | Владелец | Примеры |
|---|---|---|
| Durable domain state | PostgreSQL/API | Incident, service, timeline, saved view |
| Shareable navigation state | TanStack Router | Filters, sort, group, columns, density, incidentId, tab |
| Remote server cache | TanStack Query | Infinite incident pages, facets, detail, timeline, permissions, analytics |
| Table projection | TanStack Table | Controlled column/order/pin/size and sort descriptors derived from URL; row selection transient |
| Viewport mechanics | TanStack Virtual | Measurements, overscan, visible range |
| Transient interaction | Local React state | Open popover, draft, active DnD item, conflict comparison |
| Realtime transport state | Realtime coordinator + small observable hook state | connected/reconnecting/offline/stale, retry time, lastSyncAt |

Правила:

- Один semantic value не хранится одновременно в Router, Query и local state.
- Table работает в manualFiltering/manualSorting/manualPagination mode и не фильтрует server dataset повторно.
- useInfiniteQuery queryKey включает workspaceId и canonical filter/sort signature; cursor находится только в pageParam.
- Virtualizer получает flat rows из Query pages, использует stable incident id и не инициирует data mutation.
- WebSocket handler меняет или инвалидирует Query cache, а не component-local rows.
- Mutation hook обязан обновить initiating tab локально: текущий Kaneo transport может исключать initiator window из broadcast.
- Optimistic update разрешён только если rollback однозначен. Lifecycle transition хранит previous snapshot и reconciles authoritative response.
- Bulk response атомарный. UI не изображает частичный успех, если transaction откатилась.
- Новый global client store не вводится, пока Router + Query + local state покрывают contract.

## 11. Durable timeline, outbox и realtime

### Write-to-visible flow

~~~mermaid
sequenceDiagram
    participant C as Initiating client
    participant A as Hono API
    participant P as PostgreSQL
    participant W as Outbox worker
    participant B as In-memory or Redis adapter
    participant R as Remote client

    C->>A: transition(expectedVersion, idempotencyKey)
    A->>A: auth + workspace + capability + policy
    A->>P: BEGIN
    A->>P: conditional incident update
    A->>P: INSERT incident_event
    A->>P: INSERT outbox_event
    A->>P: COMMIT
    A-->>C: authoritative incident vN
    C->>C: reconcile local Query cache
    W->>P: claim unpublished rows SKIP LOCKED
    W->>B: publish compact event
    B-->>R: workspace/incident WebSocket
    R->>R: patch by version or invalidate/refetch
    W->>P: mark published
~~~

### Outbox semantics

- Vertical tracer ships the minimal worker together with the first Incident mutation: claim committed rows, publish through InMemoryBroadcastAdapter, mark published and retry unfinished rows after restart.
- Later realtime hardening adds bounded batches, exponential backoff/jitter, metrics/alerts, retention and optional Redis fan-out. These additions do not change the atomic incident + incident_event + outbox_event invariant.
- Worker работает внутри API deployment; несколько instances безопасно claim-ят batches через FOR UPDATE SKIP LOCKED.
- Delivery guarantee — at least once. Crash после publish и до mark published даёт duplicate.
- Client dedupe key — aggregateType, aggregateId, aggregateVersion, eventType.
- Event payload содержит только ids, version и минимальные changed fields; secret/raw payload запрещён.
- Backoff exponential с jitter и max attempts alert threshold; row не удаляется молча.
- published rows очищаются retention job после operationally sufficient периода; incident_event остаётся.
- Domain transaction не вызывает WebSocket/Redis напрямую.
- Существующий apps/api/src/events/index.ts может временно обслуживать legacy features, но RelayOps correctness на нём не строится.

### Channels

- Workspace channel: list/overview invalidations, service health, incident summary changes.
- Incident channel: timeline/version updates и presence.
- User channel: notifications и permission/view changes.

Handshake и каждая subscription проверяют session, workspace membership и read capability. Channel id из client payload никогда не доверяется без scoped lookup.

### Optional Redis

InMemoryBroadcastAdapter остаётся default single-instance adapter. RedisBroadcastAdapter пересылает те же versioned envelopes между API instances. Domain code знает только BroadcastAdapter interface.

Presence:

- single instance — in-memory TTL heartbeat;
- multi-instance с Redis — shared TTL keys/pubsub;
- без Redis multi-instance presence может быть неполной и не используется для correctness, authorization или audit.

### Reconnect

Client state machine:

~~~text
connected -> reconnecting -> connected
     |             |
     v             v
  offline ------> stale
~~~

- exponential backoff с jitter и bounded retry countdown;
- browser online event ускоряет retry, но не означает connected;
- после успешного handshake client всегда refetch-ит selected incident, open timeline и active incident query window;
- permission cache также инвалидируется после reconnect;
- stale state показывает lastSyncAt и manual retry;
- offline mutations не queue-ятся по умолчанию. Разрешён только явно idempotent draft, не lifecycle transition;
- reconnect target из product budget — authoritative refetch до 5 s в нормальной локальной среде.

Сервер не реализует per-client WebSocket replay log в MVP: durable DB state плюс refetch проще и надёжнее.

## 12. Authorization architecture

### Canonical permission vocabulary

packages/permissions/src/index.ts расширяется ресурсами:

| Resource | Actions |
|---|---|
| service | create, read, update, update_owned, archive, archive_owned |
| incident | create, read, update, update_owned, assign, assign_owned, transition, transition_owned, severity, severity_owned, resolve, resolve_owned, reopen, reopen_owned, dismiss, dismiss_owned |
| incident_timeline | read, publish, correct |
| signal | create, read, ingest, attach |
| saved_view | create, read, update, delete, share |
| analytics | read, export |
| workspace | existing read/update/delete/manage_settings |

Owned action не является UI-only convention. Policy доказывает, что authenticated user состоит в ownerTeam primary service. Workspace-wide action всегда превосходит owned action. Custom roles сохраняют explicit actions; API не сравнивает строку role name.

`transition`/`transition_owned` разрешают только non-terminal paths: `detected -> triaging`, `triaging -> mitigating|monitoring`, `mitigating -> monitoring`, `monitoring -> mitigating`. Остальные paths требуют dedicated action:

| Action | Workspace-wide policy | Owned policy |
|---|---|---|
| severity | Incident Commander/Admin: любое значение, включая к/от `sev1` | Service Owner: current и target severity не `sev1` |
| resolve | Incident Commander/Admin: любой разрешённый source status/severity | Service Owner: primary service owned и severity не `sev1` |
| reopen | `resolved -> monitoring` или `dismissed -> triaging`, включая `sev1` | Те же paths, primary service owned, severity не `sev1` |
| dismiss | `detected|triaging -> dismissed`, включая `sev1` | Тот же path, primary service owned, severity не `sev1` |

Built-in role mapping:

| Role | Incident capabilities |
|---|---|
| Viewer | read |
| Responder | create, read, update, transition, timeline publish |
| Incident Commander | workspace update/assign/transition/severity/resolve/reopen/dismiss; timeline correct |
| Service Owner | owned update/assign/transition/severity/resolve/reopen/dismiss |
| Workspace Admin | all workspace-wide actions; timeline correct |

### Enforcement order

1. Authenticate session или API key.
2. Resolve workspace из raw path/resource.
3. Verify workspace membership.
4. Intersect user role permissions с API-key scopes; scope не расширяет user rights.
5. Require canonical resource action.
6. Для owned action загрузить minimal scoped ownership facts.
7. Выполнить domain precondition.
8. Только после этого открыть write transaction.

UI получает capability statements и contextual booleans для usability. Скрытая кнопка не считается контролем безопасности. Любое forbidden действие имеет API integration test с ожидаемым 403 и проверкой отсутствия DB/outbox side effects.

Incident commander assignment — operational data, не role elevation. Назначенный пользователь не получает resolve/transition permission автоматически.

## 13. Signal ingestion

### Signed webhook flow

1. Route применяет byte limit до JSON parse.
2. Читает raw body, timestamp, source id и signature.
3. Проверяет enabled source, replay window и HMAC constant-time compare.
4. Применяет rate limit; single-instance adapter может быть in-memory, multi-instance exact limiting требует Redis или PostgreSQL-backed adapter.
5. Нормализует allowlisted fields и удаляет secret/token/header values.
6. В transaction вставляет signal по workspace/source/externalId.
7. Duplicate возвращает прежний result без второго event.
8. Failed attempt логируется только requestId, sourceId, payload hash, size и error code.

HMAC secret шифруется AES-256-GCM instance key, который не хранится в БД. Webhook feature не включается без encryption key; manual signal и demo generator продолжают работать. Secret возвращается только один раз при создании/rotation.

Default body/replay/rate values фиксируются configuration schema и abuse tests; reverse proxy не является единственной защитой. Никакой RelayOps ingestion path не выполняет outbound fetch по repositoryUrl/runbookUrl или payload URL.

## 14. Analytics architecture

Analytics slice — read-only application layer над incident, incident_event и service. Он не пишет агрегаты в operational transaction и не вводит отдельный database.

### Query contract

Каждый response содержит:

- canonical filters;
- requested timezone;
- generatedAt;
- sampleSize;
- excluded counts по отсутствующим timestamps;
- metric definition/version;
- series и p50/p90 там, где выборка достаточна.

Формулы:

- MTTA = acknowledged_at - detected_at;
- MTTR = resolved_at - detected_at;
- mitigation time = mitigated_at - detected_at;
- reopen rate = incidents с event incident.reopened после resolution / resolved incidents;
- stale update rate = active incidents, у которых last_update_at старше threshold;
- service hotspot = count и duration по primary/affected service с явно указанной aggregation semantics.

Missing timestamp исключается и учитывается в excluded; он не превращается в zero. Timezone влияет на bucket boundaries и labels, но durations считаются по UTC instants.

### Implementation strategy

- Parameterized PostgreSQL CTEs и percentile_cont для p50/p90.
- Те же filter enums и workspace policy, что у workbench.
- Chart click сериализует filter через canonical URL codec и открывает incident table.
- TanStack Query кэширует response по workspace/filter/timezone; incident resolved/reopened event invalidates соответствующий key с коротким debounce.
- CSV export выполняет тот же query contract, стримит rows, добавляет filter spec и generatedAt и требует analytics:export.

Materialized views, rollup tables или warehouse вводятся только если representative EXPLAIN/latency нарушает p95 budget после корректных indexes/query rewrite. Analytics repository interface сохраняет такую замену локальной.

## 15. Security

### Required controls

- Exact allowed origins; wildcard CORS с credentials запрещён.
- Unsafe session-authenticated requests проверяют Origin/CSRF strategy Better Auth.
- Secure/HttpOnly/SameSite cookie settings соответствуют deployment topology.
- API-key rate-limit fields должны реально enforce-иться до public release.
- Request body, multipart, webhook и WebSocket message size limits заданы в API, не только nginx.
- All SQL parameterized через Drizzle/sql placeholders; sort/filter identifiers берутся из allowlist.
- Response DTO allowlist не возвращает encrypted secrets, internal payload или private workspace data.
- Logs/events/WS/MCP не содержат raw integration payload, signature, cookie, access token или encryption material.
- runbookUrl/repositoryUrl валидируются как http/https, но сервер их не fetch-ит.
- Если outbound delivery сохраняется из Kaneo, redirects и DNS rebinding закрываются отдельными regression tests.
- Idempotency key scoped по workspace+command+aggregate и не позволяет получить response другого workspace.
- WebSocket origin, session и subscription scope валидируются; presence payload имеет строгий schema/size limit.
- Encryption key rotation использует key_version и controlled re-encryption job.

### Threat boundaries

| Boundary | Основной риск | Control |
|---|---|---|
| Browser -> API | CSRF, broken authorization, over-posting | Session/API key auth, Origin, Zod body, capability policy |
| Webhook -> API | Forgery, replay, body abuse, secret leak | HMAC raw body, replay window, limits, redaction, idempotency |
| API -> PostgreSQL | Workspace leak, unsafe dynamic query | Scoped repositories, composite FK, parameterization, denial tests |
| API instance -> Redis | Cross-instance spoof/secret payload | Private Redis, compact envelope, no secrets, adapter contract |
| API -> WebSocket | Unauthorized subscription, stale patch | Re-auth scope, version envelope, reconnect refetch |
| Export | Bulk data exfiltration | analytics:export, workspace scope, audit/request id, streaming limits |

## 16. Performance and capacity

Target workload и provisional budgets берутся из product spec:

- 100k incidents и 1M incident events в representative workspace fixture;
- first 50 incident rows p95 <= 300 ms;
- >=55 fps table scroll на reference laptop;
- commit -> second browser visible p95 <= 750 ms single-instance;
- reconnect refetch <= 5 s;
- workbench initial route <= 250 kB gzip JS target.

### Backend rules

- No OFFSET for incident/timeline feeds.
- Select explicit columns; full redacted payload не входит в list response.
- Facets имеют bounded dimensions и измеряемый query plan.
- Timeline page загружается отдельно от incident detail.
- Exact counts и analytics не включаются в каждый list response.
- Outbox worker использует bounded batch, connection pool budget и backpressure.
- Outbox lag, query latency и row counts наблюдаемы.
- Search GIN index и compound indexes подтверждаются benchmark, а не только наличием migration.

### Frontend rules

- Workbench route, analytics charts, rich editor и diagram/syntax dependencies lazy-load separately.
- Table rows получают stable keys; scroll не вызывает full-page rerender.
- Column definitions memoized; expensive cell formatters измеряются React Profiler.
- Virtual overscan ограничен и тестируется с variable-height inspector interactions.
- Query cache не хранит бесконечно все страницы; gcTime и max retained pages документируются.
- Realtime event patch применяется только при последовательной версии; gap вызывает invalidate/refetch.
- Analytics invalidation debounced, чтобы burst outbox events не создавал request storm.
- CI фиксирует bundle report и запрещает новый synchronous chunk >500 kB без review.

## 17. Accessibility и i18n

Цель — WCAG 2.2 AA.

- Shell имеет skip link, один стабильный main landmark и видимый focus.
- Native table semantics используются там, где совместимы с virtualization. Если DOM строится как ARIA grid, обязательны aria-rowcount, aria-rowindex, aria-sort, roving focus и полная keyboard navigation.
- Virtualization не должна терять focused row; focus привязан к incident id, а не DOM index.
- Sorting, filters, resize и column controls имеют accessible names и keyboard paths.
- Response Board поддерживает pointer, touch, keyboard DnD и menu «Move to…» через один command.
- Screen-reader announcements сообщают source, destination, invalid target, success/rollback; не спамят каждую clock tick.
- Severity/status передаются label+icon+shape, не одним цветом.
- Inspector open/close сохраняет и восстанавливает focus; canonical room остаётся обычной ссылкой.
- Realtime status и conflict banner доступны без hover; aria-live используется сдержанно.
- Reduced motion убирает spatial movement, но сохраняет state feedback.
- Все user-visible strings — static i18n keys; i18n/en-US.json остаётся source of truth.
- Dates/durations используют active locale/timezone; machine timestamps остаются ISO.
- axe component/E2E gate допускает zero serious/critical issues, дополнительно выполняется keyboard и screen-reader manual pass.

## 18. Observability

### Server

Structured log fields:

- requestId;
- route/operationId;
- workspaceId;
- actor type и stable id там, где допустимо;
- status/duration;
- incidentId/version для commands;
- outbox event id/attempt/lag;
- error code без secret payload.

Metrics:

- HTTP count/latency/error by operationId;
- DB query latency и pool saturation;
- version conflict и forbidden action count;
- webhook accepted/rejected/deduplicated/rate-limited;
- outbox unpublished count, oldest age, retries и dead-letter threshold;
- WebSocket active connections, publish latency, reconnects и adapter errors;
- incident transition latency;
- analytics query/export duration.

Sentry остаётся optional. Local structured logs и health/readiness не зависят от внешнего SaaS. Readiness проверяет PostgreSQL и migration compatibility; Redis failure при optional configuration переводит realtime adapter в explicit degraded state, но не портит committed data.

### Client

Client измеряет route load, table interaction, reconnect duration и stale-state duration без incident title/summary и другой sensitive content. Connection indicator показывает connected/reconnecting/offline/stale и last sync time.

## 19. Deployment

### Bundled same-origin

~~~mermaid
flowchart LR
    browser[Browser] --> nginx[Static web / reverse proxy]
    nginx -->|/| assets[React assets]
    nginx -->|/api and /ws| api[Hono API]
    api --> pg[(PostgreSQL)]
    api -.-> redis[(Redis optional)]
~~~

Same-origin — рекомендованный self-hosted default: session cookies, CORS и WS проще. Docker entrypoint line endings должны быть нормализованы до green baseline.

### Split web/API

~~~mermaid
flowchart LR
    browser[Browser] --> web[Static web host]
    browser -->|HTTPS credentials| api[API host]
    browser <-->|WSS| api
    api --> pg[(PostgreSQL)]
    api -.-> redis[(Redis optional)]
~~~

Требования:

- один API base URL resolver для fetch и WebSocket;
- exact web origin allowlist;
- credentials include и корректные Secure/SameSite cookie settings;
- WSS при HTTPS;
- никакого build-time hardcode production hostname;
- config endpoint не раскрывает secrets;
- split mode входит в smoke/E2E matrix.

### Multi-instance

Несколько API instances используют один PostgreSQL. Outbox claim безопасен через SKIP LOCKED. Redis включается для cross-instance WebSocket fan-out и точной shared presence; operational writes/reads продолжают работать при его отсутствии, но multi-instance realtime объявляется degraded.

## 20. Strangler migration

Project/Task и Service/Incident не имеют достаточного semantic correspondence для dual-write. Migration использует expand -> coexist -> contract.

| Gate | Изменение | Reversibility | Exit criteria |
|---|---|---|---|
| M0 Baseline | Node 24/pnpm baseline, CRLF fix, tests/build/browser smoke | Полностью reversible | Green reproducible baseline |
| M1 Expand schema | Add product_mode и RelayOps tables/indexes/FKs; legacy untouched | Reversible binary rollback, additive DB remains | Upgrade/fresh migration tests; no legacy regression |
| M2 Dark API | Add slices/routes plus mandatory minimal outbox worker behind the RelayOps product gate | Reversible product flag; outbox is not independently disabled once Incident writes are enabled | Contract, auth, isolation, conflict и outbox tests green |
| M3 RelayOps shell | New routes/navigation for opted-in/new workspace | Reversible per-workspace mode; data not deleted | Demo journey, URL/realtime/a11y gates |
| M4 Legacy read-only | Disable legacy writes for opted-in workspace; retain export/read | Reversible toggle while legacy schema retained | Admin confirmation, export verified, support window announced |
| M5 Public rebrand | New legal-cleared name/assets/package metadata/images/chart | Reversible in source, release-sensitive | Trademark/assets/licenses/notices/SBOM cleared |
| M6 Contract | Remove legacy routes/components, later drop legacy tables | One-way after schema drop | Major release, backup/export, migration dry-run, explicit admin opt-in |

### Migration rules

- No Task -> Incident automatic backfill.
- No dual-write between legacy task/activity and incident/event.
- New tables and routes ship before legacy paths are hidden.
- Existing workspaces default legacy; product_mode changes only explicitly.
- New RelayOps data remains intact if UI gate rolls back; legacy binary may ignore it, но migration не удаляет rows.
- Contract migration is separated from feature release and never runs silently on startup without documented backup/export gate.
- Every schema change includes generated Drizzle migration, inspected SQL, fresh install test и upgrade test from baseline commit.
- One-way gate records product version and operator confirmation; rollback after table drop требует database restore.

## 21. Verification architecture

| Layer | Обязательное доказательство |
|---|---|
| Unit | Lifecycle policy, URL codec/idempotence, cursor codec, permission resolution, metric formulas, redaction |
| Component | Workbench states, conflict UI, saved-view precedence, connection states, table keyboard behavior, DnD menu parity |
| API unit | Zod/OpenAPI contracts, typed 409/422, status narrowing, middleware raw-param behavior |
| PostgreSQL integration | Workspace isolation, composite FK, concurrent expectedVersion race, idempotency, transaction rollback, outbox claim/retry |
| Migration | Fresh database, upgrade from Kaneo baseline, duplicate/orphan preflight, reversible expand migration |
| Realtime integration | Real WS handshake, unauthorized subscription, in-memory and Redis adapters, duplicate/gap handling |
| Browser E2E | Ten-step demo, two contexts, reconnect/refetch, Viewer 403, back/forward/share/refresh, pointer+keyboard DnD |
| Analytics | Deterministic fixtures for MTTA/MTTR/reopen/exclusions/timezone/export |
| Accessibility | axe zero serious/critical, keyboard happy path, focus restore, reduced motion, manual screen-reader smoke |
| Performance | 100k/1M fixture query plans, p95 API, scroll FPS, bundle budget, outbox/realtime latency |
| Security | Webhook forgery/replay/oversize/rate abuse, API-key scope/rate limit, SSRF redirect/rebinding, secret/log/WS leakage |
| Deployment | Same-origin and split smoke, Redis absent/present, image/Helm validation |

Outbox correctness minimum:

1. transaction rollback leaves neither incident change, event nor outbox row;
2. commit creates all three;
3. duplicate publish не создаёт duplicate UI timeline;
4. worker restart retries unpublished row;
5. remote client gap triggers refetch;
6. unauthorized workspace никогда не получает envelope.

## 22. Licensing, provenance и distribution

- Root LICENSE (MIT, Copyright 2024 Andrej Acevski) не удаляется и входит в source, release archive и container.
- README/legal notice сохраняет ссылку на upstream Kaneo и ясно говорит, что fork независимо поддерживается и не является official Kaneo product.
- apps/docs/LICENSE и package-specific LICENSE сохраняются, пока соответствующий derived content остаётся.
- До public release создаются THIRD_PARTY_NOTICES и SPDX/CycloneDX SBOM для source и каждого image.
- Новые Barlow Condensed, Atkinson Hyperlegible и IBM Plex Mono fonts добавляются только вместе с OFL provenance/license files.
- Kaneo logos, favicons, cloud claims, Product Hunt badge и misleading sponsor/official metadata заменяются.
- Public npm scope, GHCR path и Helm chart получают новый юридически очищенный namespace; @kaneo и ghcr.io/usekaneo не используются для modified releases.
- Docker images содержат /licenses, OCI source/license/revision labels и notices для Node, nginx, Alpine packages и bundled npm dependencies.
- Подозрительный copyright в packages/planka-import/LICENSE исправляется только после provenance review, не догадкой.
- Open-source attribution отделяется от hosted-service Terms/Privacy; Kaneo Cloud terms не переименовываются механически.

Рекомендуемая attribution:

> Derived from Kaneo (https://github.com/usekaneo/kaneo), originally copyright © 2024 Andrej Acevski, licensed under the MIT License. This project is independently maintained and is not presented as an official Kaneo product.

## 23. Architecture acceptance checklist

- Все Incident mutations проходят scoped policy; updates/transitions требуют expectedVersion, а каждый committed Incident mutation атомарно записывает incident state, incident_event и outbox_event.
- Service и Signal mutations используют собственные scoped transaction/audit contracts и не создают фиктивные incident_event; attach/create Incident делегируется Incident command.
- Нельзя создать cross-workspace relation ни через API, ни прямым FK-valid insert.
- Workbench URL воспроизводит effective view после refresh и во второй authorized session.
- Cursor не находится в URL и не может быть переиспользован с другим filter signature.
- TanStack Router/Query/Table/Virtual не дублируют ownership одного state.
- Initiating tab reconciles mutation локально; remote tab получает WS или восстанавливается refetch.
- Single-instance запускается без Redis; multi-instance degradation видим и документирован.
- Analytics definitions, sample, timezone и exclusions присутствуют в response/UI/export.
- Viewer получает 403 на forbidden mutation/export независимо от hidden UI.
- Pointer, keyboard и menu transition paths вызывают один command.
- Same-origin и split deployment проходят smoke.
- Legacy data не dual-write-ится и не удаляется до one-way gate.
- Root LICENSE, provenance, third-party notices и rebrand requirements входят в release gate.
