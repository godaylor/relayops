import { describe, expect, it } from "vitest";
import { getInvitationEmailSubject } from "../../../apps/api/src/utils/get-invitation-email-subject";

describe("getInvitationEmailSubject", () => {
  it("uses English copy only for English locales", () => {
    const locale = "en-GB";
    const inviterName = "Alice";
    const workspaceName = "Produkt";

    const subject = getInvitationEmailSubject(
      locale,
      inviterName,
      workspaceName,
    );

    expect(subject).toBe("Alice invited you to join Produkt on RelayOps");
  });

  it("uses Russian copy for Russian locales", () => {
    const locale = "ru-RU";
    const inviterName = "Alice";
    const workspaceName = "Продукт";

    const subject = getInvitationEmailSubject(
      locale,
      inviterName,
      workspaceName,
    );

    expect(subject).toBe(
      "Alice приглашает вас присоединиться к Продукт в RelayOps",
    );
  });

  it("uses the Russian fallback for unsupported locales", () => {
    const locale = "es-ES";
    const inviterName = "Alice";
    const workspaceName = "Producto";

    const subject = getInvitationEmailSubject(
      locale,
      inviterName,
      workspaceName,
    );

    expect(subject).toBe(
      "Alice приглашает вас присоединиться к Producto в RelayOps",
    );
  });
});
