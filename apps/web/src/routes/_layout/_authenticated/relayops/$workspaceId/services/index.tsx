import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Archive,
  ArrowRight,
  FilterX,
  Plus,
  Server,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  RelayOpsErrorState,
  RelayOpsSkeleton,
} from "@/components/relayops/route-state";
import {
  ServiceCatalogFilters,
  type ServiceCatalogSearch,
} from "@/components/relayops/service-catalog-filters";
import { ServiceForm } from "@/components/relayops/service-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useCreateRelayOpsService,
  useRelayOpsServices,
  useRelayOpsTeams,
} from "@/hooks/queries/relayops/use-relayops";
import { useRelayOpsCapability } from "@/hooks/relayops/use-relayops-capability";
import {
  formatRelayOpsDateTime,
  getRelayOpsLocale,
} from "@/lib/relayops-format";
import "@/components/relayops/service-analytics.css";

type ServiceSearch = ServiceCatalogSearch;

export function parseServiceSearch(
  search: Record<string, unknown>,
): ServiceSearch {
  const q =
    typeof search.q === "string" && search.q.trim()
      ? search.q.trim()
      : undefined;
  const status =
    search.status === "archived" || search.status === "all"
      ? search.status
      : "active";
  return { q, status };
}

export const Route = createFileRoute(
  "/_layout/_authenticated/relayops/$workspaceId/services/",
)({
  validateSearch: parseServiceSearch,
  component: ServiceCatalog,
});

const healthTone = {
  operational:
    "border-emerald-700/20 bg-emerald-700/8 text-emerald-800 dark:text-emerald-300",
  degraded:
    "border-[#b9651b]/25 bg-[#b9651b]/8 text-[#8d4b14] dark:text-[#f3b677]",
  major_outage:
    "border-[#b73a34]/25 bg-[#b73a34]/8 text-[#8d2c28] dark:text-[#f2a09b]",
  maintenance:
    "border-[#6757ec]/25 bg-[#6757ec]/8 text-[#6757ec] dark:text-[#91b1ee]",
} as const;

function ServiceCatalog() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [showCreate, setShowCreate] = useState(false);
  const services = useRelayOpsServices(workspaceId, search);
  const teams = useRelayOpsTeams(workspaceId);
  const createService = useCreateRelayOpsService(workspaceId);
  const canCreateService = useRelayOpsCapability(
    "action.service.create",
    {},
    workspaceId,
  );

  const error = services.error || teams.error;
  const items = services.data ?? [];
  const filtered = Boolean(search.q) || search.status !== "active";
  const count = new Intl.NumberFormat(getRelayOpsLocale());
  const healthCounts = items.reduce(
    (counts, service) => {
      counts[service.health]++;
      return counts;
    },
    { operational: 0, degraded: 0, major_outage: 0, maintenance: 0 },
  );

  return (
    <div className="sbor-services space-y-6">
      <header className="sbor-surface-header">
        <div>
          <p className="font-mono text-[#6757ec] text-xs tracking-[0.16em] dark:text-[#b3a5ff]">
            {t("relayops:catalog.eyebrow")}
          </p>
          <h1 className="mt-1 font-semibold text-3xl tracking-tight">
            {t("relayops:catalog.title")}
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
            {t("relayops:catalog.description")}
          </p>
        </div>
        {!canCreateService.isCheckingPermissions && canCreateService.allowed ? (
          <Button
            aria-expanded={showCreate}
            aria-controls="create-service-panel"
            disabled={teams.isLoading || Boolean(teams.error)}
            onClick={() => setShowCreate((value) => !value)}
          >
            <Plus className="size-4" aria-hidden="true" />
            {showCreate
              ? t("common:actions.cancel")
              : t("relayops:catalog.create")}
          </Button>
        ) : null}
      </header>

      {showCreate ? (
        <section
          id="create-service-panel"
          className="sbor-service-create rounded-lg border border-[#6757ec]/25 bg-white p-5 dark:bg-[#1a1c35] sm:p-6"
          aria-labelledby="create-service-title"
        >
          <h2 id="create-service-title" className="font-semibold text-xl">
            {t("relayops:catalog.createTitle")}
          </h2>
          <p className="mt-1 mb-5 text-muted-foreground text-sm">
            {t("relayops:catalog.createDescription")}
          </p>
          <ServiceForm
            teams={teams.data ?? []}
            pending={createService.isPending}
            error={createService.error}
            submitLabel={t("relayops:service.submit")}
            onSubmit={async (input) => {
              const service = await createService.mutateAsync(input);
              setShowCreate(false);
              await navigate({
                to: "/relayops/$workspaceId/services/$serviceId",
                params: { workspaceId, serviceId: service.id },
              });
            }}
          />
        </section>
      ) : null}

      <ServiceCatalogFilters
        search={search}
        onApply={(next) => void navigate({ search: next, replace: true })}
      />

      {services.isLoading || teams.isLoading ? (
        <RelayOpsSkeleton rows={4} />
      ) : error || !services.data || !teams.data ? (
        <RelayOpsErrorState
          error={error}
          onRetry={() => {
            void services.refetch();
            void teams.refetch();
          }}
        />
      ) : items.length === 0 ? (
        <section className="sbor-surface-empty grid min-h-72 place-items-center rounded-lg border border-[#1b1d36]/10 bg-white p-8 text-center dark:border-white/10 dark:bg-[#1a1c35]">
          <div className="max-w-md">
            {filtered ? (
              <FilterX className="mx-auto size-9 text-muted-foreground" />
            ) : (
              <Server className="mx-auto size-9 text-[#6757ec] dark:text-[#b3a5ff]" />
            )}
            <h2 className="mt-4 font-semibold text-xl">
              {filtered
                ? t("relayops:catalog.filteredEmptyTitle")
                : t("relayops:catalog.emptyTitle")}
            </h2>
            <p className="mt-2 text-muted-foreground text-sm">
              {filtered
                ? t("relayops:catalog.filteredEmptyDescription")
                : t("relayops:catalog.emptyDescription")}
            </p>
            {filtered ? (
              <Button
                className="mt-5"
                variant="outline"
                onClick={() =>
                  navigate({ search: { status: "active" }, replace: true })
                }
              >
                {t("relayops:catalog.clearFilters")}
              </Button>
            ) : canCreateService.allowed ? (
              <Button className="mt-5" onClick={() => setShowCreate(true)}>
                <Plus className="size-4" aria-hidden="true" />
                {t("relayops:catalog.create")}
              </Button>
            ) : null}
          </div>
        </section>
      ) : (
        <section
          className="sbor-service-results"
          aria-label={t("relayops:catalog.results")}
        >
          <div className="sbor-service-results-heading">
            <h2>
              {t("relayops:catalog.results")}{" "}
              <span>{count.format(items.length)}</span>
            </h2>
            <div className="sbor-service-health-summary">
              {Object.entries(healthCounts)
                .filter(([, value]) => value > 0)
                .map(([health, value]) => (
                  <span key={health} data-health={health}>
                    <span className="sbor-health-dot" aria-hidden="true" />
                    {t(`relayops:health.${health}`)}{" "}
                    <strong>{count.format(value)}</strong>
                  </span>
                ))}
            </div>
          </div>
          <ul className="sbor-service-grid">
            {items.map((service) => (
              <li key={service.id}>
                <Link
                  to="/relayops/$workspaceId/services/$serviceId"
                  params={{ workspaceId, serviceId: service.id }}
                  className="sbor-service-card"
                  data-health={service.health}
                >
                  <div className="sbor-service-card-top">
                    <span className="sbor-service-symbol">
                      <Server size={21} aria-hidden="true" />
                    </span>
                    <Badge
                      variant="outline"
                      className={healthTone[service.health]}
                    >
                      <span className="sbor-health-dot" aria-hidden="true" />
                      {t(`relayops:health.${service.health}`)}
                    </Badge>
                  </div>
                  <div className="sbor-service-card-title">
                    <h3>{service.name}</h3>
                    {service.archivedAt ? (
                      <Archive
                        size={15}
                        aria-label={t("relayops:catalog.archived")}
                      />
                    ) : null}
                  </div>
                  <p className="sbor-service-slug">{service.slug}</p>
                  <p className="sbor-service-description">
                    {service.description || t("relayops:service.noDescription")}
                  </p>
                  <dl className="sbor-service-card-facts">
                    <div>
                      <dt>
                        <Activity size={14} aria-hidden="true" />
                        {t("relayops:service.tier")}
                      </dt>
                      <dd>{t(`relayops:tier.${service.tier}`)}</dd>
                    </div>
                    <div>
                      <dt>
                        <UsersRound size={14} aria-hidden="true" />
                        {t("relayops:service.ownerTeam")}
                      </dt>
                      <dd>
                        {service.ownerTeamName || t("relayops:service.noOwner")}
                      </dd>
                    </div>
                  </dl>
                  <div className="sbor-service-card-footer">
                    <span>
                      {t("relayops:service.updated")}{" "}
                      <time dateTime={service.updatedAt}>
                        {formatRelayOpsDateTime(service.updatedAt)}
                      </time>
                    </span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
