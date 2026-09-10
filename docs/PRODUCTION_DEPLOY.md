# Public RelayOps deployment

The application runs as one Node/Hono + React/Nginx container, PostgreSQL 16 and a Caddy HTTPS gateway. Redis, SMTP, S3, paid authentication and a background-job service are not required. The API runs its transactional outbox worker. Uploads and database records use separate persistent volumes. This deploys the working application, not the Pages site.

## Host

Use a Linux Docker Compose host with sufficient memory to build the monorepo (4 GB RAM is a practical starting point), a hostname pointing to it, and inbound TCP 80/443. No hosting account or server credentials are configured in this checkout. Do not expose this workstation or reuse its database as production.

```sh
git clone https://github.com/godaylor/relayops.git
cd relayops
node scripts/production-prepare.mjs app.example.com
docker compose --env-file .env.production -f compose.production.yml config --quiet
docker compose --env-file .env.production -f compose.production.yml up -d --build --wait
```

Run these commands after the implementation has been pushed. The prepare command requires Node 24+, refuses to overwrite existing secrets, and prints no secret values. Protect `.env.production` with host file permissions and an encrypted off-host backup. Caddy obtains and renews certificates; it proxies WebSocket upgrades. Only the gateway publishes ports. On a shared server, use its existing reverse proxy or explicitly assign free gateway ports; never stop another application to free 80/443.

## Verify the public application

Open the actual HTTPS hostname. Register a new account, create a workspace and service, create an ordinary incident, add a timeline update, transition the incident through the board, resolve it with a summary, and inspect Analytics. Reload to verify persistence. Open a second session to verify realtime updates. Verify a second workspace cannot read the first one's incident. Test RU/EN and a narrow screen. Do not mark production ready based on localhost checks.

## Backup and updates

Before updates, record the deployed Git revision and back up the SQL database, uploads and encryption keys together. For example, on the Linux host:

```sh
umask 077
mkdir -p backups
docker compose --env-file .env.production -f compose.production.yml exec -T postgres pg_dump -U relayops -d relayops > backups/database.sql
docker compose --env-file .env.production -f compose.production.yml exec -T app tar -czf - -C /app/apps/api/data . > backups/uploads.tar.gz
```

For a consistent database/upload snapshot, put the application into a maintenance window while capturing both; do not stop other Compose projects. Encrypt and copy backups off-host. Restore into a separate isolated stack and verify the records and attachments before relying on backups. Never run `down -v` against production. Migrations run on startup; retain the previous image and use forward fixes if schema changes preclude an application rollback.

The Coolify alternative is `compose.coolify.yml`. Use the same persistent-key and backup rules. Optional SMTP/OAuth integrations require their own credentials and callback verification; password login works without them.
