import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import net from "node:net";
import { serve } from "@hono/node-server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

const envNames = [
  "NODE_ENV",
  "CORS_ORIGINS",
  "KANEO_CLIENT_URL",
  "KANEO_WS_MESSAGE_LIMIT_BYTES",
  "KANEO_WS_MESSAGES_PER_MINUTE",
  "KANEO_WS_IDLE_TIMEOUT_MS",
  "KANEO_WS_CONNECTIONS_PER_USER",
  "KANEO_WS_CONNECTIONS_PER_INSTANCE",
] as const;
const originalEnv = Object.fromEntries(
  envNames.map((name) => [name, process.env[name]]),
) as Record<(typeof envNames)[number], string | undefined>;

type RawWebSocket = {
  socket: net.Socket;
  status: number;
  remainder: Buffer;
};

function hashApiKey(key: string) {
  return createHash("sha256")
    .update(key)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function createApiKey() {
  const member = await createWorkspaceMember();
  const rawKey = `kaneo_ws_${randomUUID()}`;
  const now = new Date();
  await db.insert(schema.apikeyTable).values({
    referenceId: member.user.id,
    userId: member.user.id,
    key: hashApiKey(rawKey),
    name: "real websocket security test",
    start: rawKey.slice(0, 12),
    prefix: "kaneo",
    createdAt: now,
    updatedAt: now,
  });
  return { member, rawKey };
}

async function startTestServer() {
  const created = createApp();
  const server = serve({
    fetch: created.app.fetch,
    hostname: "127.0.0.1",
    port: 32045,
  });
  created.injectWebSocket(server);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an ephemeral TCP address");
  }
  return { server, port: address.port };
}

async function openRawWebSocket({
  port,
  origin,
  apiKey,
}: {
  port: number;
  origin?: string;
  apiKey?: string;
}): Promise<RawWebSocket> {
  const socket = net.createConnection({ host: "127.0.0.1", port });
  await once(socket, "connect");
  const headers = [
    "GET /api/ws/user HTTP/1.1",
    `Host: 127.0.0.1:${port}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${randomBytes(16).toString("base64")}`,
    "Sec-WebSocket-Version: 13",
  ];
  if (origin) headers.push(`Origin: ${origin}`);
  if (apiKey) headers.push(`X-Api-Key: ${apiKey}`);
  socket.write(`${headers.join("\r\n")}\r\n\r\n`);

  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(
      () => reject(new Error("WebSocket handshake timed out")),
      2_000,
    );
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const end = buffer.indexOf("\r\n\r\n");
      if (end < 0) return;
      clearTimeout(timer);
      socket.off("data", onData);
      const head = buffer.subarray(0, end).toString();
      const match = head.match(/^HTTP\/1\.1 (\d{3})/);
      if (!match) {
        reject(new Error(`Invalid handshake response: ${head}`));
        return;
      }
      resolve({
        socket,
        status: Number(match[1]),
        remainder: buffer.subarray(end + 4),
      });
    };
    socket.on("data", onData);
    socket.on("error", reject);
  });
}

function maskedTextFrame(text: string) {
  const payload = Buffer.from(text);
  const mask = randomBytes(4);
  const length =
    payload.length < 126
      ? Buffer.from([0x81, 0x80 | payload.length])
      : Buffer.from([0x81, 0xfe, payload.length >> 8, payload.length & 0xff]);
  const masked = Buffer.alloc(payload.length);
  for (let index = 0; index < payload.length; index += 1) {
    masked[index] = payload[index] ^ mask[index % 4];
  }
  return Buffer.concat([length, mask, masked]);
}

function parseCloseCode(buffer: Buffer) {
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const opcode = buffer[offset] & 0x0f;
    let length = buffer[offset + 1] & 0x7f;
    let header = 2;
    if (length === 126) {
      if (buffer.length - offset < 4) return null;
      length = buffer.readUInt16BE(offset + 2);
      header = 4;
    } else if (length === 127) {
      return null;
    }
    if (buffer.length - offset < header + length) return null;
    if (opcode === 8 && length >= 2) {
      return buffer.readUInt16BE(offset + header);
    }
    offset += header + length;
  }
  return null;
}

async function waitForClose(client: RawWebSocket, timeout = 2_000) {
  return new Promise<number>((resolve, reject) => {
    let buffer = client.remainder;
    const initial = parseCloseCode(buffer);
    if (initial !== null) {
      resolve(initial);
      return;
    }
    const timer = setTimeout(
      () => reject(new Error("WebSocket close frame timed out")),
      timeout,
    );
    client.socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const code = parseCloseCode(buffer);
      if (code !== null) {
        clearTimeout(timer);
        resolve(code);
      }
    });
    client.socket.on("error", reject);
  });
}

async function destroyClient(client: RawWebSocket) {
  client.socket.destroy();
  await new Promise((resolve) => setTimeout(resolve, 25));
}

describe("API integration: real WebSocket security boundaries", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGINS = "http://same.example,http://split.example";
    delete process.env.KANEO_CLIENT_URL;
  });

  afterEach(() => {
    for (const name of envNames) {
      const value = originalEnv[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("allows configured origins and rejects untrusted origins or missing auth before upgrade", async () => {
    const { rawKey } = await createApiKey();
    const { server, port } = await startTestServer();

    const sameOrigin = await openRawWebSocket({
      port,
      origin: "http://same.example",
      apiKey: rawKey,
    });
    expect(sameOrigin.status).toBe(101);
    await destroyClient(sameOrigin);

    const splitOrigin = await openRawWebSocket({
      port,
      origin: "http://split.example",
      apiKey: rawKey,
    });
    expect(splitOrigin.status).toBe(101);
    await destroyClient(splitOrigin);

    const attacker = await openRawWebSocket({
      port,
      origin: "http://attacker.example",
      apiKey: rawKey,
    });
    expect(attacker.status).toBe(403);
    attacker.socket.destroy();

    const anonymous = await openRawWebSocket({
      port,
      origin: "http://same.example",
    });
    expect(anonymous.status).toBe(401);
    anonymous.socket.destroy();

    server.close();
    await once(server, "close");
  });

  it("closes oversized frames, message floods, excess connections, and idle clients with explicit codes", async () => {
    process.env.KANEO_WS_MESSAGE_LIMIT_BYTES = "64";
    process.env.KANEO_WS_MESSAGES_PER_MINUTE = "2";
    process.env.KANEO_WS_CONNECTIONS_PER_USER = "1";
    process.env.KANEO_WS_CONNECTIONS_PER_INSTANCE = "2";
    process.env.KANEO_WS_IDLE_TIMEOUT_MS = "100";
    const { rawKey } = await createApiKey();
    const { server, port } = await startTestServer();

    const oversized = await openRawWebSocket({
      port,
      origin: "http://same.example",
      apiKey: rawKey,
    });
    expect(oversized.status).toBe(101);
    oversized.socket.write(maskedTextFrame("x".repeat(128)));
    expect(await waitForClose(oversized)).toBe(1009);
    await destroyClient(oversized);

    const flood = await openRawWebSocket({
      port,
      origin: "http://same.example",
      apiKey: rawKey,
    });
    expect(flood.status).toBe(101);
    flood.socket.write(maskedTextFrame('{"type":"ping"}'));
    flood.socket.write(maskedTextFrame('{"type":"ping"}'));
    flood.socket.write(maskedTextFrame('{"type":"ping"}'));
    expect(await waitForClose(flood)).toBe(1008);
    await destroyClient(flood);

    const first = await openRawWebSocket({
      port,
      origin: "http://same.example",
      apiKey: rawKey,
    });
    expect(first.status).toBe(101);
    const excess = await openRawWebSocket({
      port,
      origin: "http://same.example",
      apiKey: rawKey,
    });
    expect(excess.status).toBe(101);
    expect(await waitForClose(excess)).toBe(1013);
    await destroyClient(excess);
    await destroyClient(first);

    const idle = await openRawWebSocket({
      port,
      origin: "http://same.example",
      apiKey: rawKey,
    });
    expect(idle.status).toBe(101);
    expect(await waitForClose(idle)).toBe(1001);
    await destroyClient(idle);

    server.close();
    await once(server, "close");
  });
});
