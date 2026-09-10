import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPendingInvitations } from "@/fetchers/invitation/get-pending-invitations";
import { getRelayOpsWorkspaceState } from "@/fetchers/relayops";
import getWorkspaces from "@/fetchers/workspace/get-workspaces";
import { authClient } from "@/lib/auth-client";
import type Workspace from "@/types/workspace";

export const Route = createFileRoute("/_layout/_authenticated/dashboard/")({
  beforeLoad: async () => {
    const workspaces: Workspace[] = await getWorkspaces();
    const invitations = await getPendingInvitations();

    if (invitations && invitations.length > 0 && !workspaces.length) {
      throw redirect({ to: "/invitations" });
    }

    const session = await authClient.getSession();
    const activeWorkspaceId = session?.data?.session?.activeOrganizationId;

    async function redirectToWorkspace(workspaceId: string): Promise<never> {
      let relayOps = false;
      try {
        const state = await getRelayOpsWorkspaceState(workspaceId);
        relayOps = state.productMode === "relayops";
      } catch {
        // Existing installations can continue to their legacy workspace if
        // the RelayOps rollout-state endpoint is temporarily unavailable.
      }
      if (relayOps) {
        throw redirect({
          to: "/relayops/$workspaceId",
          params: { workspaceId },
        });
      }
      throw redirect({
        to: "/dashboard/workspace/$workspaceId",
        params: { workspaceId },
      });
    }

    if (workspaces && workspaces.length > 0) {
      if (
        activeWorkspaceId &&
        workspaces.some((ws) => ws.id === activeWorkspaceId)
      ) {
        return redirectToWorkspace(activeWorkspaceId);
      }

      const firstWorkspace = workspaces[0];

      authClient.organization.setActive({
        organizationId: firstWorkspace.id,
      });

      return redirectToWorkspace(firstWorkspace.id);
    }
    throw redirect({ to: "/onboarding" });
  },
});
