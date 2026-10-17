import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  MessageSquare,
  Send,
} from "lucide-react";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
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
import { IncidentAssignment } from "./incident-assignment";

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
  const reduceMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const incidentId = detail.incident.id;
  const transition = useTransitionRelayOpsIncident(workspaceId, incidentId);
  const canAssign = useRelayOpsCapability(
    "action.incident.assign",
    capabilityContext,
    workspaceId,
  );
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
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const resolutionRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [conflict, setConflict] = useState<RelayOpsVersionConflict | null>(
    null,
  );
  const [commandError, setCommandError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
    setSaved(false);
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
      setSaved(true);
    } catch (error) {
      setCommandError(
        isRelayOpsVersionConflict(error)
          ? t("relayops:commands.conflictTransition")
          : t("relayops:commands.failed"),
      );
    }
  }

  async function publish(expectedVersion: number, idempotencyKey: string) {
    setSaved(false);
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
      setSaved(true);
    } catch (error) {
      if (isRelayOpsVersionConflict(error)) {
        setConflict(error.body);
        return;
      }
      setCommandError(t("relayops:commands.failed"));
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
  if (
    visibleTargets.length === 0 &&
    !canPublish.allowed &&
    !canAssign.allowed
  ) {
    return null;
  }

  return (
    <section
      aria-labelledby="incident-commands-heading"
      className="sbor-command-panel"
    >
      <div className="sbor-command-heading">
        <h2 id="incident-commands-heading" tabIndex={-1}>
          <MessageSquare aria-hidden="true" />
          {t("relayops:commands.title")}
        </h2>
        <details className="sbor-command-technical">
          <summary>
            <ChevronDown aria-hidden="true" />
            {t("relayops:incidentRoom.technicalDetails")}
          </summary>
          <p>
            {t("relayops:commands.version", {
              version: detail.incident.version,
            })}
          </p>
        </details>
      </div>

      {canAssign.allowed ? (
        <IncidentAssignment workspaceId={workspaceId} detail={detail} />
      ) : null}
      {visibleTargets.length > 0 ? (
        <div className="sbor-room-transitions">
          <h3>{t("relayops:commands.transition")}</h3>
          <div className="sbor-transition-buttons">
            {visibleTargets.map((target) => (
              <Button
                key={target}
                type="button"
                variant={target === "dismissed" ? "ghost" : "secondary"}
                className={
                  target === "resolved" ? "sbor-resolve-button" : undefined
                }
                data-transition={target}
                loading={transition.isPending}
                disabled={
                  publishUpdate.isPending ||
                  (target === "resolved" &&
                    resolutionOpen &&
                    !resolutionSummary.trim())
                }
                onClick={() => {
                  if (target === "resolved" && !resolutionSummary.trim()) {
                    setResolutionOpen(true);
                    requestAnimationFrame(() => resolutionRef.current?.focus());
                    return;
                  }
                  void moveTo(target);
                }}
              >
                {t(statusKeys[target])}
                {target === "dismissed" ? null : (
                  <ArrowUpRight aria-hidden="true" />
                )}
              </Button>
            ))}
          </div>
          {visibleTargets.includes("resolved") ? (
            <details
              className="sbor-resolution-disclosure"
              open={resolutionOpen || Boolean(resolutionSummary)}
              onToggle={(event) => setResolutionOpen(event.currentTarget.open)}
            >
              <summary>
                <Check aria-hidden="true" />
                {t("relayops:commands.resolutionSummary")}
                <ChevronDown aria-hidden="true" />
              </summary>
              <Field className="sbor-resolution-field">
                <FieldLabel>
                  {t("relayops:commands.resolutionSummary")}
                </FieldLabel>
                <Textarea
                  ref={resolutionRef}
                  value={resolutionSummary}
                  onChange={(event) => setResolutionSummary(event.target.value)}
                  placeholder={t("relayops:commands.resolutionPlaceholder")}
                  maxLength={5000}
                  size="sm"
                />
              </Field>
            </details>
          ) : null}
        </div>
      ) : null}

      {canPublish.allowed ? (
        <form className="sbor-room-composer" onSubmit={submitUpdate}>
          <Field>
            <FieldLabel>{t("relayops:commands.updateLabel")}</FieldLabel>
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("relayops:commands.updatePlaceholder")}
              maxLength={5000}
              size="sm"
            />
          </Field>
          <div className="sbor-composer-footer">
            <p>{t("relayops:commands.updateHint")}</p>
            <Button
              type="submit"
              loading={publishUpdate.isPending}
              disabled={transition.isPending || !draft.trim()}
            >
              <Send aria-hidden="true" />
              {t("relayops:commands.publish")}
            </Button>
          </div>
        </form>
      ) : null}

      <AnimatePresence initial={false}>
        {saved ? (
          <motion.p
            role="status"
            className="sbor-command-saved"
            initial={{
              opacity: 0,
              transform: reduceMotion ? "none" : "translateY(4px)",
            }}
            animate={{
              opacity: 1,
              transform: reduceMotion ? "none" : "translateY(0px)",
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
          >
            <Check aria-hidden="true" />
            {t("relayops:commands.saved")}
          </motion.p>
        ) : null}
      </AnimatePresence>

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
