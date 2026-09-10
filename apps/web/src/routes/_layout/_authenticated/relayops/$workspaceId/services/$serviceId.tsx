import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  ArrowLeft,
  ExternalLink,
  RotateCcw,
  Server,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  RelayOpsErrorState,
  RelayOpsSkeleton,
} from "@/components/relayops/route-state";
import { ServiceForm } from "@/components/relayops/service-form";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useRelayOpsService,
  useRelayOpsTeams,
  useSetRelayOpsServiceArchived,
  useUpdateRelayOpsService,
} from "@/hooks/queries/relayops/use-relayops";
import { useRelayOpsCapability } from "@/hooks/relayops/use-relayops-capability";
import { formatRelayOpsDateTime } from "@/lib/relayops-format";

export const Route = createFileRoute(
  "/_layout/_authenticated/relayops/$workspaceId/services/$serviceId",
)({
  component: ServiceDetail,
});

function ServiceDetail() {
  const { t } = useTranslation();
  const { workspaceId, serviceId } = Route.useParams();
  const service = useRelayOpsService(workspaceId, serviceId);
  const teams = useRelayOpsTeams(workspaceId);
  const update = useUpdateRelayOpsService(workspaceId, serviceId);
  const archive = useSetRelayOpsServiceArchived(workspaceId, serviceId);
  const updateCapability = useRelayOpsCapability(
    "action.service.update",
    {},
    workspaceId,
  );
  const archiveCapability = useRelayOpsCapability(
    "action.service.archive",
    {},
    workspaceId,
  );
  const [editing, setEditing] = useState(false);

  if (service.isLoading || teams.isLoading)
    return <RelayOpsSkeleton rows={6} />;
  const error = service.error || teams.error;
  if (error || !service.data || !teams.data) {
    return (
      <RelayOpsErrorState
        error={error}
        onRetry={() => {
          void service.refetch();
          void teams.refetch();
        }}
      />
    );
  }

  const item = service.data;
  const canUpdate =
    !updateCapability.isCheckingPermissions && updateCapability.allowed;
  const canArchive =
    !archiveCapability.isCheckingPermissions && archiveCapability.allowed;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Button
        variant="ghost"
        render={
          <Link to="/relayops/$workspaceId/services" params={{ workspaceId }} />
        }
      >
        <ArrowLeft className="size-4" />
        {t("relayops:service.backToCatalog")}
      </Button>

      <section className="rounded-xl border border-[#17211f]/10 bg-white p-5 dark:border-white/10 dark:bg-[#101a18] sm:p-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div className="flex min-w-0 gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-[#245ebe]/8 text-[#245ebe] dark:text-[#8fb6ff]">
              <Server className="size-6" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-semibold text-3xl tracking-tight">
                  {item.name}
                </h1>
                {item.archivedAt ? (
                  <Badge variant="outline">
                    {t("relayops:catalog.archived")}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 font-mono text-muted-foreground text-sm">
                {item.slug}
              </p>
            </div>
          </div>
          {canUpdate || canArchive ? (
            <div className="flex flex-wrap gap-2">
              {canUpdate ? (
                <Button
                  variant="outline"
                  onClick={() => setEditing((value) => !value)}
                >
                  {editing
                    ? t("relayops:service.cancelEdit")
                    : t("relayops:service.edit")}
                </Button>
              ) : null}
              {canArchive ? (
                item.archivedAt ? (
                  <Button
                    variant="outline"
                    loading={archive.isPending}
                    onClick={() => archive.mutate(false)}
                  >
                    <RotateCcw className="size-4" />
                    {t("relayops:service.restore")}
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={<Button variant="destructive-outline" />}
                    >
                      <Archive className="size-4" />
                      {t("relayops:service.archive")}
                    </AlertDialogTrigger>
                    <AlertDialogPopup>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t("relayops:service.archiveTitle")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("relayops:service.archiveDescription", {
                            name: item.name,
                          })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogClose render={<Button variant="outline" />}>
                          {t("relayops:service.keepActive")}
                        </AlertDialogClose>
                        <Button
                          variant="destructive"
                          loading={archive.isPending}
                          onClick={() => archive.mutate(true)}
                        >
                          {t("relayops:service.archive")}
                        </Button>
                      </AlertDialogFooter>
                    </AlertDialogPopup>
                  </AlertDialog>
                )
              ) : null}
            </div>
          ) : null}
        </div>

        {archive.error ? (
          <p role="alert" className="mt-4 text-destructive text-sm">
            {t("relayops:service.archiveError")}
          </p>
        ) : null}

        {editing ? (
          <div className="mt-7 border-t pt-6">
            <ServiceForm
              initial={item}
              teams={teams.data}
              pending={update.isPending}
              error={update.error}
              submitLabel={t("relayops:service.save")}
              onSubmit={async (input) => {
                await update.mutateAsync(input);
                setEditing(false);
              }}
            />
          </div>
        ) : (
          <>
            <dl className="mt-8 grid gap-5 border-t pt-6 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                  {t("relayops:service.tier")}
                </dt>
                <dd className="mt-1 font-medium">
                  {t(`relayops:tier.${item.tier}`)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                  {t("relayops:service.health")}
                </dt>
                <dd className="mt-1 font-medium">
                  {t(`relayops:health.${item.health}`)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                  {t("relayops:service.ownerTeam")}
                </dt>
                <dd className="mt-1 font-medium">
                  {item.ownerTeamName || t("relayops:service.noOwner")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                  {t("relayops:service.updated")}
                </dt>
                <dd className="mt-1 font-medium">
                  {formatRelayOpsDateTime(item.updatedAt)}
                </dd>
              </div>
            </dl>
            <div className="mt-7 grid gap-5 border-t pt-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div>
                <h2 className="font-medium">
                  {t("relayops:service.descriptionTitle")}
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground text-sm">
                  {item.description || t("relayops:service.noDescription")}
                </p>
              </div>
              <div className="space-y-2">
                <h2 className="font-medium">{t("relayops:service.links")}</h2>
                {item.repositoryUrl ? (
                  <a
                    href={item.repositoryUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-11 items-center justify-between rounded-md border px-3 text-sm hover:bg-[#e2e9e6]/45"
                  >
                    {t("relayops:service.repository")}
                    <ExternalLink className="size-4" />
                  </a>
                ) : null}
                {item.runbookUrl ? (
                  <a
                    href={item.runbookUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-11 items-center justify-between rounded-md border px-3 text-sm hover:bg-[#e2e9e6]/45"
                  >
                    {t("relayops:service.runbook")}
                    <ExternalLink className="size-4" />
                  </a>
                ) : null}
                {!item.repositoryUrl && !item.runbookUrl ? (
                  <p className="text-muted-foreground text-sm">
                    {t("relayops:service.noLinks")}
                  </p>
                ) : null}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
