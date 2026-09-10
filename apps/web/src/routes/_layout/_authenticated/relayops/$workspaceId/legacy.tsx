import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, Download, LockKeyhole, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  RelayOpsErrorState,
  RelayOpsSkeleton,
} from "@/components/relayops/route-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useExportRelayOpsLegacyData,
  useRelayOpsLegacyArchive,
} from "@/hooks/queries/relayops/use-relayops";

export const Route = createFileRoute(
  "/_layout/_authenticated/relayops/$workspaceId/legacy",
)({
  component: ManageAndLegacyArchive,
});

function ManageAndLegacyArchive() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const archive = useRelayOpsLegacyArchive(workspaceId);
  const exportData = useExportRelayOpsLegacyData(workspaceId);

  if (archive.isLoading) return <RelayOpsSkeleton rows={6} />;
  if (archive.error || !archive.data) {
    return (
      <RelayOpsErrorState
        error={archive.error}
        onRetry={() => archive.refetch()}
      />
    );
  }

  async function downloadExport() {
    const data = await exportData.mutateAsync();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `relayops-legacy-${workspaceId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div>
        <p className="font-mono text-[#245ebe] text-xs tracking-[0.16em] dark:text-[#8fb6ff]">
          {t("relayops:manage.eyebrow")}
        </p>
        <h1 className="mt-1 font-semibold text-3xl tracking-tight">
          {t("relayops:manage.title")}
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
          {t("relayops:manage.description")}
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/dashboard/workspace/$workspaceId/members"
          params={{ workspaceId }}
          className="flex min-h-24 items-center gap-4 rounded-lg border border-[#17211f]/10 bg-white p-4 hover:bg-[#e2e9e6]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#245ebe] dark:border-white/10 dark:bg-[#101a18]"
        >
          <span className="grid size-10 place-items-center rounded-md bg-[#245ebe]/8 text-[#245ebe] dark:text-[#8fb6ff]">
            <Users className="size-5" />
          </span>
          <span>
            <span className="font-medium">{t("relayops:manage.team")}</span>
            <span className="mt-1 block text-muted-foreground text-sm">
              {t("relayops:manage.teamDescription")}
            </span>
          </span>
        </Link>
        <div className="flex min-h-24 items-center gap-4 rounded-lg border border-[#17211f]/10 bg-white p-4 dark:border-white/10 dark:bg-[#101a18]">
          <span className="grid size-10 place-items-center rounded-md bg-emerald-700/8 text-emerald-700">
            <LockKeyhole className="size-5" />
          </span>
          <span>
            <span className="font-medium">
              {t("relayops:manage.apiAuthority")}
            </span>
            <span className="mt-1 block text-muted-foreground text-sm">
              {t("relayops:manage.apiAuthorityDescription")}
            </span>
          </span>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-[#17211f]/10 bg-white dark:border-white/10 dark:bg-[#101a18]">
        <div className="flex flex-col justify-between gap-4 border-b p-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Archive className="size-5 text-[#b9651b]" />
              <h2 className="font-semibold text-xl">
                {t("relayops:legacy.title")}
              </h2>
              <Badge variant="outline">{t("relayops:legacy.readOnly")}</Badge>
            </div>
            <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
              {t("relayops:legacy.description")}
            </p>
          </div>
          <Button
            variant="outline"
            loading={exportData.isPending}
            onClick={downloadExport}
          >
            <Download className="size-4" />
            {t("relayops:legacy.export")}
          </Button>
        </div>
        {exportData.error ? (
          <p
            role="alert"
            className="border-b px-5 py-3 text-destructive text-sm"
          >
            {t("relayops:legacy.exportError")}
          </p>
        ) : null}
        {archive.data.projects.length === 0 ? (
          <div className="grid min-h-56 place-items-center p-8 text-center">
            <div>
              <Archive className="mx-auto size-8 text-muted-foreground" />
              <h3 className="mt-3 font-medium">
                {t("relayops:legacy.emptyTitle")}
              </h3>
              <p className="mt-1 text-muted-foreground text-sm">
                {t("relayops:legacy.emptyDescription")}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {archive.data.projects.map((project) => (
              <article
                key={project.id}
                className="flex min-h-16 items-center justify-between gap-4 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{project.name}</p>
                  <p className="font-mono text-muted-foreground text-xs">
                    {project.slug}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-muted-foreground text-sm">
                  <span>
                    {t("relayops:legacy.taskCount", {
                      count: project.taskCount,
                    })}
                  </span>
                  {project.archivedAt ? (
                    <Badge variant="outline">
                      {t("relayops:catalog.archived")}
                    </Badge>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
