import { describe, expect, it, vi } from "vitest";

vi.mock("@i18n/resources", async () => {
  const actual =
    await vi.importActual<typeof import("@i18n/resources")>("@i18n/resources");
  return {
    ...actual,
    loadLocale: vi.fn(async () => ({
      common: { testCommon: "common-value" },
      auth: { testAuth: "auth-value" },
    })),
  };
});

const { getPersistedLocale, i18n, preloadNamespaces, resolveLocale } =
  await import("./index");
const resources = await import("@i18n/resources");

describe("preloadNamespaces", () => {
  it("loads every namespace so non-default keys resolve after async init", async () => {
    await preloadNamespaces("en-US");

    expect(i18n.t("auth:testAuth")).toBe("auth-value");
    expect(i18n.t("common:testCommon")).toBe("common-value");
  });

  it("reuses the cached locale JSON across calls", async () => {
    const callsBefore = (resources.loadLocale as ReturnType<typeof vi.fn>).mock
      .calls.length;

    await preloadNamespaces("en-US");

    expect(
      (resources.loadLocale as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(callsBefore);
  });
});

describe("public locale policy", () => {
  it("defaults unknown and legacy locale values to Russian", () => {
    expect(resolveLocale()).toBe("ru-RU");
    expect(resolveLocale("de-DE")).toBe("ru-RU");
    expect(resolveLocale("unknown-locale")).toBe("ru-RU");
  });

  it("accepts only public RU and EN selections", () => {
    expect(resolveLocale("ru")).toBe("ru-RU");
    expect(resolveLocale("en-GB")).toBe("en-US");
    expect(resolveLocale("en-US")).toBe("en-US");
  });

  it("lets an unknown persisted locale force the Russian fallback", () => {
    window.localStorage.setItem("relayops.locale", "de-DE");

    expect(resolveLocale(getPersistedLocale(), "en-US")).toBe("ru-RU");

    window.localStorage.removeItem("relayops.locale");
  });
});
