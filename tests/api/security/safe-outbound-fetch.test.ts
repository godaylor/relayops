import http, { type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  isDisallowedAddress,
  resolvePublicDestination,
} from "../../../apps/api/src/utils/assert-public-destination";
import { safeOutboundFetch } from "../../../apps/api/src/utils/safe-outbound-fetch";

const servers: Server[] = [];
let testPort = 32046;
const originalAllowPrivate =
  process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS;

async function listen(handler: http.RequestListener) {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) =>
    server.listen(testPort++, "127.0.0.1", resolve),
  );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test port");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  if (originalAllowPrivate === undefined) {
    delete process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS;
  } else {
    process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = originalAllowPrivate;
  }
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

describe("safe outbound transport", () => {
  it.each([
    "127.0.0.1",
    "169.254.169.254",
    "10.0.0.1",
    "192.168.1.1",
    "100.64.0.1",
    "198.18.0.1",
    "203.0.113.10",
    "224.0.0.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:7f00:1",
  ])("blocks non-public address %s", (address) => {
    expect(isDisallowedAddress(address)).toBe(true);
  });

  it("rejects loopback destinations by default", async () => {
    delete process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS;
    await expect(
      resolvePublicDestination("http://127.0.0.1:9000/hook", "Test"),
    ).rejects.toThrow("non-routable");
  });

  it("pins every redirect hop and strips credentials on origin change", async () => {
    process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = "true";
    const destination = await listen((request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          authorization: request.headers.authorization ?? null,
          signature: request.headers["x-kaneo-signature"] ?? null,
        }),
      );
    });
    const source = await listen((_request, response) => {
      response.statusCode = 302;
      response.setHeader("location", `${destination}/receiver`);
      response.end();
    });

    const result = await safeOutboundFetch(`${source}/start`, {
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "X-Kaneo-Signature": "signature",
      },
      body: "payload",
    });

    expect(await result.json()).toEqual({
      authorization: null,
      signature: null,
    });
  });

  it("bounds response bytes and total request time", async () => {
    process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = "true";
    const large = await listen((_request, response) =>
      response.end("x".repeat(256)),
    );
    await expect(
      safeOutboundFetch(large, { maxResponseBytes: 32 }),
    ).rejects.toThrow("size limit");

    const slow = await listen((_request, response) => {
      setTimeout(() => response.end("late"), 100);
    });
    await expect(safeOutboundFetch(slow, { timeoutMs: 20 })).rejects.toThrow(
      "timed out",
    );
  });
});
