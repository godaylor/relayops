import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  ArrowUpRight,
  ChevronDown,
  Download,
  LockKeyhole,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
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
import useGetFullWorkspace from "@/hooks/queries/workspace/use-get-full-workspace";
import { useRelayOpsCapability } from "@/hooks/relayops/use-relayops-capability";
import { getInitials } from "@/lib/get-initials";
import "./manage-workspace.css";

export const Route = createFileRoute(
  "/_layout/_authenticated/relayops/$workspaceId/legacy",
)({ component: ManageAndLegacyArchive });

const roleKeys = {
  owner: "relayops:role.owner",
  admin: "relayops:role.admin",
  member: "relayops:role.member",
  viewer: "relayops:role.viewer",
  responder: "relayops:role.responder",
  incident_commander: "relayops:role.incident_commander",
  service_owner: "relayops:role.service_owner",
  workspace_admin: "relayops:role.workspace_admin",
} as const;

function ManageAndLegacyArchive() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { workspaceId } = Route.useParams();
  const workspace = useGetFullWorkspace({ workspaceId });
  const archive = useRelayOpsLegacyArchive(workspaceId);
  const exportData = useExportRelayOpsLegacyData(workspaceId);
  const canExport = useRelayOpsCapability(
    "action.legacy.export",
    {},
    workspaceId,
  );
  if (archive.isLoading || workspace.isLoading)
    return <RelayOpsSkeleton rows={6} />;
  if (archive.error || !archive.data || workspace.error || !workspace.data) {
    return (
      <RelayOpsErrorState
        error={archive.error || workspace.error}
        onRetry={() => {
          void archive.refetch();
          void workspace.refetch();
        }}
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
    <div className="sbor-manage">
      <header className="sbor-manage-heading">
        <p className="sbor-eyebrow">{t("relayops:manage.eyebrow")}</p>
        <h1>{t("relayops:manage.title")}</h1>
        <p>{t("relayops:manage.description")}</p>
      </header>
      <section
        className="sbor-team-surface"
        aria-labelledby="workspace-team-title"
      >
        <header className="sbor-team-heading">
          <div>
            <div className="sbor-team-title">
              <Users aria-hidden="true" />
              <h2 id="workspace-team-title">
                {t("relayops:manage.membersTitle")}
              </h2>
              <span className="sbor-team-count">
                {new Intl.NumberFormat(i18n.language).format(
                  workspace.data.members.length,
                )}
              </span>
            </div>
            <p>{t("relayops:manage.membersDescription")}</p>
          </div>
          <Button
            variant="outline"
            render={
              <Link
                to="/dashboard/workspace/$workspaceId/members"
                params={{ workspaceId }}
              />
            }
          >
            {t("relayops:manage.openMembers")}
            <ArrowUpRight aria-hidden="true" />
          </Button>
        </header>
        <ul className="sbor-team-members">
          {workspace.data.members.map((member) => {
            const name = member.user.name?.trim() || t("common:people.unknown");
            const isSelf = member.userId === user?.id;
            return (
              <li key={member.id} className="sbor-team-member">
                <span className="sbor-member-avatar" aria-hidden="true">
                  {getInitials(name)}
                </span>
                <div className="sbor-member-identity">
                  <div>
                    <strong>{name}</strong>
                    {isSelf ? <span>{t("team:members.you")}</span> : null}
                  </div>
                  <div className="sbor-member-roles">
                    <ShieldCheck aria-hidden="true" />
                    {member.role.split(",").map((value) => {
                      const role = value.trim();
                      return (
                        <span key={role}>
                          {Object.hasOwn(roleKeys, role)
                            ? t(roleKeys[role as keyof typeof roleKeys])
                            : role}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <details className="sbor-manage-technical">
        <summary>
          <LockKeyhole aria-hidden="true" />
          <span>{t("relayops:manage.technicalTitle")}</span>
          <ChevronDown aria-hidden="true" />
        </summary>
        <div className="sbor-manage-details">
          <section className="sbor-access-explanation">
            <ShieldCheck aria-hidden="true" />
            <div>
              <h2>{t("relayops:manage.apiAuthority")}</h2>
              <p>{t("relayops:manage.apiAuthorityDescription")}</p>
            </div>
          </section>
          <section className="sbor-legacy-surface">
            <header>
              <div>
                <div className="sbor-legacy-title">
                  <Archive aria-hidden="true" />
                  <h2>{t("relayops:legacy.title")}</h2>
                  <Badge variant="outline">
                    {t("relayops:legacy.readOnly")}
                  </Badge>
                </div>
                <p>{t("relayops:legacy.description")}</p>
              </div>
              {canExport.allowed ? (
                <Button
                  variant="outline"
                  loading={exportData.isPending}
                  onClick={() => {
                    // The mutation owns the visible error state below.
                    void downloadExport().catch(() => undefined);
                  }}
                >
                  <Download aria-hidden="true" />
                  {t("relayops:legacy.export")}
                </Button>
              ) : null}
            </header>
            {exportData.error ? (
              <p role="alert" className="sbor-export-error">
                {t("relayops:legacy.exportError")}
              </p>
            ) : null}
            {archive.data.projects.length === 0 ? (
              <div className="sbor-legacy-empty">
                <Archive aria-hidden="true" />
                <div>
                  <h3>{t("relayops:legacy.emptyTitle")}</h3>
                  <p>{t("relayops:legacy.emptyDescription")}</p>
                </div>
              </div>
            ) : (
              <div className="sbor-legacy-projects">
                {archive.data.projects.map((project) => (
                  <article key={project.id}>
                    <div>
                      <h3>{project.name}</h3>
                      <p>{project.slug}</p>
                    </div>
                    <div className="sbor-legacy-project-meta">
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
      </details>
    </div>
  );
}
