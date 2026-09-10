const sensitiveKey =
  /(?:authorization|cookie|password|secret|token|api[_-]?key|signature|dsn)/i;

function redactString(value: string) {
  return value
    .replace(/\b(Bearer|token)\s+[A-Za-z0-9._~+/-]+/gi, "$1 [REDACTED]")
    .replace(/([?&](?:token|key|secret|signature)=)[^&#\s]+/gi, "$1[REDACTED]")
    .replace(/enc:v\d+:[A-Za-z0-9_.:-]+/g, "[ENCRYPTED_SECRET]")
    .replace(/(https?:\/\/)[^/@\s]+@/gi, "$1[REDACTED]@");
}

export function redactSensitive(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") return redactString(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitive(entry, seen));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitiveKey.test(key) ? "[REDACTED]" : redactSensitive(entry, seen),
    ]),
  );
}

export function safeErrorForLog(error: unknown) {
  return redactSensitive(error);
}
