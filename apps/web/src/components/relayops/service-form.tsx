import { type FormEvent, useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  RelayOpsService,
  RelayOpsServiceInput,
  RelayOpsTeam,
} from "@/fetchers/relayops";

export function ServiceForm({
  initial,
  teams,
  pending,
  error,
  submitLabel,
  onSubmit,
}: {
  initial?: RelayOpsService;
  teams: RelayOpsTeam[];
  pending: boolean;
  error?: unknown;
  submitLabel: string;
  onSubmit: (input: RelayOpsServiceInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const formId = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nullable = (key: string) => {
      const value = String(form.get(key) || "").trim();
      return value || null;
    };
    await onSubmit({
      name: String(form.get("name")).trim(),
      slug: String(form.get("slug")).trim(),
      description: String(form.get("description") || "").trim() || undefined,
      tier: String(form.get("tier")) as RelayOpsServiceInput["tier"],
      health: String(form.get("health")) as RelayOpsServiceInput["health"],
      ownerTeamId: nullable("ownerTeamId"),
      repositoryUrl: nullable("repositoryUrl"),
      runbookUrl: nullable("runbookUrl"),
    });
  }

  const fieldClass = "space-y-1.5 text-sm";
  const selectClass =
    "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#245ebe]";

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={fieldClass} htmlFor={`${formId}-name`}>
          <span>{t("relayops:service.name")}</span>
          <Input
            id={`${formId}-name`}
            name="name"
            required
            maxLength={120}
            defaultValue={initial?.name}
          />
        </label>
        <label className={fieldClass} htmlFor={`${formId}-slug`}>
          <span>{t("relayops:service.slug")}</span>
          <Input
            id={`${formId}-slug`}
            name="slug"
            required
            maxLength={48}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            defaultValue={initial?.slug}
          />
        </label>
        <label className={fieldClass} htmlFor={`${formId}-tier`}>
          <span>{t("relayops:service.tier")}</span>
          <select
            id={`${formId}-tier`}
            name="tier"
            className={selectClass}
            defaultValue={initial?.tier ?? "standard"}
          >
            {(["critical", "high", "standard", "low"] as const).map((tier) => (
              <option key={tier} value={tier}>
                {t(`relayops:tier.${tier}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldClass} htmlFor={`${formId}-health`}>
          <span>{t("relayops:service.health")}</span>
          <select
            id={`${formId}-health`}
            name="health"
            className={selectClass}
            defaultValue={initial?.health ?? "operational"}
          >
            {(
              [
                "operational",
                "degraded",
                "major_outage",
                "maintenance",
              ] as const
            ).map((health) => (
              <option key={health} value={health}>
                {t(`relayops:health.${health}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={fieldClass} htmlFor={`${formId}-owner-team`}>
        <span>{t("relayops:service.ownerTeam")}</span>
        <select
          id={`${formId}-owner-team`}
          name="ownerTeamId"
          className={selectClass}
          defaultValue={initial?.ownerTeamId ?? ""}
        >
          <option value="">{t("relayops:service.noOwner")}</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>
      <label className={fieldClass} htmlFor={`${formId}-description`}>
        <span>{t("relayops:service.description")}</span>
        <Textarea
          id={`${formId}-description`}
          name="description"
          maxLength={500}
          defaultValue={initial?.description ?? ""}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={fieldClass} htmlFor={`${formId}-repository`}>
          <span>{t("relayops:service.repositoryUrl")}</span>
          <Input
            id={`${formId}-repository`}
            name="repositoryUrl"
            type="url"
            placeholder="https://"
            defaultValue={initial?.repositoryUrl ?? ""}
          />
        </label>
        <label className={fieldClass} htmlFor={`${formId}-runbook`}>
          <span>{t("relayops:service.runbookUrl")}</span>
          <Input
            id={`${formId}-runbook`}
            name="runbookUrl"
            type="url"
            placeholder="https://"
            defaultValue={initial?.runbookUrl ?? ""}
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {t("relayops:service.error")}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? t("relayops:creating") : submitLabel}
      </Button>
    </form>
  );
}
