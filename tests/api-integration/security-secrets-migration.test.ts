import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { decryptSecret } from "../../apps/api/src/notification-preferences/secrets";
import {
  decodeWebhookEncryptionKey,
  decryptWebhookSecret,
  encryptWebhookSecret,
} from "../../apps/api/src/relayops/signals/crypto";
import {
  migrateNotificationSecrets,
  migrateSignalSourceSecrets,
} from "../../apps/api/src/utils/migrate-notification-secrets";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

const env = {
  notificationKey: process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY,
  notificationKeyId: process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY_ID,
  webhookKey: process.env.RELAYOPS_WEBHOOK_ENCRYPTION_KEY,
  webhookVersion: process.env.RELAYOPS_WEBHOOK_ENCRYPTION_KEY_VERSION,
  webhookKeys: process.env.RELAYOPS_WEBHOOK_ENCRYPTION_KEYS,
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(async () => {
  await resetTestDatabase();
  process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = "migration-primary";
  process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY_ID = "primary";
});

afterEach(() => {
  restore("NOTIFICATION_SECRET_ENCRYPTION_KEY", env.notificationKey);
  restore("NOTIFICATION_SECRET_ENCRYPTION_KEY_ID", env.notificationKeyId);
  restore("RELAYOPS_WEBHOOK_ENCRYPTION_KEY", env.webhookKey);
  restore("RELAYOPS_WEBHOOK_ENCRYPTION_KEY_VERSION", env.webhookVersion);
  restore("RELAYOPS_WEBHOOK_ENCRYPTION_KEYS", env.webhookKeys);
});

describe("S12 secret forward migrations", () => {
  it("migrates plaintext notification secrets without changing another row", async () => {
    const first = await createWorkspaceMember();
    const second = await createWorkspaceMember();
    await db.insert(schema.userNotificationPreferenceTable).values([
      { userId: first.user.id, ntfyToken: "first-plaintext" },
      { userId: second.user.id, ntfyToken: "second-plaintext" },
    ]);

    await migrateNotificationSecrets();
    const rows = await db.select().from(schema.userNotificationPreferenceTable);
    expect(rows).toHaveLength(2);
    expect(
      rows.every((row) => row.ntfyToken?.startsWith("enc:v2:primary:")),
    ).toBe(true);
    expect(rows.map((row) => decryptSecret(row.ntfyToken)).sort()).toEqual([
      "first-plaintext",
      "second-plaintext",
    ]);
  });

  it("rotates a signal-source credential and remains restart-idempotent", async () => {
    const member = await createWorkspaceMember();
    const sourceId = "source-rotation";
    const oldKey = decodeWebhookEncryptionKey(`hex:${"11".repeat(32)}`);
    const oldEnvelope = encryptWebhookSecret({
      workspaceId: member.workspace.id,
      sourceId,
      secret: "source-secret",
      keyVersion: 1,
      key: oldKey,
    });
    await db.insert(schema.signalSourceTable).values({
      id: sourceId,
      workspaceId: member.workspace.id,
      name: "Rotating source",
      ...oldEnvelope,
    });

    process.env.RELAYOPS_WEBHOOK_ENCRYPTION_KEY_VERSION = "2";
    process.env.RELAYOPS_WEBHOOK_ENCRYPTION_KEY = `hex:${"22".repeat(32)}`;
    process.env.RELAYOPS_WEBHOOK_ENCRYPTION_KEYS = JSON.stringify({
      1: `hex:${"11".repeat(32)}`,
      2: `hex:${"22".repeat(32)}`,
    });

    await migrateSignalSourceSecrets();
    await migrateSignalSourceSecrets();
    const [rotated] = await db
      .select()
      .from(schema.signalSourceTable)
      .where(eq(schema.signalSourceTable.id, sourceId));
    expect(rotated?.keyVersion).toBe(2);
    expect(
      rotated &&
        decryptWebhookSecret({
          workspaceId: rotated.workspaceId,
          sourceId: rotated.id,
          envelope: rotated,
        }),
    ).toBe("source-secret");
  });
});
