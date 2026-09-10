import { useQuery } from "@tanstack/react-query";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useGetActiveWorkspaceUser } from "@/hooks/queries/workspace-users/use-active-workspace-user";
import { authClient } from "@/lib/auth-client";
import {
  getRelayOpsUiRegistryItem,
  type RelayOpsUiCapabilityContext,
  type RelayOpsUiCapabilityId,
  relayOpsUiContextAllows,
} from "@/lib/relayops-capabilities";

function mutablePermissions(
  permissions: Record<string, readonly string[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(permissions).map(([resource, actions]) => [
      resource,
      [...actions],
    ]),
  );
}

export function useRelayOpsCapability(
  id: RelayOpsUiCapabilityId,
  context: RelayOpsUiCapabilityContext = {},
  explicitWorkspaceId?: string,
) {
  const { data: activeWorkspace } = useActiveWorkspace();
  const { data: activeMember } = useGetActiveWorkspaceUser();
  const workspaceId = explicitWorkspaceId ?? activeWorkspace?.id;
  const role = activeMember?.role as string | undefined;
  const item = getRelayOpsUiRegistryItem(id);

  const query = useQuery({
    queryKey: [
      "workspace-capabilities",
      workspaceId,
      "relayops",
      role,
      id,
      context.primaryServiceOwned === true,
      context.savedViewOwnerOrShare === true,
    ],
    enabled: Boolean(workspaceId && role && item),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!workspaceId || !item) return false;

      const results = await Promise.all(
        item.alternatives.map(async (alternative) => {
          if (!relayOpsUiContextAllows(alternative.scope, context)) {
            return false;
          }
          try {
            const result = await authClient.organization.hasPermission({
              organizationId: workspaceId,
              permissions: mutablePermissions(alternative.permissions),
            });
            return result.data?.success === true;
          } catch {
            return false;
          }
        }),
      );
      return results.some(Boolean);
    },
  });

  return {
    allowed: query.data === true,
    isCheckingPermissions:
      Boolean(workspaceId && role && item) && query.isLoading,
    refetch: query.refetch,
  };
}
export function useRelayOpsPrimaryServiceOwnership(
  workspaceId: string,
  ownerTeamId?: string | null,
) {
  const query = useQuery({
    queryKey: [
      "workspace-capabilities",
      workspaceId,
      "relayops-primary-owner",
      ownerTeamId,
    ],
    enabled: Boolean(workspaceId && ownerTeamId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const result = await authClient.organization.listUserTeams();
      if (result.error) return false;
      return (
        result.data?.some(
          (team) =>
            team.id === ownerTeamId && team.organizationId === workspaceId,
        ) === true
      );
    },
  });
  return {
    primaryServiceOwned: query.data === true,
    isCheckingOwnership: Boolean(ownerTeamId) && query.isLoading,
  };
}
