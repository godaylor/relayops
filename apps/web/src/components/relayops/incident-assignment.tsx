import { useId, useState } from "react";
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
  const id = useId();
  const members = useGetWorkspaceUsers({ workspaceId });
  const assign = useAssignRelayOpsIncidentParticipants(
    workspaceId,
    detail.incident.id,
  );
  const [selected, setSelected] = useState<string | undefined>();
  const [result, setResult] = useState<"saved" | "failed" | null>(null);
  const value = selected ?? detail.commander?.id ?? "";
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setResult(null);
        try {
          await assign.mutateAsync({
            expectedVersion: detail.incident.version,
            idempotencyKey: crypto.randomUUID(),
            commanderId: value || null,
          });
          setSelected(undefined);
          setResult("saved");
        } catch {
          setResult("failed");
        }
      }}
    >
      <label className="block text-sm font-medium" htmlFor={id}>
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
          className="min-h-11 w-full max-w-md rounded-md border bg-background px-3 text-sm"
          value={value}
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
      >
        {t("relayops:assignment.save")}
      </Button>
      {result ? (
        <p role={result === "failed" ? "alert" : "status"}>
          {t(
            result === "saved"
              ? "relayops:commands.saved"
              : "relayops:commands.failed",
          )}
        </p>
      ) : null}
    </form>
  );
}
