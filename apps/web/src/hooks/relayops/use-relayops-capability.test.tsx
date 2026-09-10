import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useRelayOpsCapability,
  useRelayOpsPrimaryServiceOwnership,
} from "./use-relayops-capability";

const hasPermission = vi.hoisted(() => vi.fn());
const listUserTeams = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-client", () => ({
  authClient: { organization: { hasPermission, listUserTeams } },
}));

vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "workspace-1" } }),
}));

vi.mock("@/hooks/queries/workspace-users/use-active-workspace-user", () => ({
  useGetActiveWorkspaceUser: () => ({
    data: { id: "member-1", role: "custom-role" },
  }),
}));

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function TestProvider({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("useRelayOpsCapability", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    listUserTeams.mockReset();
  });

  it("uses the server permission endpoint without checking a role name", async () => {
    hasPermission.mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(
      () => useRelayOpsCapability("action.incident.transition"),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.allowed).toBe(true));
    expect(hasPermission).toHaveBeenCalledWith({
      organizationId: "workspace-1",
      permissions: { incident: ["transition"] },
    });
  });

  it("fails closed for owned capability until scoped context is proven", async () => {
    hasPermission.mockImplementation(
      async ({ permissions }: { permissions: Record<string, string[]> }) => ({
        data: {
          success: permissions.incident?.includes("transition_owned") === true,
        },
      }),
    );
    const denied = renderHook(
      () => useRelayOpsCapability("action.incident.transition"),
      { wrapper: wrapper() },
    );
    await waitFor(() =>
      expect(denied.result.current.isCheckingPermissions).toBe(false),
    );
    expect(denied.result.current.allowed).toBe(false);

    const allowed = renderHook(
      () =>
        useRelayOpsCapability("action.incident.transition", {
          primaryServiceOwned: true,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(allowed.result.current.allowed).toBe(true));
  });

  it("proves primary service ownership from workspace-scoped team membership", async () => {
    listUserTeams.mockResolvedValue({
      data: [
        { id: "team-1", organizationId: "workspace-1" },
        { id: "team-2", organizationId: "workspace-2" },
      ],
      error: null,
    });
    const owned = renderHook(
      () => useRelayOpsPrimaryServiceOwnership("workspace-1", "team-1"),
      { wrapper: wrapper() },
    );
    await waitFor(() =>
      expect(owned.result.current.primaryServiceOwned).toBe(true),
    );

    const crossWorkspace = renderHook(
      () => useRelayOpsPrimaryServiceOwnership("workspace-1", "team-2"),
      { wrapper: wrapper() },
    );
    await waitFor(() =>
      expect(crossWorkspace.result.current.isCheckingOwnership).toBe(false),
    );
    expect(crossWorkspace.result.current.primaryServiceOwned).toBe(false);
  });
  it("fails closed when the permission endpoint rejects", async () => {
    hasPermission.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(
      () => useRelayOpsCapability("action.service.create"),
      { wrapper: wrapper() },
    );

    await waitFor(() =>
      expect(result.current.isCheckingPermissions).toBe(false),
    );
    expect(result.current.allowed).toBe(false);
  });
});
