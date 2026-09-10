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
let timer: ReturnType<typeof setInterval> | undefined;
let running = false;
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
  if (timer) return;
  timer = setInterval(() => {
    if (running) return;
    running = true;
    void processRelayOpsOutboxBatch()
      .catch((error) => console.error("RelayOps outbox worker failed:", error))
      .finally(() => {
        running = false;
      });
  }, POLL_INTERVAL_MS);
  timer.unref();
}

export function stopRelayOpsOutboxWorker() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
