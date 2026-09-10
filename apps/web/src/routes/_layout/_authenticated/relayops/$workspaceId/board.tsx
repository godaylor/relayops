import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponseBoard,
  type ResponseBoardTransitionCommand,
  responseBoardLaneStatuses,
} from "@/components/relayops/response-board";
import { getResponseBoardLabels } from "@/components/relayops/response-board/response-board-labels";
import {
  RelayOpsErrorState,
  RelayOpsSkeleton,
} from "@/components/relayops/route-state";
import { transitionRelayOpsIncident } from "@/fetchers/relayops";
import {
  relayOpsKeys,
  useRelayOpsWorkbench,
} from "@/hooks/queries/relayops/use-relayops";
import { useRelayOpsCapability } from "@/hooks/relayops/use-relayops-capability";
import { parseWorkbenchSearch } from "@/lib/relayops-workbench-search";

export const Route = createFileRoute(
  "/_layout/_authenticated/relayops/$workspaceId/board",
)({ component: ResponseBoardRoute });

function ResponseBoardRoute() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const labels = useMemo(() => getResponseBoardLabels(t), [t]);
  const search = useMemo(
    () =>
      parseWorkbenchSearch({
        status: responseBoardLaneStatuses.join(","),
        sort: "severity,-lastUpdateAt",
      }),
    [],
  );
  const incidents = useRelayOpsWorkbench(workspaceId, search);
  const canTransition = useRelayOpsCapability(
    "action.incident.transition",
    {},
    workspaceId,
  );
  const canResolve = useRelayOpsCapability(
    "action.incident.resolve",
    {},
    workspaceId,
  );
  const canDismiss = useRelayOpsCapability(
    "action.incident.dismiss",
    {},
    workspaceId,
  );
  const canReopen = useRelayOpsCapability(
    "action.incident.reopen",
    {},
    workspaceId,
  );

  if (incidents.isLoading) return <RelayOpsSkeleton rows={7} />;
  if (incidents.error || !incidents.data) {
    return (
      <RelayOpsErrorState
        error={incidents.error}
        onRetry={() => incidents.refetch()}
      />
    );
  }

  const items = incidents.data.pages.flatMap((page) => page.items);
  async function transition(command: ResponseBoardTransitionCommand) {
    const resolutionSummary =
      command.to === "resolved"
        ? globalThis.prompt(t("relayops:board.resolutionPrompt"))?.trim()
        : undefined;
    if (command.to === "resolved" && !resolutionSummary) {
      throw new Error(t("relayops:board.resolutionRequired"));
    }

    const detail = await transitionRelayOpsIncident(
      workspaceId,
      command.incidentId,
      {
        to: command.to,
        expectedVersion: command.expectedVersion,
        idempotencyKey: command.idempotencyKey,
        resolutionSummary,
      },
    );
    queryClient.setQueryData(
      relayOpsKeys.incident(workspaceId, command.incidentId),
      detail,
    );
    void queryClient.invalidateQueries({
      queryKey: relayOpsKeys.workspace(workspaceId),
    });
    return detail.incident;
  }

  return (
    <ResponseBoard
      incidents={items}
      labels={labels}
      onTransition={transition}
      canTransition={(incident, target) => {
        if (target === "resolved") return canResolve.allowed;
        if (target === "dismissed") return canDismiss.allowed;
        if (incident.status === "resolved" || incident.status === "dismissed") {
          return canReopen.allowed;
        }
        return canTransition.allowed;
      }}
      onOpenIncident={(incidentId) =>
        void navigate({
          to: "/relayops/$workspaceId/incidents/$incidentId",
          params: { workspaceId, incidentId },
        })
      }
    />
  );
}
