import { sql } from "drizzle-orm";
import { getDatabase } from "../database";

export const RELAYOPS_OUTBOX_CLAIM_TIMEOUT_SECONDS = 30;
export const RELAYOPS_OUTBOX_BATCH_SIZE = 25;
export const RELAYOPS_OUTBOX_MAX_ATTEMPTS = 8;
export const RELAYOPS_OUTBOX_RETENTION_DAYS = 14;
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 5 * 60_000;

export type RelayOpsOutboxSnapshot = {
  pending: number;
  available: number;
  retrying: number;
  terminal: number;
  claimed: number;
  oldestPendingAgeMs: number | null;
};

/** Full jitter prevents synchronized workers without making tests nondeterministic. */
export function calculateOutboxRetryDelayMs(
  attempt: number,
  random: () => number = Math.random,
) {
  const cappedAttempt = Math.max(1, Math.min(attempt, 30));
  const ceiling = Math.min(
    RETRY_MAX_MS,
    RETRY_BASE_MS * 2 ** (cappedAttempt - 1),
  );
  return Math.max(1, Math.floor(ceiling * Math.min(1, Math.max(0, random()))));
}

/** Persist only operationally useful text and remove common credential shapes. */
export function redactOutboxError(error: unknown) {
  const raw =
    error instanceof Error ? error.message : "Unknown publish failure";
  return raw
    .replace(/\b(bearer|basic)\s+[^\s,;]+/gi, "$1 [REDACTED]")
    .replace(
      /\b(api[-_ ]?key|authorization|cookie|password|secret|signature|token)\b\s*[:=]\s*[^&\s,;]+/gi,
      "$1=[REDACTED]",
    )
    .replace(/([?&](?:key|secret|signature|token)=)[^&\s]+/gi, "$1[REDACTED]")
    .slice(0, 500);
}

export async function getRelayOpsOutboxSnapshot(
  now = new Date(),
): Promise<RelayOpsOutboxSnapshot> {
  const db = getDatabase();
  const result = await db.execute<{
    pending: number;
    available: number;
    retrying: number;
    terminal: number;
    claimed: number;
    oldestPendingAt: Date | string | null;
  }>(sql`
    select
      count(*) filter (where published_at is null)::int as pending,
      count(*) filter (
        where published_at is null
          and attempts < ${RELAYOPS_OUTBOX_MAX_ATTEMPTS}
          and available_at <= ${now}
      )::int as available,
      count(*) filter (
        where published_at is null and attempts > 0
          and attempts < ${RELAYOPS_OUTBOX_MAX_ATTEMPTS}
      )::int as retrying,
      count(*) filter (
        where published_at is null and attempts >= ${RELAYOPS_OUTBOX_MAX_ATTEMPTS}
      )::int as terminal,
      count(*) filter (where published_at is null and claimed_at is not null)::int as claimed,
      min(created_at) filter (where published_at is null) as "oldestPendingAt"
    from outbox_event
  `);
  const row = result.rows[0];
  const oldestPendingAt = row?.oldestPendingAt
    ? new Date(row.oldestPendingAt)
    : null;
  return {
    pending: row?.pending ?? 0,
    available: row?.available ?? 0,
    retrying: row?.retrying ?? 0,
    terminal: row?.terminal ?? 0,
    claimed: row?.claimed ?? 0,
    oldestPendingAgeMs: oldestPendingAt
      ? Math.max(0, now.getTime() - oldestPendingAt.getTime())
      : null,
  };
}

export async function retainPublishedRelayOpsOutboxEvents(options?: {
  before?: Date;
  limit?: number;
}) {
  const db = getDatabase();
  const before =
    options?.before ??
    new Date(Date.now() - RELAYOPS_OUTBOX_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const limit = Math.max(1, Math.min(options?.limit ?? 500, 5_000));
  const result = await db.execute<{ id: string }>(sql`
    with expired as (
      select id
      from outbox_event
      where published_at is not null and published_at < ${before}
      order by published_at, id
      limit ${limit}
    )
    delete from outbox_event as event
    using expired
    where event.id = expired.id
    returning event.id
  `);
  return result.rows.length;
}
