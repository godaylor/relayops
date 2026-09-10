import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const domain = process.argv[2];
if (
  !domain ||
  !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(
    domain,
  )
) {
  throw new Error(
    "Usage: node scripts/production-prepare.mjs app.example.com (hostname only)",
  );
}
const secret = () => randomBytes(32).toString("hex");
// Exclusive creation prevents accidental rotation of secrets for an existing deployment.
writeFileSync(
  ".env.production",
  [
    `RELAYOPS_DOMAIN=${domain.toLowerCase()}`,
    `AUTH_SECRET=${secret()}`,
    `NOTIFICATION_SECRET_ENCRYPTION_KEY=${secret()}`,
    `RELAYOPS_WEBHOOK_ENCRYPTION_KEY=hex:${secret()}`,
    `POSTGRES_PASSWORD=${secret()}`,
    "",
  ].join("\n"),
  { flag: "wx", mode: 0o600 },
);
console.log(
  "Created .env.production. Store an encrypted backup; keep this file out of Git.",
);
