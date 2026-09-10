# Варианты продуктовой трансформации

**Дата:** 2026-08-27  
**Статус:** решение до реализации  
**Ограничение:** ни один вариант не связан с банковским кредитованием

## Цель выбора

Нужен не reskin Kaneo, а продукт с другой основной сущностью, job-to-be-done, информационной архитектурой и моделью решений. При этом трансформация должна максимально показать уровень Middle+ frontend/full-stack:

- complex server-driven tables;
- faceted filters, sort, grouping и saved views;
- validated URL state и deep links;
- realtime, reconnect и optimistic reconciliation;
- granular roles и API authorization;
- interactive analytics и cross-filtering;
- pointer/touch/keyboard drag-and-drop;
- PostgreSQL migrations, typed API и продуманную test architecture.

## Критерии и шкала

Оценка от 1 до 5, где 5 — лучший результат. Для «скорости» 5 означает наиболее быстрый путь к убедительному portfolio-grade vertical MVP.

| Критерий | Вес | Что измеряется |
|---|---:|---|
| Скорость реализации | 15% | Насколько много текущей платформы можно безопасно переиспользовать без ощущения Kaneo reskin |
| Вау-эффект | 25% | Насколько демо понятно за 3–5 минут и визуально запоминается |
| Техническая глубина | 30% | Data grid, realtime, concurrency, analytics, RBAC, DnD, API/DB depth |
| Ценность для работодателя | 30% | Насколько решение похоже на сложный B2B SaaS и даёт материал для архитектурного интервью |

Оценки сроков — относительные person-weeks для одного сильного разработчика при работе по `PLAN.md`, а не обещание календарной даты.

## Вариант A — RelayOps: realtime incident operations

`RelayOps` — рабочий codename без trademark clearance.

### Продукт

Операционный центр для команд, которые обнаруживают, координируют и разбирают production incidents. Пользователь управляет не задачами, а состоянием сервисов, сигналами, инцидентами, ответственностью и временем восстановления.

Основные сущности:

- Service;
- Incident;
- Signal;
- Responder / Incident Commander;
- Timeline event;
- Saved view;
- Response policy и role capabilities.

### Ключевые сценарии

1. Alert webhook создаёт signal или incident draft.
2. Responder открывает общий Incident Workbench с URL-backed filters.
3. Incident Commander назначает severity, affected services и response team.
4. Incident проходит управляемые состояния через accessible DnD или menu alternative.
5. Incident Room показывает live timeline, presence, concurrent updates и connection state.
6. После resolution аналитика считает MTTA/MTTR, severity distribution и service hotspots.

### Где демонстрируется Middle+ уровень

- Virtualized incident table с server-side cursor pagination, multi-sort, faceting и column persistence.
- Route search schema как canonical view state; copied URL полностью воспроизводит workbench.
- Realtime room с durable timeline, optimistic updates, version conflicts, reconnect/refetch.
- State machine и transactional reorder вместо O(n) card updates.
- RBAC: Viewer, Responder, Incident Commander, Service Owner, Workspace Admin.
- Analytics: chart -> URL filter -> table -> deep-linked inspector.
- Webhook ingestion, idempotency keys и audit trail.
- Two-context browser E2E для realtime и role denial.

### Почему это не Kaneo

- Главная поверхность — cross-service operations workbench, а не project board.
- Время, severity, impact, responders и service health — first-class domain fields.
- Board — вторичная проекция state machine, а не центр продукта.
- Durable incident timeline важнее comments/activity feed.
- Analytics отвечает на reliability questions, а не считает выполненные tasks.
- Backlog, Gantt и project planning не входят в core experience.

### Reuse / replacement

Переиспользуется: workspace/auth/RBAC foundation, Hono/OpenAPI client, Query/Router, WebSocket adapters, inspector pattern, activity primitives, i18n, Docker/Helm.

Заменяется: project/task IA, dashboard, primary navigation, domain schema, board semantics, onboarding, analytics, visual identity и product copy.

### Риски

- Нельзя выдавать best-effort EventEmitter за durable incident history.
- Нужны строгие definitions метрик и timestamps.
- Concurrent updates требуют versioning и понятного conflict UX.
- Название, fonts и brand assets требуют отдельного clearance.

### Оценка

Portfolio-grade vertical MVP: ориентир 7–9 person-weeks. Полный public-ready scope: 12+ weeks.

## Вариант B — CargoPulse: supply-chain exception control tower

`CargoPulse` — рабочий codename без trademark clearance.

### Продукт

Контрольная башня для команд, которые отслеживают shipments и решают exceptions: задержки, повреждения, customs hold, missed handoff и SLA breach.

Основные сущности:

- Shipment;
- Route leg;
- Carrier;
- Facility;
- Exception;
- Resolution owner;
- Milestone event;
- Saved operational view.

### Ключевые сценарии

1. Shipment events поступают через webhook/import.
2. Dispatcher видит exception queue с faceted filters и SLA countdown.
3. Exceptions группируются по carrier/facility/severity и открываются в side inspector.
4. Dispatcher перетаскивает exception между resolution lanes или переназначает route leg.
5. Realtime timeline показывает новые milestone events и смену ETA.
6. Analytics сравнивает on-time rate, dwell time, carrier performance и exception aging.

### Где демонстрируется Middle+ уровень

- Очень плотная table surface с grouped rows, frozen columns и bulk actions.
- URL-native operational views.
- Realtime event stream и computed ETA/SLA states.
- Map/timeline/table coordination.
- Role model: Dispatcher, Carrier Partner, Operations Lead, Analyst, Admin.
- DnD между resolution queues с server validation.
- Time-series и cohort analytics.

### Почему это не Kaneo

Основная модель — физическое движение груза, route legs и milestone events. Карточка «задачи» не может выразить маршрут, ETA, carrier и facility relationships без фундаментальной смены модели.

### Reuse / replacement

Переиспользуется platform shell и collaboration infrastructure. Почти полностью заменяются task/project schema, навигация и views. Добавляются geo/timezone normalization, import validation и event deduplication.

### Риски

- Map provider, tiles и geocoding создают стоимость, licensing и offline/self-hosting вопросы.
- Реалистичный demo dataset сложнее сгенерировать и объяснить.
- ETA logic легко превратить в недостоверную «магическую» аналитику.
- Multi-party data visibility значительно усложняет authorization.

### Оценка

Portfolio-grade vertical MVP: ориентир 9–12 person-weeks. Наиболее эффектный визуально, но самый рискованный по scope.

## Вариант C — PatchFlow: vulnerability remediation hub

`PatchFlow` — рабочий codename без trademark clearance.

### Продукт

Платформа для нормализации security findings из scanners, приоритизации remediation и контроля SLA по assets, teams и risk policies.

Основные сущности:

- Asset;
- Finding;
- Vulnerability;
- Scanner source;
- Remediation campaign;
- Exception/acceptance;
- SLA policy;
- Audit event.

### Ключевые сценарии

1. Scanner webhook/import upsert-ит findings по idempotent fingerprint.
2. Security analyst исследует finding workbench с compound filters.
3. Findings группируются по asset/CVE/team и объединяются в campaign.
4. Campaign stages управляются DnD и policy validation.
5. Asset owner видит только разрешённый scope и запрашивает risk acceptance.
6. Analytics показывает exposure age, SLA breaches, reopen rate и remediation throughput.

### Где демонстрируется Middle+ уровень

- Нормализация данных нескольких источников и deduplication.
- Большие таблицы, faceting, grouping, saved views и export.
- Policy-driven roles и approval workflow.
- Realtime scanner ingestion и bulk cache updates.
- DnD campaign planning.
- Analytics с severity/risk weighting и data-quality states.
- Security-focused integration and abuse tests.

### Почему это не Kaneo

Central object — finding на asset, а не task в project. Risk, evidence, scanner provenance, deduplication и SLA policy меняют и schema, и UX, и authorization.

### Reuse / replacement

Переиспользуется auth/workspace/RBAC, integrations plumbing и inspector pattern. Заменяются task/project surfaces; добавляются ingestion pipeline, data normalization и approval/audit model.

### Риски

- CVE/CVSS/EPSS terminology требует domain accuracy и регулярных data feeds.
- Пользователь может принять demo scoring за реальную security recommendation.
- Scanner integrations и realistic fixtures увеличивают backend scope.
- UX сложнее объяснить нетехническому interviewer.

### Оценка

Portfolio-grade vertical MVP: ориентир 8–11 person-weeks.

## Сравнительная оценка

| Вариант | Скорость, 15% | Вау, 25% | Глубина, 30% | Для работодателя, 30% | Weighted total |
|---|---:|---:|---:|---:|---:|
| RelayOps | 4 | 5 | 5 | 5 | **4.85 / 5** |
| CargoPulse | 3 | 5 | 5 | 4 | **4.40 / 5** |
| PatchFlow | 3 | 4 | 5 | 5 | **4.45 / 5** |

## Решение

Выбран **RelayOps**.

### Почему

1. **Лучший баланс reuse и глубины.** Существующие workspaces, roles, events, WebSockets и inspector ускоряют vertical slice, но новая service/incident/timeline model не выглядит переименованными tasks.
2. **Realtime имеет продуктовый смысл.** Presence, connection health, concurrent incident updates и timeline важны пользователю, а не добавлены ради технологии.
3. **Таблица и аналитика естественны.** Incident queue, saved views, MTTA/MTTR и service breakdown образуют один связный workflow.
4. **DnD не декоративный.** Он управляет разрешёнными state transitions и имеет keyboard/menu alternatives.
5. **Сильный разговор на интервью.** Можно обсуждать optimistic concurrency, outbox, authorization matrix, URL state, cursor pagination, indexes, retry/idempotency, a11y и performance budgets.
6. **Понятное демо.** Сценарий «пришёл сигнал -> создан incident -> два пользователя координируются -> resolution -> analytics» объясняется без отраслевого onboarding.

### Почему не CargoPulse

Вау-эффект карты выше, но geo provider, ETA credibility, multi-party authorization и realistic data отодвигают важные frontend/full-stack решения за инфраструктурный scope.

### Почему не PatchFlow

Техническая ценность почти равна RelayOps, но domain accuracy, data feeds и риск псевдо-security claims усложняют портфолио. RelayOps лучше показывает realtime collaboration, не требуя внешней vulnerability intelligence.

## Проверка на «не reskin»

RelayOps считается глубокой трансформацией только если одновременно выполнены все условия:

- Project/Task не являются главной навигацией и domain vocabulary.
- Landing — Operations Overview, а не project list.
- Главная рабочая поверхность — Incident Workbench table.
- Incident Room имеет durable timeline и realtime collaboration.
- DnD подчинён incident state machine и server policy.
- Analytics основана на incident timestamps и services.
- Roles выражают response authority, а не generic member/admin labels.
- Onboarding создаёт service + demo signal/incident, а не project + task.
- Visual system, typography, density, icons и copy не повторяют Kaneo.
- LICENSE и upstream attribution сохраняются независимо от нового бренда.

Если хотя бы первые шесть пунктов заменены только labels и CSS, вариант отклоняется как reskin.
