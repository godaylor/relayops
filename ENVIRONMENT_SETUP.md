# RelayOps — Windows / Docker Desktop

Все команды выполняются из корня RelayOps. Данные других проектов, процессы и Docker volumes не затрагиваются.

## Основной локальный сайт

Требуются Docker Desktop с Linux containers, Node 24+ и pnpm 10.32.1.
В этом workspace Node 24.19.0 установлен **локально** в `.local/node-v24.19.0-win-x64`; системная версия не менялась.

```powershell
$env:PATH = (Join-Path (Get-Location) '.local/node-v24.19.0-win-x64') + ';C:\Program Files\Git\usr\bin;' + $env:PATH
./scripts/local/ports.ps1
pnpm local:prepare
pnpm local:up
pnpm local:status
```

Открыть http://127.0.0.1:32000. Один контейнер объединяет web, Nginx и API. PostgreSQL доступен только в сети Compose; Redis, S3, SMTP и внешняя авторизация не нужны. Первый вход — регистрация, создание RelayOps workspace, сервиса и помеченного демоинцидента. Демо можно удалить штатной кнопкой; пользовательские данные она не удаляет.

`local:prepare` сохраняет существующий `.env`. При первом запуске в этом workspace он обнаружил прежний контейнер `relayops-codex-s3-postgres`, сохранил его PostgreSQL 15 image, имя БД и исходный anonymous volume. **Не запускайте старый контейнер одновременно с новым PostgreSQL.** Не меняйте major PostgreSQL поверх существующего volume. Другим клонам без такого контейнера создаётся именованный volume PostgreSQL 16. Ничего не удаляется автоматически.

Остановить только этот проект: `pnpm local:stop`. Не использовать `docker compose down -v`, `docker system prune` или остановку всех контейнеров.

## Порты

Все опубликованные порты привязаны к 127.0.0.1. Внутренние 5173 / 1337 / 5432 не меняются.

| Порт | Назначение |
|---|---|
| 32000 | Основной сайт, same-origin API по /api |
| 32001 | API только в альтернативном split-режиме |
| 32002 | Резерв для дополнительного proxy / Helm port-forward |
| 32010 / 32011 | Резерв для доступа Windows к PostgreSQL / Redis; не опубликованы |
| 32020 | Опциональный dev публичной страницы, не нужен основному сайту |
| 32040 | Изолированная тестовая PostgreSQL |
| 32041 | Изолированный bundled браузерный стенд |
| 32042 / 32043 | Временная split-проверка web / API |
| 32044–32051 | Временные HTTP/WS abuse-тесты |
| 32060 | Временный второй bundled API/web для Redis failover-проверки |
| 32070–32089 | Релизные preview; 32070 — основной резерв |
| 32090–32099 | Резерв для замены занятого 32000 |

Проверены Windows IPv4/IPv6 excluded ranges и слушатели: конфликтов в 32000–32099 не было. Фактический выбор записан в `.local/ports.json`. Если 32000 занят при **первой** подготовке, выбирается свободный 32090–32099 и синхронно задаётся public URL. Существующий `.env` не переписывается; перед каждым запуском проверьте порты. Не занимайте порт другого проекта и не отключайте Windows reservations.

## Альтернативный split-режим

Не запускайте одновременно с bundled сайтом на 32000.

```powershell
docker compose stop relayops
docker compose -f compose.local.yml up -d --build --wait
```

Web — 127.0.0.1:32000, API — 127.0.0.1:32001. Используются тот же PostgreSQL volume и uploads volume. Для возврата остановите только `api` и `web` в split-compose и запустите обычный Compose.

Native `pnpm dev` запускает только API и web, не маркетинговый сайт, MCP и email preview. Для native API отдельно нужен доступ к dev-БД и явный `DATABASE_URL`; не направляйте его на тестовую БД одновременно с integration-тестами. Если нужен доступ Windows к постоянной локальной БД, добавьте **локальный** override `127.0.0.1:32010:5432` после проверки порта. Не публикуйте БД без необходимости.

## URL и секреты

Корневой `.env` — серверные значения. `apps/web/.env.local` — Vite overrides; не копируйте в него секреты.

- `KANEO_CLIENT_URL` — точный browser origin (локально http://127.0.0.1:32000).
- `KANEO_API_URL` — browser API origin или URL с /api; bundled entrypoint выводит его из client URL.
- `KANEO_INTERNAL_API_URL` — локальный API для MCP; внутри bundled image это http://127.0.0.1:1337, native — порт `PORT` или 32001.
- `CORS_ORIGINS` — только явные разрешённые origins. Пустое значение **не разрешает все origins**. Production split требует явного frontend origin.
- `AUTH_SECRET` — постоянный случайный ключ. Смена инвалидирует сессии.
- `NOTIFICATION_SECRET_ENCRYPTION_KEY` и `RELAYOPS_WEBHOOK_ENCRYPTION_KEY=hex:<64 hex>` — постоянные ключи; старые версии сохраняются в keyring при ротации. Подробности в README.
- `HOST` — 127.0.0.1 native, 0.0.0.0 только внутри изолированного контейнера.
- `DISABLE_EMAIL_OTP_SIGN_IN=true` — локальный вход с паролем без SMTP.
- SSO, SMTP, Redis, billing, Sentry и Turnstile остаются opt-in. Не включайте `KANEO_CLOUD` для локального демо.
- Только публичные `KANEO_TURNSTILE_SITE_KEY` и `KANEO_SENTRY_DSN` могут дополнительно подставляться в web bundle; произвольные KANEO_* переменные туда не копируются.

## Резервирование / обновление

`node scripts/local/backup.mjs` сохраняет SQL dump в игнорируемую `.local/backups`.
До первого S14 старта сохранён исходный dump. Храните вместе SQL, upload volume и отдельную защищённую копию `.env`/keyrings. Не коммитьте их.
API применяет additive migrations при старте. Legacy→RelayOps включается явно; автоматического преобразования старых задач или dual-write нет. При ошибке остановите **только приложение**, сохраните БД, устраните причину. Не откатывайте схему удалением данных; restore сначала проверяется на отдельной БД.

## Проверки

Выполнять тяжёлые команды последовательно. Git for Windows предоставляет sed для существующего env.sh теста; добавление в PATH выше относится только к текущему PowerShell.

```powershell
pnpm install --frozen-lockfile
pnpm exec turbo typecheck --concurrency=1 --force
pnpm exec turbo test --concurrency=1 --force
pnpm exec turbo build --concurrency=1 --force
pnpm i18n:check
pnpm check:line-endings
docker compose -p relayops-verify -f compose.verify.yml up -d --wait postgres
$env:DATABASE_URL = 'postgresql://postgres:relayops-local-verification-only@127.0.0.1:32040/relayops_verify_test'
pnpm --filter @kaneo/api test:integration
docker compose -p relayops-verify -f compose.verify.yml up -d --wait app
pnpm smoke:browser
```

Тестовый app должен быть остановлен во время integration/performance: его outbox worker иначе вмешивается в fixtures. Тестовая БД в tmpfs; остановка её контейнера удаляет **только disposable fixtures**. Не выполняйте integration-тесты на прежней БД `kaneo_test`, несмотря на её суффикс. Opt-in `RELAYOPS_PERF=1` включает 100k/1M fixtures; после прогона удалите эту переменную из текущего shell.

Проверка source-release: `pnpm release:licenses`, затем `pnpm release:check`. Это не разрешение публиковать. См. RELEASE_PREFLIGHT.md и PLAN.md.

Полный browser command запускает `relayops-*.spec.ts`. Исторический `baseline-smoke.spec.ts` сохраняет исходный S0 Kaneo-сценарий; создание Project/Task не является acceptance нового RelayOps.

Временные deployment-матрицы используют только test PostgreSQL, не основной volume:

```powershell
docker compose -p relayops-verify -f compose.verify.yml stop app
docker compose -p relayops-verify -f compose.verify.yml -f compose.verify-split.yml up -d --wait split-api split-web
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:32042'
$env:PLAYWRIGHT_API_URL = 'http://127.0.0.1:32043'
pnpm exec playwright test tests/e2e/relayops-s10.spec.ts tests/e2e/relayops-s14.spec.ts
Remove-Item Env:PLAYWRIGHT_BASE_URL,Env:PLAYWRIGHT_API_URL
docker compose -p relayops-verify -f compose.verify.yml -f compose.verify-split.yml stop split-api split-web

docker compose -p relayops-verify -f compose.verify.yml -f compose.verify-redis.yml up -d --wait
$env:PLAYWRIGHT_SECONDARY_BASE_URL = 'http://127.0.0.1:32060'
pnpm exec playwright test tests/e2e/relayops-s10.spec.ts --grep 'ten-step'
Remove-Item Env:PLAYWRIGHT_SECONDARY_BASE_URL
```

Redis overlay требует Compose с поддержкой `!override` (2.24.4+). Не считайте Redis обязательным: основной Compose его не запускает. При недоступном Redis межсерверная live-доставка деградирует; durable state остаётся в PostgreSQL, reconnect/refetch восстанавливает истину. Failure/recovery evidence и пределы проверки записаны в RELEASE_PREFLIGHT.md.
