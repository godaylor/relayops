import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, UserRound } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { RelayOpsIncidentDetail } from "@/fetchers/relayops";
import { useAssignRelayOpsIncidentParticipants } from "@/hooks/queries/relayops/use-relayops";
import useGetWorkspaceUsers from "@/hooks/queries/workspace-users/use-get-workspace-users";

export function IncidentAssignment({
  workspaceId,
  detail,
}: {
  workspaceId: string;
  detail: RelayOpsIncidentDetail;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const id = useId();
  const members = useGetWorkspaceUsers({ workspaceId });
  const assign = useAssignRelayOpsIncidentParticipants(
    workspaceId,
    detail.incident.id,
  );
  const [selected, setSelected] = useState<string | undefined>();
  const [open, setOpen] = useState(!detail.commander);
  const [result, setResult] = useState<"saved" | "failed" | null>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const value = selected ?? detail.commander?.id ?? "";
  const initials = detail.commander?.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase();
  return (
    <div className="sbor-assignment-region" aria-busy={assign.isPending}>
      <details
        className="sbor-assignment-disclosure"
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary ref={summaryRef}>
          <span className="sbor-person-avatar" aria-hidden="true">
            {initials || <UserRound />}
          </span>
          <span>
            <span>{t("relayops:assignment.label")}</span>
            <AnimatePresence initial={false} mode="wait">
              <motion.strong
                key={detail.commander?.id ?? "unassigned"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
              >
                {detail.commander?.name ??
                  t("relayops:incidentRoom.unassigned")}
              </motion.strong>
            </AnimatePresence>
          </span>
          {result === "saved" ? (
            <Check className="sbor-assignment-confirmed" aria-hidden="true" />
          ) : null}
          <ChevronDown aria-hidden="true" />
        </summary>
        <form
          className="sbor-room-assignment"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            setResult(null);
            try {
              await assign.mutateAsync({
                expectedVersion: detail.incident.version,
                idempotencyKey: crypto.randomUUID(),
                commanderId: value || null,
              });
              setSelected(undefined);
              setResult("saved");
              if (value && form.contains(document.activeElement)) {
                summaryRef.current?.focus();
              }
              setOpen(!value);
            } catch {
              setResult("failed");
            }
          }}
        >
          <label htmlFor={id}>
            <UserRound aria-hidden="true" />
            {t("relayops:assignment.label")}
          </label>
          {members.isLoading ? (
            <p role="status">{t("relayops:assignment.loading")}</p>
          ) : members.error ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void members.refetch()}
            >
              {t("relayops:assignment.error")}
            </Button>
          ) : (
            <select
              id={id}
              className="sbor-assignment-select"
              value={value}
              disabled={assign.isPending}
              onChange={(event) => {
                setSelected(event.target.value);
                setResult(null);
              }}
            >
              <option value="">{t("relayops:assignment.clear")}</option>
              {members.data?.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.user.name}
                </option>
              ))}
            </select>
          )}
          <Button
            type="submit"
            disabled={assign.isPending || !members.data}
            variant="outline"
            loading={assign.isPending}
          >
            {t("relayops:assignment.save")}
          </Button>
        </form>
      </details>
      <AnimatePresence initial={false}>
        {result ? (
          <motion.p
            key={result}
            className="sbor-assignment-feedback"
            role={result === "failed" ? "alert" : "status"}
            data-result={result}
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
            {result === "saved" ? <Check aria-hidden="true" /> : null}
            {t(
              result === "saved"
                ? "relayops:commands.saved"
                : "relayops:commands.failed",
            )}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
