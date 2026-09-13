import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDatabase } from "../database";
import type { RelayOpsOutboxPayload } from "../database/schema";
import { publishUserBroadcast, publishWorkspaceBroadcast } from "../ws";
import {
  calculateOutboxRetryDelayMs,
  RELAYOPS_OUTBOX_BATCH_SIZE,
  RELAYOPS_OUTBOX_CLAIM_TIMEOUT_SECONDS,
  RELAYOPS_OUTBOX_MAX_ATTEMPTS,
  redactOutboxError,
} from "./outbox-hardening";
import { createRelayOpsRealtimeEnvelope } from "./realtime";

type ClaimedOutboxEvent = {
  id: string;
  payload: RelayOpsOutboxPayload;
  attempts: number;
};

const POLL_INTERVAL_MS = 250;
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let started = false;
let wakeRequested = false;
let retryUntil = 0;
const workerId = randomUUID();

export async function processRelayOpsOutboxBatch(
  publish = publishUserBroadcast,
  publishWorkspace = publishWorkspaceBroadcast,
) {
  const db = getDatabase();
  const result = await db.execute<ClaimedOutboxEvent>(sql`
    with candidates as (
      select id
      from outbox_event
      where published_at is null
        and available_at <= now()
        and attempts < ${RELAYOPS_OUTBOX_MAX_ATTEMPTS}
        and (
          claimed_at is null
          or claimed_at < now() - (${RELAYOPS_OUTBOX_CLAIM_TIMEOUT_SECONDS} * interval '1 second')
        )
      order by available_at, created_at, id
      for update skip locked
      limit ${RELAYOPS_OUTBOX_BATCH_SIZE}
    )
    update outbox_event as event
    set claimed_at = now(), claimed_by = ${workerId}, attempts = attempts + 1
    from candidates
    where event.id = candidates.id
    returning event.id, event.attempts, event.payload
  `);

  for (const event of result.rows) {
    try {
      const payload = event.payload;
      const envelope = createRelayOpsRealtimeEnvelope({
        eventId: event.id,
        eventType: payload.type,
        workspaceId: payload.workspaceId,
        incidentId: payload.incidentId,
        version: payload.version,
      });
      await publish(payload.actorUserId, envelope);
      await publishWorkspace(payload.workspaceId, envelope, {
        excludeUserId: payload.actorUserId,
      });
      await db.execute(sql`
        update outbox_event
        set published_at = now(), claimed_at = null, claimed_by = null, last_error = null
        where id = ${event.id} and claimed_by = ${workerId} and published_at is null
      `);
    } catch (error) {
      // Keep checking through the longest retry delay; idle backoff must not
      // postpone a scheduled retry on a scale-to-zero database.
      retryUntil = Date.now() + 330_000;
      const message = redactOutboxError(error);
      const delayMs = calculateOutboxRetryDelayMs(event.attempts);
      await db.execute(sql`
        update outbox_event
        set available_at = now() + (${delayMs} * interval '1 millisecond'),
            claimed_at = null,
            claimed_by = null,
            last_error = ${message}
        where id = ${event.id} and claimed_by = ${workerId} and published_at is null
      `);
    }
  }

  return result.rows.length;
}

export function startRelayOpsOutboxWorker() {
  if (started) return;
  started = true;
  schedule(0);
}

function schedule(delayMs: number) {
  if (!started) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void tick(), delayMs);
  timer.unref();
}

async function tick() {
  timer = undefined;
  if (!started || running) return;
  running = true;
  wakeRequested = false;
  let processed = 0;
  try {
    processed = await processRelayOpsOutboxBatch();
  } catch (error) {
    retryUntil = Date.now() + 330_000;
    console.error("RelayOps outbox worker failed:", redactOutboxError(error));
  } finally {
    running = false;
    const idleDelay =
      process.env.RELAYOPS_RESOURCE_PROFILE === "free"
        ? Date.now() < retryUntil
          ? 1_000
          : 15 * 60_000
        : POLL_INTERVAL_MS;
    schedule(wakeRequested || processed > 0 ? POLL_INTERVAL_MS : idleDelay);
  }
}

/** Called after HTTP mutations commit. PostgreSQL remains the durable queue. */
export function wakeRelayOpsOutboxWorker() {
  if (!started) return;
  if (running) {
    wakeRequested = true;
    return;
  }
  schedule(0);
}

export function stopRelayOpsOutboxWorker() {
  started = false;
  if (timer) clearTimeout(timer);
  timer = undefined;
  wakeRequested = false;
}
