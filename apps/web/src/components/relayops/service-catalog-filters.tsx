import { Search } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ServiceCatalogSearch = {
  q?: string;
  status: "active" | "archived" | "all";
};

export function ServiceCatalogFilters({
  search,
  onApply,
}: {
  search: ServiceCatalogSearch;
  onApply: (search: ServiceCatalogSearch) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(search.q ?? "");
  const [status, setStatus] = useState(search.status);
  const submitted = useRef<ServiceCatalogSearch | null>(null);

  useEffect(() => {
    const ownSubmission = submitted.current;
    submitted.current = null;
    if (
      ownSubmission &&
      ownSubmission.q === search.q &&
      ownSubmission.status === search.status
    ) {
      // An applied URL must not replace the focused input or normalize its
      // visible draft mid-typing. External links/back/reset still synchronize.
      return;
    }
    setQuery(search.q ?? "");
    setStatus(search.status);
  }, [search.q, search.status]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { q: query.trim() || undefined, status };
    // No URL transition occurs when an already-applied query is submitted.
    submitted.current =
      next.q !== search.q || next.status !== search.status ? next : null;
    onApply(next);
  }

  return (
    <search className="sbor-service-search">
      <form
        className="grid gap-3 rounded-lg border border-[#1b1d36]/10 bg-white p-3 dark:border-white/10 dark:bg-[#1a1c35] sm:grid-cols-[minmax(14rem,1fr)_12rem_auto]"
        onSubmit={apply}
      >
        <label className="relative" htmlFor="relayops-service-search">
          <span className="sr-only">{t("relayops:catalog.searchLabel")}</span>
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="relayops-service-search"
            name="q"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("relayops:catalog.searchPlaceholder")}
            className="min-h-11 pl-9"
          />
        </label>
        <label htmlFor="relayops-service-status">
          <span className="sr-only">{t("relayops:catalog.statusLabel")}</span>
          <select
            id="relayops-service-status"
            name="status"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as ServiceCatalogSearch["status"])
            }
            className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6757ec]"
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
  );
}
