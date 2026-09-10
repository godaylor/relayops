import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  needsSecretMigration,
} from "../../../apps/api/src/notification-preferences/secrets";

const original = {
  key: process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY,
  keyId: process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY_ID,
  previous: process.env.NOTIFICATION_SECRET_DECRYPTION_KEYS,
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = "test-primary-key";
  process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY_ID = "primary";
  delete process.env.NOTIFICATION_SECRET_DECRYPTION_KEYS;
});

afterEach(() => {
  restore("NOTIFICATION_SECRET_ENCRYPTION_KEY", original.key);
  restore("NOTIFICATION_SECRET_ENCRYPTION_KEY_ID", original.keyId);
  restore("NOTIFICATION_SECRET_DECRYPTION_KEYS", original.previous);
});

describe("versioned notification secret envelope", () => {
  it("encrypts with an authenticated key version and decrypts", () => {
    const encrypted = encryptSecret("notification-token");
    expect(encrypted).toMatch(/^enc:v2:primary:/);
    expect(encrypted).not.toContain("notification-token");
    expect(decryptSecret(encrypted)).toBe("notification-token");
    expect(needsSecretMigration(encrypted)).toBe(false);
  });

  it("rotates an old envelope through the previous-key keyring", () => {
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = "old-key";
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY_ID = "old";
    const oldEnvelope = encryptSecret("rotate-me");

    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = "new-key";
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY_ID = "new";
    process.env.NOTIFICATION_SECRET_DECRYPTION_KEYS = JSON.stringify({
      old: "old-key",
    });

    expect(decryptSecret(oldEnvelope)).toBe("rotate-me");
    const rotated = encryptSecret(oldEnvelope);
    expect(rotated).toMatch(/^enc:v2:new:/);
    expect(decryptSecret(rotated)).toBe("rotate-me");
  });

  it("fails closed for a wrong key or tampered authenticated metadata", () => {
    const encrypted = encryptSecret("must-not-leak");
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = "wrong-key";
    expect(() => decryptSecret(encrypted)).toThrow(
      "Failed to decrypt notification secret",
    );
    expect(() => decryptSecret(encrypted)).not.toThrow("must-not-leak");
  });

  it("keeps bounded dual-read compatibility for plaintext rows", () => {
    expect(decryptSecret("legacy-plaintext")).toBe("legacy-plaintext");
    expect(needsSecretMigration("legacy-plaintext")).toBe(true);
  });
});
