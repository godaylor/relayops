import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { HTTPException } from "hono/http-exception";

const V1_PREFIX = "enc:v1:";
const V2_PREFIX = "enc:v2:";
const SECRET_ALGORITHM = "aes-256-gcm";
const SECRET_IV_BYTES = 12;
const SECRET_AUTH_TAG_BYTES = 16;
const DEFAULT_KEY_ID = "primary";

function deriveKey(value: string) {
  return createHash("sha256").update(value).digest();
}

function currentKeyId() {
  const keyId =
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY_ID?.trim() || DEFAULT_KEY_ID;
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(keyId)) {
    throw new HTTPException(500, {
      message: "NOTIFICATION_SECRET_ENCRYPTION_KEY_ID is invalid",
    });
  }
  return keyId;
}

function keyring() {
  const keys = new Map<string, Buffer>();
  const current = process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY?.trim();
  if (current) keys.set(currentKeyId(), deriveKey(current));

  const previous = process.env.NOTIFICATION_SECRET_DECRYPTION_KEYS?.trim();
  if (previous) {
    try {
      const parsed = JSON.parse(previous) as Record<string, unknown>;
      for (const [keyId, value] of Object.entries(parsed)) {
        if (
          /^[A-Za-z0-9_-]{1,32}$/.test(keyId) &&
          typeof value === "string" &&
          value
        ) {
          keys.set(keyId, deriveKey(value));
        }
      }
    } catch {
      throw new HTTPException(500, {
        message: "NOTIFICATION_SECRET_DECRYPTION_KEYS must be a JSON object",
      });
    }
  }
  return keys;
}

function requireKey(keyId: string) {
  const key = keyring().get(keyId);
  if (!key) {
    throw new HTTPException(500, {
      message: `Notification secret key '${keyId}' is unavailable`,
    });
  }
  return key;
}

function encodePart(value: Buffer) {
  return value.toString("base64url");
}

function decodePart(value: string) {
  return Buffer.from(value, "base64url");
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return (
    typeof value === "string" &&
    (value.startsWith(V1_PREFIX) || value.startsWith(V2_PREFIX))
  );
}

export function needsSecretMigration(value: string | null | undefined) {
  if (value === undefined || value === null) return false;
  return !value.startsWith(`${V2_PREFIX}${currentKeyId()}:`);
}

function decryptPayload(input: {
  payload: string;
  key: Buffer;
  additionalData?: Buffer;
}) {
  const [iv, authTag, encrypted] = input.payload.split(".");
  if (!iv || !authTag || !encrypted) {
    throw new Error("Invalid encrypted notification secret payload");
  }
  const decipher = createDecipheriv(
    SECRET_ALGORITHM,
    input.key,
    decodePart(iv),
    { authTagLength: SECRET_AUTH_TAG_BYTES },
  );
  if (input.additionalData) decipher.setAAD(input.additionalData);
  decipher.setAuthTag(decodePart(authTag));
  return Buffer.concat([
    decipher.update(decodePart(encrypted)),
    decipher.final(),
  ]).toString("utf8");
}

export function decryptSecret(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null || !isEncryptedSecret(value)) {
    return value;
  }

  try {
    if (value.startsWith(V2_PREFIX)) {
      const separator = value.indexOf(":", V2_PREFIX.length);
      if (separator < 0) throw new Error("Missing key version");
      const keyId = value.slice(V2_PREFIX.length, separator);
      const payload = value.slice(separator + 1);
      return decryptPayload({
        payload,
        key: requireKey(keyId),
        additionalData: Buffer.from(`relayops:notification-secret:v2:${keyId}`),
      });
    }

    const legacyKey = process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY?.trim();
    if (!legacyKey) {
      throw new Error("Legacy notification secret key is unavailable");
    }
    return decryptPayload({
      payload: value.slice(V1_PREFIX.length),
      key: deriveKey(legacyKey),
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, {
      message: "Failed to decrypt notification secret",
    });
  }
}

export function encryptSecret(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null) return value;
  const keyId = currentKeyId();
  if (value.startsWith(`${V2_PREFIX}${keyId}:`)) {
    decryptSecret(value);
    return value;
  }

  const plaintext = isEncryptedSecret(value) ? decryptSecret(value) : value;
  if (plaintext === undefined || plaintext === null) return plaintext;
  const iv = randomBytes(SECRET_IV_BYTES);
  const cipher = createCipheriv(SECRET_ALGORITHM, requireKey(keyId), iv, {
    authTagLength: SECRET_AUTH_TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(`relayops:notification-secret:v2:${keyId}`));
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${V2_PREFIX}${keyId}:${encodePart(iv)}.${encodePart(authTag)}.${encodePart(encrypted)}`;
}
