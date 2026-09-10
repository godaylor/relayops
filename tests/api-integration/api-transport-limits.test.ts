import { once } from "node:events";
import net from "node:net";
import { serve } from "@hono/node-server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configureServerTimeouts, createApp } from "../../apps/api/src/index";
import { resetTestDatabase } from "./helpers/database";

const originalBodyLimit = process.env.KANEO_MAX_REQUEST_BODY_BYTES;
const originalTimeout = process.env.KANEO_REQUEST_TIMEOUT_MS;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function startTestServer() {
  const created = createApp();
  const server = serve({
    fetch: created.app.fetch,
    hostname: "127.0.0.1",
    port: 32044,
  });
  created.injectWebSocket(server);
  configureServerTimeouts(server);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an ephemeral TCP address");
  }
  return { ...created, server, port: address.port };
}

async function readHttpResponse(socket: net.Socket) {
  return new Promise<string>((resolve, reject) => {
    let raw = "";
    const timer = setTimeout(
      () => reject(new Error("HTTP response timed out")),
      2_000,
    );
    socket.on("data", (chunk) => {
      raw += chunk.toString();
      if (raw.includes("\r\n\r\n")) {
        clearTimeout(timer);
        resolve(raw);
      }
    });
    socket.on("error", reject);
  });
}

describe("API integration: bounded HTTP transport", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterEach(() => {
    restore("KANEO_MAX_REQUEST_BODY_BYTES", originalBodyLimit);
    restore("KANEO_REQUEST_TIMEOUT_MS", originalTimeout);
  });

  it("rejects oversized and unsupported request bodies before domain handling", async () => {
    process.env.KANEO_MAX_REQUEST_BODY_BYTES = "64";
    const { app } = createApp();

    const oversized = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "x".repeat(128), password: "irrelevant" }),
    });
    expect(oversized.status).toBe(413);

    const unsupported = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/xml" },
      body: "<credentials />",
    });
    expect(unsupported.status).toBe(415);
  });

  it("preserves a safe request identifier and baseline security headers", async () => {
    const { app } = createApp();
    const response = await app.request("/api/health", {
      headers: { "x-request-id": "unsafe request id" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toMatch(
      /^[A-Za-z0-9._:-]{1,128}$/,
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("terminates a slow chunked client within the configured request timeout", async () => {
    process.env.KANEO_REQUEST_TIMEOUT_MS = "50";
    const { server, port } = await startTestServer();

    const socket = net.createConnection({ host: "127.0.0.1", port });
    await once(socket, "connect");
    socket.write(
      [
        "POST /api/auth/sign-in/email HTTP/1.1",
        `Host: 127.0.0.1:${port}`,
        "Content-Type: application/json",
        "Transfer-Encoding: chunked",
        "Connection: close",
        "",
        "5",
        '{"hel',
        "",
      ].join("\r\n"),
    );

    const raw = await readHttpResponse(socket);
    expect(raw).toMatch(/^HTTP\/1\.1 408 /);

    socket.destroy();
    server.close();
    await once(server, "close");
  });
});
