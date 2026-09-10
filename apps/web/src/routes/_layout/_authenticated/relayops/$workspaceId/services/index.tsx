import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ArrowRight,
  FilterX,
  Plus,
  Search,
  Server,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  RelayOpsErrorState,
  RelayOpsSkeleton,
} from "@/components/relayops/route-state";
import { ServiceForm } from "@/components/relayops/service-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCreateRelayOpsService,
  useRelayOpsServices,
  useRelayOpsTeams,
} from "@/hooks/queries/relayops/use-relayops";
import { useRelayOpsCapability } from "@/hooks/relayops/use-relayops-capability";

type ServiceSearch = {
  q?: string;
  status: "active" | "archived" | "all";
};

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
    "border-[#245ebe]/25 bg-[#245ebe]/8 text-[#245ebe] dark:text-[#91b1ee]",
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

  if (services.isLoading || teams.isLoading)
    return <RelayOpsSkeleton rows={8} />;
  const error = services.error || teams.error;
  if (error || !services.data || !teams.data) {
    return (
      <RelayOpsErrorState
        error={error}
        onRetry={() => {
          void services.refetch();
          void teams.refetch();
        }}
      />
    );
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const q = String(form.get("q") || "").trim() || undefined;
    const status = String(form.get("status")) as ServiceSearch["status"];
    void navigate({ search: { q, status }, replace: true });
  }

  const filtered = Boolean(search.q) || search.status !== "active";

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-[#245ebe] text-xs tracking-[0.16em] dark:text-[#8fb6ff]">
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
          <Button onClick={() => setShowCreate((value) => !value)}>
            <Plus className="size-4" />
            {t("relayops:catalog.create")}
          </Button>
        ) : null}
      </div>

      {showCreate ? (
        <section
          className="rounded-lg border border-[#245ebe]/25 bg-white p-5 dark:bg-[#101a18] sm:p-6"
          aria-labelledby="create-service-title"
        >
          <h2 id="create-service-title" className="font-semibold text-xl">
            {t("relayops:catalog.createTitle")}
          </h2>
          <p className="mt-1 mb-5 text-muted-foreground text-sm">
            {t("relayops:catalog.createDescription")}
          </p>
          <ServiceForm
            teams={teams.data}
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

      <search>
        <form
          className="grid gap-3 rounded-lg border border-[#17211f]/10 bg-white p-3 dark:border-white/10 dark:bg-[#101a18] sm:grid-cols-[minmax(14rem,1fr)_12rem_auto]"
          onSubmit={applyFilters}
        >
          <label className="relative" htmlFor="relayops-service-search">
            <span className="sr-only">{t("relayops:catalog.searchLabel")}</span>
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="relayops-service-search"
              name="q"
              defaultValue={search.q ?? ""}
              placeholder={t("relayops:catalog.searchPlaceholder")}
              className="min-h-11 pl-9"
            />
          </label>
          <label htmlFor="relayops-service-status">
            <span className="sr-only">{t("relayops:catalog.statusLabel")}</span>
            <select
              id="relayops-service-status"
              name="status"
              defaultValue={search.status}
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#245ebe]"
            >
              <option value="active">{t("relayops:catalog.active")}</option>
              <option value="archived">{t("relayops:catalog.archived")}</option>
              <option value="all">{t("relayops:catalog.all")}</option>
            </select>
          </label>
          <Button type="submit" size="lg">
            {t("relayops:catalog.apply")}
          </Button>
        </form>
      </search>

      {services.data.length === 0 ? (
        <section className="grid min-h-72 place-items-center rounded-lg border border-[#17211f]/10 bg-white p-8 text-center dark:border-white/10 dark:bg-[#101a18]">
          <div className="max-w-md">
            {filtered ? (
              <FilterX className="mx-auto size-9 text-muted-foreground" />
            ) : (
              <Server className="mx-auto size-9 text-[#245ebe] dark:text-[#8fb6ff]" />
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
            ) : null}
          </div>
        </section>
      ) : (
        <section aria-label={t("relayops:catalog.results")}>
          <div className="hidden overflow-hidden rounded-lg border border-[#17211f]/10 bg-white dark:border-white/10 dark:bg-[#101a18] md:block">
            <div className="grid grid-cols-[minmax(16rem,1fr)_8rem_10rem_12rem_2rem] gap-4 border-b bg-[#e2e9e6]/45 px-5 py-3 font-medium text-xs uppercase tracking-wide dark:bg-white/5">
              <span>{t("relayops:catalog.columnService")}</span>
              <span>{t("relayops:catalog.columnTier")}</span>
              <span>{t("relayops:catalog.columnHealth")}</span>
              <span>{t("relayops:catalog.columnOwner")}</span>
              <span className="sr-only">{t("relayops:catalog.open")}</span>
            </div>
            {services.data.map((service) => (
              <Link
                key={service.id}
                to="/relayops/$workspaceId/services/$serviceId"
                params={{ workspaceId, serviceId: service.id }}
                className="grid min-h-16 grid-cols-[minmax(16rem,1fr)_8rem_10rem_12rem_2rem] items-center gap-4 border-b px-5 py-3 last:border-b-0 hover:bg-[#e2e9e6]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#245ebe]"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-medium">
                    {service.name}
                    {service.archivedAt ? (
                      <Archive className="size-3.5 text-muted-foreground" />
                    ) : null}
                  </span>
                  <span className="block truncate font-mono text-muted-foreground text-xs">
                    {service.slug}
                  </span>
                </span>
                <span className="text-sm">
                  {t(`relayops:tier.${service.tier}`)}
                </span>
                <Badge variant="outline" className={healthTone[service.health]}>
                  {t(`relayops:health.${service.health}`)}
                </Badge>
                <span className="truncate text-muted-foreground text-sm">
                  {service.ownerTeamName || t("relayops:service.noOwner")}
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </div>

          <div className="grid gap-3 md:hidden">
            {services.data.map((service) => (
              <Link
                key={service.id}
                to="/relayops/$workspaceId/services/$serviceId"
                params={{ workspaceId, serviceId: service.id }}
                className="rounded-lg border border-[#17211f]/10 bg-white p-4 dark:border-white/10 dark:bg-[#101a18]"
              >
                <div className="flex items-start justify-between gap-3">
                  <span>
                    <span className="font-medium">{service.name}</span>
                    <span className="mt-1 block font-mono text-muted-foreground text-xs">
                      {service.slug}
                    </span>
                  </span>
                  <Badge
                    variant="outline"
                    className={healthTone[service.health]}
                  >
                    {t(`relayops:health.${service.health}`)}
                  </Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">
                      {t("relayops:service.tier")}
                    </dt>
                    <dd>{t(`relayops:tier.${service.tier}`)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t("relayops:service.ownerTeam")}
                    </dt>
                    <dd>
                      {service.ownerTeamName || t("relayops:service.noOwner")}
                    </dd>
                  </div>
                </dl>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
