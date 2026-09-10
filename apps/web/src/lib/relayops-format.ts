export function getRelayOpsLocale(language?: string) {
  return (
    language ||
    globalThis.document?.documentElement.lang ||
    globalThis.navigator?.language ||
    "en-US"
  );
}

export function formatRelayOpsDateTime(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
  locale = getRelayOpsLocale(),
) {
  return new Intl.DateTimeFormat(locale, options).format(new Date(value));
}

export function relayOpsElapsedParts(
  startedAt: string | number | Date,
  now: string | number | Date = Date.now(),
) {
  const elapsedMinutes = Math.max(
    0,
    Math.floor(
      (new Date(now).getTime() - new Date(startedAt).getTime()) / 60_000,
    ),
  );
  return {
    hours: Math.floor(elapsedMinutes / 60),
    minutes: elapsedMinutes % 60,
  };
}
