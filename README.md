# RelayOps

RelayOps — self-hosted платформа для операционного реагирования на инциденты в реальном времени. Продукт строится вокруг модели **Service → Signal → Incident → неизменяемая Timeline** и сохраняет PostgreSQL как источник истины, Hono API как границу авторизации и WebSocket-события как механизм актуализации клиентов.

Русский язык используется по умолчанию. Публичный переключатель `RU / EN` переводит пользовательский интерфейс целиком и сохраняет выбор после перезагрузки.

## Текущий статус

Локальная версия для демонстрации в портфолио готова: основные сценарии, русский интерфейс, переключение EN и релизная сборка проверены. Продукт предназначен для некоммерческого portfolio/demo release. Владелец явно разрешил demo-публикацию с отложенной ручной NVDA/VoiceOver-проверкой; статус публикации и оставшиеся проверки перечислены в [RELEASE_PREFLIGHT.md](RELEASE_PREFLIGHT.md), этапы — в [PLAN.md](PLAN.md).

## Что входит в RelayOps

- Operations Overview с live incident clock rail;
- server-filtered и virtualized Incident Workbench с URL-native состоянием;
- Response Board с pointer, keyboard и menu parity;
- Incident Room с append-only timeline, optimistic concurrency и realtime refetch;
- Services, signed signal ingestion, role-aware analytics и API-authoritative RBAC;
- single-instance режим без Redis, split web/API и optional Redis fan-out.

## Запуск для разработки

Требования среды:

- Docker с Compose;
- Node.js `>=24` внутри проектных контейнеров;
- pnpm `10.32.1` через Corepack;
- PostgreSQL 16 для новых установок; этот workspace сохраняет существующий PostgreSQL 15 volume без смены major.

Используйте существующие `compose.yml` и `compose.local.yml`, сохраняя заданные проекту имена контейнеров, сети, volumes и host-порты. Переменные среды описаны в [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md). Не используйте production-базы данных или production-секреты для локальной разработки и тестов.

Основной запуск: `pnpm local:prepare`, затем `pnpm local:up`. Сайт — **http://127.0.0.1:32000**; встроенный API доступен через `/api`. Все host-порты ограничены диапазоном 32000–32099 и loopback. PostgreSQL и uploads сохраняются в volumes, Redis/SMTP не обязательны. Перед первым запуском проверьте `scripts/local/ports.ps1`.

Альтернативный split API использует 32001, тестовый стенд — 32040/32041, релизный preview — 32070. Полная схема и безопасное переключение режимов находятся в руководстве среды. Логи проверок и локальные учётные данные не входят в Git.

Состав и точный остаток до публикации: [RELEASE_PREFLIGHT.md](RELEASE_PREFLIGHT.md). `pnpm release:licenses` создаёт manifest SBOM/notices; `pnpm release:check` проверяет локальные source-gates. Release по умолчанию dry-run; публикационные workflow требуют отдельных opt-in gates и запрещают upstream.

## CI и бесплатный portfolio deploy

GitHub Actions запускают lint, i18n, typecheck, unit/integration tests, production build, Docker build, Gitleaks, CodeQL и dependency review. Публикационные workflow fail-closed: они не работают в `usekaneo/kaneo` и требуют repository variables `RELAYOPS_PUBLISH_ENABLED=true` и `RELAYOPS_RELEASE_APPROVED=true`.

Статическая RU/EN portfolio-страница из `apps/site` публикуется бесплатно через GitHub Pages. Workflow автоматически учитывает подпуть project Pages (`/<repository>/`) и не выдаёт локальный runtime за публичное приложение. Если приложение действительно развернуто отдельно, задайте repository variable `RELAYOPS_APP_URL` его публичным HTTPS URL. Сам RelayOps runtime требует PostgreSQL и публикуется отдельно через Docker/Compose или Helm; GitHub Pages размещает только статическое портфолио.

### Ключи шифрования секретов

- `NOTIFICATION_SECRET_ENCRYPTION_KEY` задаёт текущий ключ для секретов каналов уведомлений; `NOTIFICATION_SECRET_ENCRYPTION_KEY_ID` задаёт его идентификатор. Старые ключи на время ротации передаются JSON-объектом `NOTIFICATION_SECRET_DECRYPTION_KEYS` в формате `{"old-key-id":"old-secret"}`.
- `RELAYOPS_WEBHOOK_ENCRYPTION_KEY` задаёт 32-байтовый ключ источников webhook в формате `hex:<64 hex-символа>` или `base64:<значение>`. Версия задаётся через `RELAYOPS_WEBHOOK_ENCRYPTION_KEY_VERSION`, а прежние версии на время ротации — JSON-объектом `RELAYOPS_WEBHOOK_ENCRYPTION_KEYS`.
- Не удаляйте прежний ключ из keyring, пока все записи, зашифрованные им, не мигрированы и не проверены. При отсутствии нужного ключа расшифровка завершается с ошибкой без выдачи или перезаписи секрета; восстановление выполняется возвратом соответствующего ключа с тем же идентификатором/версией и повторным запуском ограниченной миграции.

Значения ключей нельзя фиксировать в репозитории, логах или Docker image layers.

## Архитектура и продукт

- [Спецификация трансформации](docs/TRANSFORMATION_SPEC.md)
- [Целевая архитектура](docs/ARCHITECTURE.md)
- [Аудит исходной системы](docs/BASELINE_AUDIT.md)
- [Продуктовые решения](docs/PRODUCT_OPTIONS.md)
- [План этапов и gates](PLAN.md)

Внутренние package names `@kaneo/*`, переменные `KANEO_*`, API-контракты и путь `charts/kaneo` сохранены для совместимости. Имя выпускаемого chart — `relayops`; будущие images — `relayops`, `relayops-web`, `relayops-api` в namespace владельца. Старые npm-пакеты не публикуются. После переименования корня выполните frozen install: Windows junctions в node_modules могут содержать прежний абсолютный путь.

## Происхождение и лицензия

RelayOps создан на основе [Kaneo](https://github.com/usekaneo/kaneo), разработанного Andrej Acevski и сообществом Kaneo. Этот проект не является официальным продуктом Kaneo и не имеет официального одобрения Kaneo.

Исходные части Kaneo сохраняют MIT-лицензию и авторское уведомление исходного проекта — см. [LICENSE](LICENSE). Новый код, документация и source-defined brand assets RelayOps принадлежат Maxeem и доступны по отдельной [MIT-лицензии RelayOps](LICENSE-RELAYOPS). Граница авторства и обязательные ссылки собраны в [NOTICE](NOTICE), а сведения о сторонних компонентах и шрифтах — в [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES). Эти файлы входят в генерируемые artifact-level inventories.

Публичное имя RelayOps утверждено владельцем этого репозитория для некоммерческого portfolio/demo release. Это утверждение не означает, что была проведена формальная юридическая проверка товарного знака или домена.
