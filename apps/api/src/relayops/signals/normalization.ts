import { createHash } from "node:crypto";

export const SIGNAL_SEVERITIES = [
  "unknown",
  "sev1",
  "sev2",
  "sev3",
  "sev4",
] as const;
export type SignalSeverity = (typeof SIGNAL_SEVERITIES)[number];

const MAX_TITLE_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 2_000;
const MAX_EXTERNAL_ID_LENGTH = 200;
const MAX_DEDUPLICATION_KEY_LENGTH = 200;
const MAX_PAYLOAD_STRING_LENGTH = 256;
const MAX_LABELS = 32;

const PAYLOAD_SCALAR_FIELDS = new Set([
  "component",
  "environment",
  "metric",
  "region",
  "threshold",
  "unit",
  "value",
]);

export class SignalNormalizationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SignalNormalizationError";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SignalNormalizationError(
      "invalid_payload",
      "Signal payload must be a JSON object",
    );
  }
  return value as Record<string, unknown>;
}

function boundedString(
  value: unknown,
  field: string,
  maximum: number,
  required = false,
) {
  if (value === undefined || value === null) {
    if (required) {
      throw new SignalNormalizationError(
        `missing_${field}`,
        `${field} is required`,
      );
    }
    return null;
  }
  if (typeof value !== "string") {
    throw new SignalNormalizationError(
      `invalid_${field}`,
      `${field} must be a string`,
    );
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (required && !normalized) {
    throw new SignalNormalizationError(
      `missing_${field}`,
      `${field} is required`,
    );
  }
  if (normalized.length > maximum) {
    throw new SignalNormalizationError(
      `${field}_too_long`,
      `${field} exceeds its maximum length`,
    );
  }
  return normalized || null;
}

export function redactSignalText(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z\d._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(authorization|cookie|password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["']?[^\s,"'}&]+/gi,
      "$1=[REDACTED]",
    );
}

function normalizedPayloadScalar(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return redactSignalText(value.slice(0, MAX_PAYLOAD_STRING_LENGTH));
  }
  return undefined;
}

export function normalizeRedactedPayload(value: unknown) {
  if (value === undefined || value === null) return {};
  const payload = asRecord(value);
  const redacted: Record<string, unknown> = {};

  for (const key of [...PAYLOAD_SCALAR_FIELDS].sort()) {
    const normalized = normalizedPayloadScalar(payload[key]);
    if (normalized !== undefined) redacted[key] = normalized;
  }

  if (
    typeof payload.labels === "object" &&
    payload.labels !== null &&
    !Array.isArray(payload.labels)
  ) {
    const labels: Record<string, string | number | boolean> = {};
    for (const [key, rawValue] of Object.entries(
      payload.labels as Record<string, unknown>,
    )
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, MAX_LABELS)) {
      if (!/^[a-zA-Z\d_.-]{1,64}$/.test(key)) continue;
      if (
        /^(authorization|cookie|password|passwd|secret|token|api[_-]?key|signature)$/i.test(
          key,
        )
      ) {
        continue;
      }
      const normalized = normalizedPayloadScalar(rawValue);
      if (normalized !== undefined) labels[key] = normalized;
    }
    if (Object.keys(labels).length > 0) redacted.labels = labels;
  }

  return redacted;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function canonicalSignalJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export type NormalizedSignal = {
  source: string;
  externalId: string | null;
  fingerprint: string;
  deduplicationKey: string;
  serviceId: string | null;
  title: string;
  summary: string | null;
  observedAt: Date;
  severityHint: SignalSeverity;
  redactedPayload: Record<string, unknown>;
};

export function normalizeSignal(
  rawValue: unknown,
  options: { source: string; now?: Date },
): NormalizedSignal {
  const raw = asRecord(rawValue);
  const title = redactSignalText(
    boundedString(raw.title, "title", MAX_TITLE_LENGTH, true) as string,
  );
  const rawSummary = boundedString(raw.summary, "summary", MAX_SUMMARY_LENGTH);
  const externalId = boundedString(
    raw.externalId,
    "external_id",
    MAX_EXTERNAL_ID_LENGTH,
  );
  const requestedDeduplicationKey = boundedString(
    raw.deduplicationKey,
    "deduplication_key",
    MAX_DEDUPLICATION_KEY_LENGTH,
  );
  const serviceId = boundedString(raw.serviceId, "service_id", 128);
  const severityHint = raw.severityHint ?? "unknown";
  if (
    typeof severityHint !== "string" ||
    !SIGNAL_SEVERITIES.includes(severityHint as SignalSeverity)
  ) {
    throw new SignalNormalizationError(
      "invalid_severity_hint",
      "severityHint is invalid",
    );
  }

  const observedAt = raw.observedAt
    ? new Date(String(raw.observedAt))
    : (options.now ?? new Date());
  if (Number.isNaN(observedAt.getTime())) {
    throw new SignalNormalizationError(
      "invalid_observed_at",
      "observedAt must be an ISO timestamp",
    );
  }

  const summary = rawSummary ? redactSignalText(rawSummary) : null;
  const redactedPayload = normalizeRedactedPayload(raw.payload);
  const fingerprintInput = {
    source: options.source,
    externalId,
    serviceId,
    title,
    summary,
    observedAt: observedAt.toISOString(),
    severityHint,
    payload: redactedPayload,
  };
  const fingerprint = createHash("sha256")
    .update(canonicalSignalJson(fingerprintInput), "utf8")
    .digest("hex");

  return {
    source: options.source,
    externalId,
    fingerprint,
    deduplicationKey: requestedDeduplicationKey ?? externalId ?? fingerprint,
    serviceId,
    title,
    summary,
    observedAt,
    severityHint: severityHint as SignalSeverity,
    redactedPayload,
  };
}
