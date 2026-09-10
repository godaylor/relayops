import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const DEFAULT_WEBHOOK_ENVELOPE_VERSION = 1;
const AES_GCM_NONCE_BYTES = 12;
const AES_GCM_TAG_BYTES = 16;

export type EncryptedWebhookSecret = {
  encryptedSecret: string;
  nonce: string;
  keyVersion: number;
};

export class WebhookEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookEncryptionError";
  }
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

export function decodeWebhookEncryptionKey(value: string | undefined) {
  if (!value) {
    throw new WebhookEncryptionError(
      "RELAYOPS_WEBHOOK_ENCRYPTION_KEY is required for webhook sources",
    );
  }

  let key: Buffer;
  if (value.startsWith("base64:")) {
    key = Buffer.from(value.slice("base64:".length), "base64");
  } else if (value.startsWith("hex:")) {
    const encoded = value.slice("hex:".length);
    if (!/^[a-f\d]{64}$/i.test(encoded)) {
      throw new WebhookEncryptionError(
        "RELAYOPS_WEBHOOK_ENCRYPTION_KEY must contain 64 hexadecimal characters",
      );
    }
    key = Buffer.from(encoded, "hex");
  } else {
    throw new WebhookEncryptionError(
      "RELAYOPS_WEBHOOK_ENCRYPTION_KEY must use the base64: or hex: prefix",
    );
  }

  if (key.byteLength !== 32) {
    throw new WebhookEncryptionError(
      "RELAYOPS_WEBHOOK_ENCRYPTION_KEY must decode to exactly 32 bytes",
    );
  }
  return key;
}

function webhookSecretAad(
  workspaceId: string,
  sourceId: string,
  keyVersion: number,
) {
  return Buffer.from(
    `relayops:webhook-secret:v${keyVersion}:${workspaceId}:${sourceId}`,
    "utf8",
  );
}

export function currentWebhookKeyVersion() {
  const parsed = Number.parseInt(
    process.env.RELAYOPS_WEBHOOK_ENCRYPTION_KEY_VERSION ?? "1",
    10,
  );
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new WebhookEncryptionError(
      "RELAYOPS_WEBHOOK_ENCRYPTION_KEY_VERSION must be a positive integer",
    );
  }
  return parsed;
}

function webhookKeyForVersion(version: number) {
  const configured = process.env.RELAYOPS_WEBHOOK_ENCRYPTION_KEYS?.trim();
  if (configured) {
    try {
      const keyring = JSON.parse(configured) as Record<string, unknown>;
      const value = keyring[String(version)];
      if (typeof value === "string") return decodeWebhookEncryptionKey(value);
    } catch (error) {
      if (error instanceof WebhookEncryptionError) throw error;
      throw new WebhookEncryptionError(
        "RELAYOPS_WEBHOOK_ENCRYPTION_KEYS must be a JSON object",
      );
    }
  }
  if (
    version === currentWebhookKeyVersion() ||
    version === DEFAULT_WEBHOOK_ENVELOPE_VERSION
  ) {
    return decodeWebhookEncryptionKey(
      process.env.RELAYOPS_WEBHOOK_ENCRYPTION_KEY,
    );
  }
  throw new WebhookEncryptionError(
    `Webhook encryption key version ${version} is unavailable`,
  );
}

export function encryptWebhookSecret({
  workspaceId,
  sourceId,
  secret,
  keyVersion = currentWebhookKeyVersion(),
  key = webhookKeyForVersion(keyVersion),
}: {
  workspaceId: string;
  sourceId: string;
  secret: string;
  keyVersion?: number;
  key?: Buffer;
}): EncryptedWebhookSecret {
  if (key.byteLength !== 32) {
    throw new WebhookEncryptionError("Webhook encryption key is invalid");
  }
  const nonce = randomBytes(AES_GCM_NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, {
    authTagLength: AES_GCM_TAG_BYTES,
  });
  cipher.setAAD(webhookSecretAad(workspaceId, sourceId, keyVersion));
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const encryptedWithTag = Buffer.concat([ciphertext, cipher.getAuthTag()]);
  return {
    encryptedSecret: encryptedWithTag.toString("base64url"),
    nonce: nonce.toString("base64url"),
    keyVersion,
  };
}

export function decryptWebhookSecret({
  workspaceId,
  sourceId,
  envelope,
  key,
}: {
  workspaceId: string;
  sourceId: string;
  envelope: EncryptedWebhookSecret;
  key?: Buffer;
}) {
  try {
    const resolvedKey = key ?? webhookKeyForVersion(envelope.keyVersion);
    const nonce = decodeBase64Url(envelope.nonce);
    const encryptedWithTag = decodeBase64Url(envelope.encryptedSecret);
    if (
      nonce.byteLength !== AES_GCM_NONCE_BYTES ||
      encryptedWithTag.byteLength <= AES_GCM_TAG_BYTES
    ) {
      throw new Error("invalid envelope");
    }
    const ciphertext = encryptedWithTag.subarray(
      0,
      encryptedWithTag.byteLength - AES_GCM_TAG_BYTES,
    );
    const authTag = encryptedWithTag.subarray(
      encryptedWithTag.byteLength - AES_GCM_TAG_BYTES,
    );
    const decipher = createDecipheriv("aes-256-gcm", resolvedKey, nonce, {
      authTagLength: AES_GCM_TAG_BYTES,
    });
    decipher.setAAD(
      webhookSecretAad(workspaceId, sourceId, envelope.keyVersion),
    );
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof WebhookEncryptionError) throw error;
    throw new WebhookEncryptionError("Webhook secret could not be decrypted");
  }
}

export function generateWebhookSecret() {
  return randomBytes(32).toString("base64url");
}

function webhookSignatureInput(timestamp: string, rawBody: Uint8Array) {
  return Buffer.concat([
    Buffer.from(`${timestamp}.`, "utf8"),
    Buffer.from(rawBody),
  ]);
}

export function signWebhookBody(
  secret: string,
  timestamp: string,
  rawBody: Uint8Array,
) {
  const digest = createHmac("sha256", secret)
    .update(webhookSignatureInput(timestamp, rawBody))
    .digest("hex");
  return `sha256=${digest}`;
}

export function verifyWebhookSignature({
  secret,
  timestamp,
  rawBody,
  signature,
}: {
  secret: string;
  timestamp: string;
  rawBody: Uint8Array;
  signature: string | undefined;
}) {
  const formatValid = /^sha256=[a-f\d]{64}$/i.test(signature ?? "");
  const supplied = formatValid
    ? Buffer.from((signature as string).slice("sha256=".length), "hex")
    : Buffer.alloc(32);
  const expected = createHmac("sha256", secret)
    .update(webhookSignatureInput(timestamp, rawBody))
    .digest();

  // Both buffers are always 32 bytes, so even malformed values take the
  // constant-time comparison path. Header format validity is folded in after.
  return timingSafeEqual(expected, supplied) && formatValid;
}
