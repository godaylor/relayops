import type { IncomingHttpHeaders } from "node:http";
import http from "node:http";
import https from "node:https";
import { resolvePublicDestination } from "./assert-public-destination";

const defaultTimeoutMs = 15_000;
const defaultMaxResponseBytes = 64 * 1024;
const defaultMaxRequestBytes = 256 * 1024;
const defaultMaxRedirects = 3;
const sensitiveHeaders = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-api-key",
  "x-kaneo-signature",
]);

export type SafeOutboundFetchOptions = RequestInit & {
  label?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRequestBytes?: number;
  maxRedirects?: number;
};

function bounded(value: number | undefined, fallback: number, maximum: number) {
  return Math.min(Math.max(value ?? fallback, 1), maximum);
}

function normalizeBody(body: BodyInit | null | undefined): Buffer | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof URLSearchParams) return Buffer.from(body.toString());
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  throw new Error("Outbound request body type is not supported");
}

function responseHeaders(headers: IncomingHttpHeaders) {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(name, item);
    } else if (value !== undefined) {
      result.set(name, value);
    }
  }
  return result;
}

function stripSensitiveHeaders(headers: Headers) {
  for (const name of sensitiveHeaders) headers.delete(name);
}

async function requestPinned(input: {
  url: URL;
  address: string;
  family: 4 | 6;
  method: string;
  headers: Headers;
  body?: Buffer;
  timeoutMs: number;
  maxResponseBytes: number;
  signal?: AbortSignal | null;
}) {
  const transport = input.url.protocol === "https:" ? https : http;

  return await new Promise<Response>((resolve, reject) => {
    const request = transport.request(
      {
        protocol: input.url.protocol,
        hostname: input.address,
        family: input.family,
        port: input.url.port || undefined,
        method: input.method,
        path: `${input.url.pathname}${input.url.search}`,
        headers: Object.fromEntries(input.headers.entries()),
        servername:
          input.url.protocol === "https:" ? input.url.hostname : undefined,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let received = 0;
        response.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > input.maxResponseBytes) {
            response.destroy(
              new Error("Outbound response exceeded size limit"),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode ?? 502,
              statusText: response.statusMessage,
              headers: responseHeaders(response.headers),
            }),
          );
        });
        response.on("error", reject);
      },
    );

    request.setTimeout(input.timeoutMs, () => {
      request.destroy(new Error("Outbound request timed out"));
    });
    request.on("error", reject);
    if (input.signal) {
      if (input.signal.aborted) request.destroy(input.signal.reason);
      else
        input.signal.addEventListener(
          "abort",
          () => request.destroy(input.signal?.reason),
          { once: true },
        );
    }
    if (input.body) request.write(input.body);
    request.end();
  });
}

export async function safeOutboundFetch(
  destination: string | URL,
  options: SafeOutboundFetchOptions = {},
) {
  const startedAt = Date.now();
  const timeoutMs = bounded(options.timeoutMs, defaultTimeoutMs, 60_000);
  const maxResponseBytes = bounded(
    options.maxResponseBytes,
    defaultMaxResponseBytes,
    1024 * 1024,
  );
  const maxRequestBytes = bounded(
    options.maxRequestBytes,
    defaultMaxRequestBytes,
    1024 * 1024,
  );
  const maxRedirects = bounded(options.maxRedirects, defaultMaxRedirects, 8);
  const label = options.label ?? "Outbound request";
  let url = new URL(destination);
  let method = (options.method ?? "GET").toUpperCase();
  let headers = new Headers(options.headers);
  let body = normalizeBody(options.body);

  if (body && body.length > maxRequestBytes) {
    throw new Error("Outbound request body exceeded size limit");
  }
  headers.set("host", url.host);
  if (body && !headers.has("content-length")) {
    headers.set("content-length", String(body.length));
  }

  for (let redirectCount = 0; ; redirectCount += 1) {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= timeoutMs) throw new Error("Outbound request timed out");
    const resolved = await resolvePublicDestination(url.toString(), label);
    const target = resolved.addresses[0];
    if (!target) throw new Error(`${label} destination could not be resolved`);

    const response = await requestPinned({
      url,
      address: target.address,
      family: target.family,
      method,
      headers,
      body,
      timeoutMs: timeoutMs - elapsed,
      maxResponseBytes,
      signal: options.signal,
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    if (redirectCount >= maxRedirects) {
      throw new Error("Outbound request exceeded redirect limit");
    }

    const nextUrl = new URL(location, url);
    const originChanged = nextUrl.origin !== url.origin;
    headers = new Headers(headers);
    if (originChanged) stripSensitiveHeaders(headers);
    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) &&
        method === "POST")
    ) {
      method = "GET";
      body = undefined;
      headers.delete("content-length");
      headers.delete("content-type");
    }
    url = nextUrl;
    headers.set("host", url.host);
  }
}
