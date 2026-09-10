import { Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateRelayOpsIncident,
  useRelayOpsServices,
} from "@/hooks/queries/relayops/use-relayops";
import { useRelayOpsCapability } from "@/hooks/relayops/use-relayops-capability";

export function CreateIncidentDialog({
  workspaceId,
  serviceId,
}: {
  workspaceId: string;
  serviceId?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const capability = useRelayOpsCapability(
    "action.incident.create",
    {},
    workspaceId,
  );
  if (!capability.allowed) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        {t("relayops:incident.submit")}
      </DialogTrigger>
      <DialogPopup>
        {open && (
          <CreateIncidentForm
            workspaceId={workspaceId}
            serviceId={serviceId}
            onCreated={() => setOpen(false)}
          />
        )}
      </DialogPopup>
    </Dialog>
  );
}

function CreateIncidentForm({
  workspaceId,
  serviceId,
  onCreated,
}: {
  workspaceId: string;
  serviceId?: string;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const navigate = useNavigate();
  const services = useRelayOpsServices(workspaceId, { status: "active" });
  const create = useCreateRelayOpsIncident(workspaceId);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    const input = {
      serviceId: String(data.get("serviceId")),
      title: String(data.get("title")).trim(),
      summary: String(data.get("summary") || "").trim(),
      severity: String(data.get("severity")) as
        | "unknown"
        | "sev1"
        | "sev2"
        | "sev3"
        | "sev4",
    };
    if (!input.title) return;
    const payload = JSON.stringify(input);
    // Retrying an uncertain response must reuse the same key, while edited input is a new command.
    if (attempt.current?.payload !== payload)
      attempt.current = { payload, key: crypto.randomUUID() };
    submitting.current = true;
    try {
      const detail = await create.mutateAsync({
        ...input,
        idempotencyKey: attempt.current.key,
      });
      await navigate({
        to: "/relayops/$workspaceId/incidents/$incidentId",
        params: { workspaceId, incidentId: detail.incident.id },
      });
      onCreated();
    } catch {
      // The mutation error is rendered without discarding the user's input.
    } finally {
      submitting.current = false;
    }
  }
  const ready = Boolean(services.data?.length);
  return (
    <form className="contents" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{t("relayops:incident.submit")}</DialogTitle>
        <DialogDescription>
          {t("relayops:incident.description")}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        {services.isLoading ? (
          <p role="status">{t("relayops:states.loading")}</p>
        ) : services.error ? (
          <div role="alert">
            <p>{t("relayops:incident.servicesError")}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void services.refetch()}
            >
              {t("relayops:inspector.retry")}
            </Button>
          </div>
        ) : !ready ? (
          <p>
            {t("relayops:incident.serviceFirst")}{" "}
            <Link
              to="/relayops/$workspaceId/services"
              params={{ workspaceId }}
              onClick={onCreated}
              className="underline"
            >
              {t("relayops:overview.openCatalog")}
            </Link>
          </p>
        ) : (
          <fieldset disabled={create.isPending} className="space-y-4">
            <label
              className="block space-y-1.5 text-sm"
              htmlFor={`${id}-service`}
            >
              <span>{t("relayops:workbench.columnsById.service")}</span>
              <select
                id={`${id}-service`}
                name="serviceId"
                defaultValue={serviceId}
                required
                className="h-10 w-full rounded-md border border-input bg-background px-3 focus-visible:ring-2"
              >
                <option value="">{t("relayops:incident.chooseService")}</option>
                {services.data?.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="block space-y-1.5 text-sm"
              htmlFor={`${id}-title`}
            >
              <span>{t("relayops:incident.name")}</span>
              <Input
                id={`${id}-title`}
                name="title"
                required
                pattern=".*\S.*"
                maxLength={200}
              />
            </label>
            <label
              className="block space-y-1.5 text-sm"
              htmlFor={`${id}-severity`}
            >
              <span>{t("relayops:incident.severity")}</span>
              <select
                id={`${id}-severity`}
                name="severity"
                defaultValue="unknown"
                className="h-10 w-full rounded-md border border-input bg-background px-3 focus-visible:ring-2"
              >
                {(["unknown", "sev1", "sev2", "sev3", "sev4"] as const).map(
                  (value) => (
                    <option key={value} value={value}>
                      {t(`relayops:severity.${value}`)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label
              className="block space-y-1.5 text-sm"
              htmlFor={`${id}-summary`}
            >
              <span>{t("relayops:incident.summary")}</span>
              <Textarea
                id={`${id}-summary`}
                name="summary"
                maxLength={2000}
                rows={4}
              />
            </label>
          </fieldset>
        )}
        {create.error && (
          <p role="alert" className="mt-4 text-destructive text-sm">
            {t("relayops:incident.error")}
          </p>
        )}
      </DialogPanel>
      <DialogFooter>
        <DialogClose
          render={
            <Button
              type="button"
              variant="outline"
              disabled={create.isPending}
            />
          }
        >
          {t("common:actions.cancel")}
        </DialogClose>
        <Button type="submit" disabled={!ready || create.isPending}>
          {create.isPending
            ? t("relayops:states.loading")
            : t("relayops:incident.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
