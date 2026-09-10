import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

process.chdir(resolve(import.meta.dirname, "../.."));
function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(`Docker ${args[0]} failed: ${result.stderr}`);
  return result.stdout.trim();
}
function available(port) {
  return new Promise((done) => {
    const server = createServer();
    server.once("error", () => done(false));
    server.listen(port, "127.0.0.1", () => server.close(() => done(true)));
  });
}
if (existsSync(".env")) {
  console.log("Existing .env preserved; no secrets or volumes changed.");
  process.exit(0);
}
const ids = docker([
  "ps",
  "-aq",
  "--filter",
  "name=^/relayops-codex-s3-postgres$",
]);
let volume = "relayops_postgres_data";
let image = "postgres:16-alpine";
let database = "relayops";
let user = "relayops";
let password = randomBytes(32).toString("hex");
if (ids) {
  const [old] = JSON.parse(docker(["inspect", ids]));
  if (old.State.Running)
    throw new Error(
      "Existing RelayOps PostgreSQL is running. Do not mount its data in a second server.",
    );
  const mount = old.Mounts.find(
    (item) => item.Destination === "/var/lib/postgresql/data",
  );
  if (mount?.Type !== "volume")
    throw new Error(
      "Existing PostgreSQL storage needs an explicit volume mapping.",
    );
  volume = mount.Name;
  image = old.Config.Image;
  const env = Object.fromEntries(
    old.Config.Env.map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1)];
    }),
  );
  database = env.POSTGRES_DB;
  user = env.POSTGRES_USER;
  password = env.POSTGRES_PASSWORD;
  if (!database || !user || !password)
    throw new Error(
      "Existing PostgreSQL credentials are incomplete; no changes made.",
    );
} else {
  docker([
    "volume",
    "create",
    "--label",
    "com.relayops.purpose=local-data",
    volume,
  ]);
}
let port;
for (const candidate of [
  32000,
  ...Array.from({ length: 10 }, (_, i) => 32090 + i),
]) {
  if (await available(candidate)) {
    port = candidate;
    break;
  }
}
if (!port)
  throw new Error("No available website port in 32000 or 32090–32099.");
const values = {
  COMPOSE_PROJECT_NAME: "relayops",
  RELAYOPS_WEB_PORT: port,
  RELAYOPS_API_PORT: 32001,
  RELAYOPS_PUBLIC_URL: `http://127.0.0.1:${port}`,
  RELAYOPS_POSTGRES_IMAGE: image,
  RELAYOPS_POSTGRES_VOLUME: volume,
  POSTGRES_DB: database,
  POSTGRES_USER: user,
  POSTGRES_PASSWORD: password,
  AUTH_SECRET: randomBytes(48).toString("hex"),
  NOTIFICATION_SECRET_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  RELAYOPS_WEBHOOK_ENCRYPTION_KEY: "hex:" + randomBytes(32).toString("hex"),
  DISABLE_EMAIL_OTP_SIGN_IN: "true",
  DISABLE_GUEST_ACCESS: "true",
  KANEO_CLOUD: "false",
};
// Generated secrets stay local and never enter the repository or image context.
writeFileSync(
  ".env",
  Object.entries(values)
    .map(([key, value]) => `${key}='${String(value).replaceAll("'", "\\'")}'`)
    .join("\n") + "\n",
  { flag: "wx", mode: 0o600 },
);
mkdirSync(".local", { recursive: true });
writeFileSync(
  ".local/ports.json",
  JSON.stringify(
    {
      website: port,
      api: 32001,
      testDatabase: 32040,
      testWebsite: 32041,
      releasePreview: 32070,
      replacement: port !== 32000,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Prepared http://127.0.0.1:${port}; PostgreSQL ${image}, preserved volume ${volume}. Credentials not printed.`,
);
