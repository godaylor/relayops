import { useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  isRelayOpsVersionConflict,
  type RelayOpsIncidentDetail,
  type RelayOpsVersionConflict,
} from "@/fetchers/relayops";
import {
  relayOpsKeys,
  usePublishRelayOpsIncidentUpdate,
  useTransitionRelayOpsIncident,
} from "@/hooks/queries/relayops/use-relayops";
import { useRelayOpsCapability } from "@/hooks/relayops/use-relayops-capability";
import type {
  RelayOpsUiCapabilityContext,
  RelayOpsUiCapabilityId,
} from "@/lib/relayops-capabilities";
import {
  type RelayOpsIncidentStatus,
  type RelayOpsTransitionTarget,
  relayOpsTransitionTargets,
} from "@/lib/relayops-lifecycle";

const statusKeys = {
  detected: "relayops:status.detected",
  triaging: "relayops:status.triaging",
  mitigating: "relayops:status.mitigating",
  monitoring: "relayops:status.monitoring",
  resolved: "relayops:status.resolved",
  dismissed: "relayops:status.dismissed",
} as const;

function newIdempotencyKey() {
  return crypto.randomUUID();
}

function transitionCapability(
  current: RelayOpsIncidentStatus,
  target: RelayOpsTransitionTarget,
): RelayOpsUiCapabilityId {
  if (target === "resolved") return "action.incident.resolve";
  if (target === "dismissed") return "action.incident.dismiss";
  if (current === "resolved" || current === "dismissed") {
    return "action.incident.reopen";
  }
  return "action.incident.transition";
}

export function IncidentCommandPanel({
  workspaceId,
  detail,
  capabilityContext = {},
}: {
  workspaceId: string;
  detail: RelayOpsIncidentDetail;
  capabilityContext?: RelayOpsUiCapabilityContext;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const incidentId = detail.incident.id;
  const transition = useTransitionRelayOpsIncident(workspaceId, incidentId);
  const canTransition = useRelayOpsCapability(
    "action.incident.transition",
    capabilityContext,
    workspaceId,
  );
  const canResolve = useRelayOpsCapability(
    "action.incident.resolve",
    capabilityContext,
    workspaceId,
  );
  const canReopen = useRelayOpsCapability(
    "action.incident.reopen",
    capabilityContext,
    workspaceId,
  );
  const canDismiss = useRelayOpsCapability(
    "action.incident.dismiss",
    capabilityContext,
    workspaceId,
  );
  const canPublish = useRelayOpsCapability(
    "action.timeline.publish",
    capabilityContext,
    workspaceId,
  );
  const publishUpdate = usePublishRelayOpsIncidentUpdate(
    workspaceId,
    incidentId,
  );
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [draft, setDraft] = useState("");
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [conflict, setConflict] = useState<RelayOpsVersionConflict | null>(
    null,
  );
  const [commandError, setCommandError] = useState<string | null>(null);

  const targets = relayOpsTransitionTargets(
    detail.incident.status as RelayOpsIncidentStatus,
  );
  const currentStatus = detail.incident.status as RelayOpsIncidentStatus;
  const capabilityAllowed: Record<string, boolean> = {
    "action.incident.transition": canTransition.allowed,
    "action.incident.resolve": canResolve.allowed,
    "action.incident.reopen": canReopen.allowed,
    "action.incident.dismiss": canDismiss.allowed,
  };
  const visibleTargets = targets.filter(
    (target) =>
      capabilityAllowed[transitionCapability(currentStatus, target)] === true,
  );

  async function moveTo(target: RelayOpsTransitionTarget) {
    setCommandError(null);
    try {
      await transition.mutateAsync({
        expectedVersion: detail.incident.version,
        idempotencyKey: newIdempotencyKey(),
        to: target,
        ...(target === "resolved"
          ? { resolutionSummary: resolutionSummary.trim() }
          : {}),
      });
      if (target === "resolved") setResolutionSummary("");
    } catch (error) {
      setCommandError(
        isRelayOpsVersionConflict(error)
          ? t("relayops:commands.conflictTransition")
          : error instanceof Error
            ? error.message
            : t("relayops:commands.failed"),
      );
    }
  }

  async function publish(expectedVersion: number, idempotencyKey: string) {
    try {
      await publishUpdate.mutateAsync({
        expectedVersion,
        idempotencyKey,
        message: draft.trim(),
      });
      setDraft("");
      setDraftKey(null);
      setConflict(null);
      setCommandError(null);
    } catch (error) {
      if (isRelayOpsVersionConflict(error)) {
        setConflict(error.body);
        return;
      }
      setCommandError(
        error instanceof Error ? error.message : t("relayops:commands.failed"),
      );
    }
  }

  function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;
    const idempotencyKey = draftKey ?? newIdempotencyKey();
    setDraftKey(idempotencyKey);
    setCommandError(null);
    void publish(detail.incident.version, idempotencyKey);
  }

  function loadCurrent() {
    if (!conflict) return;
    queryClient.setQueryData(
      relayOpsKeys.incident(workspaceId, incidentId),
      conflict.current,
    );
    setConflict(null);
  }
  if (visibleTargets.length === 0 && !canPublish.allowed) {
    return null;
  }

  return (
    <section
      aria-labelledby="incident-commands-heading"
      className="space-y-5 border-t p-5 sm:p-7"
    >
      <div>
        <h2 id="incident-commands-heading" className="font-semibold text-lg">
          {t("relayops:commands.title")}
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {t("relayops:commands.version", {
            version: detail.incident.version,
          })}
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="font-medium text-sm">
          {t("relayops:commands.transition")}
        </h3>
        {visibleTargets.includes("resolved") ? (
          <Field>
            <FieldLabel>{t("relayops:commands.resolutionSummary")}</FieldLabel>
            <Textarea
              value={resolutionSummary}
              onChange={(event) => setResolutionSummary(event.target.value)}
              placeholder={t("relayops:commands.resolutionPlaceholder")}
              maxLength={5000}
            />
          </Field>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {visibleTargets.map((target) => (
            <Button
              key={target}
              type="button"
              variant={target === "dismissed" ? "outline" : "secondary"}
              loading={transition.isPending}
              disabled={target === "resolved" && !resolutionSummary.trim()}
              onClick={() => void moveTo(target)}
            >
              {t(statusKeys[target])}
            </Button>
          ))}
        </div>
      </div>

      {canPublish.allowed ? (
        <form className="space-y-3" onSubmit={submitUpdate}>
          <Field>
            <FieldLabel>{t("relayops:commands.updateLabel")}</FieldLabel>
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("relayops:commands.updatePlaceholder")}
              maxLength={5000}
            />
          </Field>
          <Button
            type="submit"
            loading={publishUpdate.isPending}
            disabled={!draft.trim()}
          >
            {t("relayops:commands.publish")}
          </Button>
        </form>
      ) : null}

      {conflict ? (
        <Alert variant="warning">
          <AlertTitle>{t("relayops:commands.conflictTitle")}</AlertTitle>
          <AlertDescription>
            {t("relayops:commands.conflictDescription", {
              version: conflict.current.incident.version,
              status: t(
                statusKeys[
                  conflict.current.incident.status as keyof typeof statusKeys
                ],
              ),
            })}
          </AlertDescription>
          <AlertAction className="flex-wrap">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={loadCurrent}
            >
              {t("relayops:commands.loadCurrent")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                void publish(
                  conflict.current.incident.version,
                  draftKey ?? newIdempotencyKey(),
                )
              }
            >
              {t("relayops:commands.reapply")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft("");
                setDraftKey(null);
                setConflict(null);
              }}
            >
              {t("relayops:commands.discard")}
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {commandError ? (
        <Alert variant="error">
          <AlertTitle>{t("relayops:commands.failedTitle")}</AlertTitle>
          <AlertDescription>{commandError}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
