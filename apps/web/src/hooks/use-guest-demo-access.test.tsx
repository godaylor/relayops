import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGuestDemoAccess } from "./use-guest-demo-access";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  prepare: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "en-US" },
  }),
}));
vi.mock("@/lib/guest-demo", () => ({ prepareGuestDemo: mocks.prepare }));
vi.mock("@/lib/toast", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prepare.mockResolvedValue({
    workspaceId: "own-demo-workspace",
    incidentId: "own-demo-incident",
  });
});

describe("guest entry navigation", () => {
  it("opens the guest's workspace after setup, independently of a shared URL", async () => {
    const { result } = renderHook(useGuestDemoAccess);

    await act(() => result.current.openGuestDemo());

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/relayops/$workspaceId",
      params: { workspaceId: "own-demo-workspace" },
      replace: true,
    });
    expect(mocks.success).toHaveBeenCalledOnce();
    expect(result.current.isPending).toBe(false);
  });

  it("stays on entry and allows retry if server setup fails", async () => {
    mocks.prepare.mockRejectedValueOnce(new Error("Unavailable"));
    const { result } = renderHook(useGuestDemoAccess);

    await act(() => result.current.openGuestDemo());

    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("auth:signIn.guestError");
    expect(result.current.isPending).toBe(false);

    await act(() => result.current.openGuestDemo());
    expect(mocks.navigate).toHaveBeenCalledOnce();
  });
});
