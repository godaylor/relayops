# Free runtime: Render and Neon

`render.yaml` deploys the existing bundled React/Nginx + Hono/WebSocket application
as one explicitly **Free** Render web service. Supply a separate Neon **Free**
PostgreSQL database using `DATABASE_URL`; do not select Render's expiring free
PostgreSQL database. No Redis, paid disks, separate workers, SMTP or storage account
are required for the RelayOps incident workflow.

## Provision

1. Create an isolated Neon Free project named `relayops`, preferably in Frankfurt.
   Keep the Free plan; do not upgrade or reuse another product's database.
2. Copy its PostgreSQL connection URI into Render's secret `DATABASE_URL` input.
   Retain TLS parameters. Use the direct endpoint for this single instance so
   startup migrations and transactions have normal PostgreSQL session semantics.
3. Create a Render Blueprint from `https://github.com/godaylor/relayops`, branch
   `main`, file `render.yaml`. Review that the only resource is a Free web service
   named `relayops-godaylor`. Leave paid resources and add-ons disabled.
4. Deploy. Render generates persistent authentication and encryption secrets.
   The entrypoint uses `RENDER_EXTERNAL_URL` for the public origin and derives the
   correctly encoded webhook encryption key from an independent generated secret.
   Keep those values across redeploys and include them in encrypted backups.
5. Verify the actual assigned HTTPS URL with the public acceptance scenario in
   [PRODUCTION_DEPLOY.md](PRODUCTION_DEPLOY.md). Publish that URL only after it
   passes; a successful build or a Pages page is not a working runtime.

## Runtime and durability

The API uses three PostgreSQL connections at most in `RELAYOPS_RESOURCE_PROFILE=free`.
Its outbox drains at startup, after incident or signal HTTP mutations, and every
15 minutes while idle. Failures trigger one-second polling through the retry
window. PostgreSQL retains incident history and pending events; reconnecting
clients refetch authoritative state. An idle process interrupted during a future
retry can recover the event on the next mutation or periodic drain. Run only one
API instance with this profile. Normal self-hosted polling is unchanged.

Legacy task reminders and billing scheduler jobs are disabled only in this
profile. RelayOps incident transitions, signals, timeline, analytics and realtime
remain live. User avatars already live in PostgreSQL. The optional legacy
project/task S3 attachment feature still requires an explicitly configured S3
provider; do not write durable user files to Render's ephemeral filesystem.

## Free-plan limits

Render Free sleeps after 15 minutes without inbound traffic, so the next visitor
can encounter a cold start. Its 750 free instance hours per month are shared by
the workspace's services. Other projects must remain untouched: do not stop them
to recover quota. Do not add uptime pings, which defeat sleeping and consume the
shared allowance. Free hosting cannot promise uninterrupted availability.

Check the account's current usage and billing controls before provisioning. Do
not authorize paid overages or upgrades. If free quota is exhausted, wait for its
reset or obtain the owner's decision. Neon limits compute, storage and transfer;
monitor these in the project dashboard and export regular encrypted SQL backups.

Pricing and limitations: [Render Free](https://render.com/docs/free),
[Neon pricing](https://neon.com/pricing),
[Render Blueprint reference](https://render.com/docs/blueprint-spec).

Deployment status: configuration prepared; public runtime acceptance pending.

## Local verification

Build `docker build -f Dockerfile.kaneo -t relayops:free-tier .`, then use
`docker compose -p relayops-free-verify -f compose.verify.yml -f compose.verify-free.yml up -d --wait`.
Always pass the explicit project name: root `.env` can override a Compose file's
`name`. Check ports 32040/32041 first, or override `RELAYOPS_TEST_DB_PORT` and
`RELAYOPS_TEST_WEB_PORT` with unused ports. Stop only that test project's `app`
and `postgres` services after verification. Never use global stop or prune.
