import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useLocale } from "./use-locale";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateUser: vi.fn(),
  changeLanguage: vi.fn(),
  invalidateQueries: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({ authClient: mocks }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => mocks }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en-US", changeLanguage: mocks.changeLanguage },
  }),
}));
vi.mock("@/lib/i18n", () => ({
  localeStorageKey: "relayops.locale",
  getPersistedLocale: () => localStorage.getItem("relayops.locale"),
  resolveLocale: (locale: string) => locale,
}));

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  mocks.updateUser.mockResolvedValue({ error: null });
});

it("lets a visitor change language without an unauthorized profile mutation", async () => {
  mocks.getSession.mockResolvedValue({ data: null });
  const { result } = renderHook(useLocale);
  await act(() => result.current.setLocale("ru-RU"));
  expect(localStorage.getItem("relayops.locale")).toBe("ru-RU");
  expect(document.documentElement.lang).toBe("ru-RU");
  expect(mocks.changeLanguage).toHaveBeenCalledWith("ru-RU");
  expect(mocks.updateUser).not.toHaveBeenCalled();
});

it("keeps server persistence for authenticated and guest accounts", async () => {
  mocks.getSession.mockResolvedValue({
    data: { user: { id: "guest", isAnonymous: true } },
  });
  const { result } = renderHook(useLocale);
  await act(() => result.current.setLocale("ru-RU"));
  expect(mocks.updateUser).toHaveBeenCalledWith({ locale: "ru-RU" });
  expect(mocks.invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["session"],
  });
});
