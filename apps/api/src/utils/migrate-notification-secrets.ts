import { asc, eq, gt } from "drizzle-orm";
import db, { schema } from "../database";
import {
  encryptSecret,
  needsSecretMigration,
} from "../notification-preferences/secrets";
import {
  currentWebhookKeyVersion,
  decryptWebhookSecret,
  encryptWebhookSecret,
} from "../relayops/signals/crypto";

const batchSize = 100;

export async function migrateNotificationSecrets() {
  let cursor = "";
  for (;;) {
    const rows = await db
      .select({
        id: schema.userNotificationPreferenceTable.id,
        ntfyToken: schema.userNotificationPreferenceTable.ntfyToken,
        gotifyToken: schema.userNotificationPreferenceTable.gotifyToken,
        webhookSecret: schema.userNotificationPreferenceTable.webhookSecret,
      })
      .from(schema.userNotificationPreferenceTable)
      .where(gt(schema.userNotificationPreferenceTable.id, cursor))
      .orderBy(asc(schema.userNotificationPreferenceTable.id))
      .limit(batchSize);
    if (rows.length === 0) return;

    for (const row of rows) {
      const values = [row.ntfyToken, row.gotifyToken, row.webhookSecret];
      if (values.some(needsSecretMigration)) {
        await db
          .update(schema.userNotificationPreferenceTable)
          .set({
            ntfyToken: encryptSecret(row.ntfyToken),
            gotifyToken: encryptSecret(row.gotifyToken),
            webhookSecret: encryptSecret(row.webhookSecret),
            updatedAt: new Date(),
          })
          .where(eq(schema.userNotificationPreferenceTable.id, row.id));
      }
      cursor = row.id;
    }
    if (rows.length < batchSize) return;
  }
}

export async function migrateSignalSourceSecrets() {
  let cursor = "";
  for (;;) {
    const rows = await db
      .select()
      .from(schema.signalSourceTable)
      .where(gt(schema.signalSourceTable.id, cursor))
      .orderBy(asc(schema.signalSourceTable.id))
      .limit(batchSize);
    if (rows.length === 0) return;
    const targetVersion = currentWebhookKeyVersion();
    for (const row of rows) {
      if (row.keyVersion !== targetVersion) {
        const plaintext = decryptWebhookSecret({
          workspaceId: row.workspaceId,
          sourceId: row.id,
          envelope: row,
        });
        await db
          .update(schema.signalSourceTable)
          .set({
            ...encryptWebhookSecret({
              workspaceId: row.workspaceId,
              sourceId: row.id,
              secret: plaintext,
            }),
            updatedAt: new Date(),
          })
          .where(eq(schema.signalSourceTable.id, row.id));
      }
      cursor = row.id;
    }
    if (rows.length < batchSize) return;
  }
}
