import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Check, Sparkles, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  useCreateCheckout,
  useOpenBillingPortal,
} from "@/hooks/mutations/billing/use-billing-actions";
import { useGetBilling } from "@/hooks/queries/billing/use-get-billing";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/workspace/billing",
)({
  component: RouteComponent,
});

type Interval = "monthly" | "annual";
type PlanKey = "personal" | "team";

const STATUS_VARIANTS: Record<
  string,
  "success" | "warning" | "error" | "secondary"
> = {
  active: "success",
  trialing: "success",
  past_due: "warning",
  scheduled_cancel: "warning",
  canceled: "error",
  expired: "error",
  paused: "secondary",
};

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function daysUntil(value: string | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="space-y-1">
      <h2 className="font-medium text-md">{title}</h2>
      <p className="text-muted-foreground text-xs">{subtitle}</p>
    </div>
  );
}

function RouteComponent() {
  const { t, i18n } = useTranslation();
  const { workspace, isAdmin } = useWorkspacePermission();
  const workspaceId = workspace?.id;
  const canManage = isAdmin;

  const { data: billing, isLoading } = useGetBilling(workspaceId);
  const checkout = useCreateCheckout(workspaceId);
  const portal = useOpenBillingPortal(workspaceId);
  const [interval, setInterval] = useState<Interval>("annual");
  const plans: Array<{
    plan: PlanKey;
    name: string;
    tagline: string;
    monthly: { price: string; suffix: string; note: string };
    annual: { price: string; suffix: string; note: string };
    features: string[];
    highlighted?: boolean;
  }> = [
    {
      plan: "personal",
      name: t("billing:plans.personal.name"),
      tagline: t("billing:plans.personal.tagline"),
      monthly: {
        price: "$4",
        suffix: t("billing:prices.perMonth"),
        note: t("billing:prices.billedMonthly"),
      },
      annual: {
        price: "$40",
        suffix: t("billing:prices.perYear"),
        note: t("billing:prices.personalAnnualNote"),
      },
      features: [
        t("billing:features.singleUser"),
        t("billing:features.unlimitedWork"),
        t("billing:features.backups"),
        t("billing:features.emailSupport"),
      ],
    },
    {
      plan: "team",
      name: t("billing:plans.team.name"),
      tagline: t("billing:plans.team.tagline"),
      monthly: {
        price: "$5",
        suffix: t("billing:prices.perUserMonth"),
        note: t("billing:prices.billedMonthly"),
      },
      annual: {
        price: "$50",
        suffix: t("billing:prices.perUserYear"),
        note: t("billing:prices.teamAnnualNote"),
      },
      features: [
        t("billing:features.unlimitedMembers"),
        t("billing:features.unlimitedWork"),
        t("billing:features.roles"),
        t("billing:features.backups"),
        t("billing:features.prioritySupport"),
      ],
      highlighted: true,
    },
  ];

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!billing?.billingEnabled) {
    return (
      <>
        <PageTitle title={t("billing:title")} />
        <div className="mx-auto max-w-4xl space-y-2">
          <h1 className="font-semibold text-2xl">{t("billing:title")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("billing:disabled")}
          </p>
        </div>
      </>
    );
  }

  const hasSubscription = Boolean(billing.plan && billing.status);
  const statusVariant = billing.status ? STATUS_VARIANTS[billing.status] : null;
  const renews = formatDate(billing.currentPeriodEnd, i18n.language);
  const trialDaysLeft = daysUntil(billing.trialEndsAt);
  const trialExpired =
    !billing.foundingFree && !hasSubscription && trialDaysLeft === 0;

  const pricePer = t(
    billing.billingInterval === "annual"
      ? "billing:prices.year"
      : "billing:prices.month",
  );
  const planLabel =
    billing.plan === "team"
      ? t("billing:plans.team.name")
      : billing.plan === "personal"
        ? t("billing:plans.personal.name")
        : null;

  return (
    <>
      <PageTitle title={t("billing:title")} />
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2">
          <h1 className="font-semibold text-2xl">{t("billing:title")}</h1>
          <p className="text-muted-foreground">{t("billing:description")}</p>
        </div>

        {/* ── Current plan ── */}
        <div className="space-y-6">
          <SectionHeader
            title={t("billing:currentPlan")}
            subtitle={t("billing:currentPlanSubtitle")}
          />

          {billing.foundingFree ? (
            <div className="overflow-hidden rounded-md border border-primary/30 bg-sidebar">
              <div className="flex items-start gap-3 p-5">
                <div className="mt-0.5 flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Sparkles className="size-4.5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-sm">
                      {t("billing:foundingFree")}
                    </h3>
                    <Badge variant="success" size="sm">
                      {t("billing:free")}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {t("billing:foundingDescription")}
                  </p>
                </div>
              </div>
            </div>
          ) : hasSubscription ? (
            <div className="rounded-md border border-border bg-sidebar">
              <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-sm">
                      RelayOps Cloud {planLabel}
                    </h3>
                    {billing.status && statusVariant ? (
                      <Badge variant={statusVariant} size="sm">
                        {t(`billing:status.${billing.status}`)}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {billing.plan === "team"
                      ? t("billing:currentTeamPrice", {
                          price: billing.billingInterval === "annual" ? 50 : 5,
                          period: pricePer,
                        })
                      : t("billing:currentPersonalPrice", {
                          price: billing.billingInterval === "annual" ? 40 : 4,
                          period: pricePer,
                        })}
                    {billing.seats > 1
                      ? ` · ${t("billing:seats", { count: billing.seats })}`
                      : null}
                  </p>
                </div>
                <div className="text-right">
                  {renews ? (
                    <p className="text-muted-foreground text-xs">
                      {billing.canceledAt
                        ? t("billing:accessEnds")
                        : t("billing:renews")}
                    </p>
                  ) : null}
                  {renews ? (
                    <p className="font-medium text-sm">{renews}</p>
                  ) : null}
                </div>
              </div>
              <Separator />
              <div className="flex flex-col items-start gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground text-xs">
                  {t("billing:manageDescription")}
                </p>
                {billing.hasCustomer ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canManage || portal.isPending}
                    onClick={() => portal.mutate()}
                  >
                    {portal.isPending
                      ? t("billing:opening")
                      : t("billing:manage")}
                    <ArrowUpRight className="size-4" />
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "rounded-md border bg-sidebar p-5",
                trialExpired ? "border-warning/40" : "border-border",
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "mt-0.5 flex size-9 items-center justify-center rounded-md",
                    trialExpired
                      ? "bg-warning/10 text-warning-foreground"
                      : "bg-primary/10 text-primary",
                  )}
                >
                  {trialExpired ? (
                    <TriangleAlert className="size-4.5" />
                  ) : (
                    <Sparkles className="size-4.5" />
                  )}
                </div>
                <div className="space-y-1">
                  <h3 className="font-medium text-sm">
                    {trialExpired
                      ? t("billing:trialEnded")
                      : t("billing:freeTrial")}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {trialExpired
                      ? t("billing:trialEndedDescription")
                      : trialDaysLeft !== null
                        ? t("billing:trialDays", { count: trialDaysLeft })
                        : t("billing:chooseAfterTrial")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Plan picker ── */}
        {!billing.foundingFree && !hasSubscription ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <SectionHeader
                title={t("billing:choosePlan")}
                subtitle={t("billing:choosePlanSubtitle")}
              />
              <div className="inline-flex items-center gap-2">
                <div className="inline-flex rounded-md border border-border bg-sidebar p-0.5 text-xs">
                  {(["monthly", "annual"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setInterval(value)}
                      className={cn(
                        "rounded-[0.3rem] px-3 py-1 font-medium capitalize transition-colors",
                        interval === value
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t(`billing:${value}`)}
                    </button>
                  ))}
                </div>
                {interval === "annual" ? (
                  <Badge variant="success" size="sm">
                    {t("billing:monthsFree")}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card/70 p-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {plans.map((p) => {
                  const price = interval === "monthly" ? p.monthly : p.annual;
                  return (
                    <div
                      key={p.plan}
                      className={cn(
                        "flex flex-col rounded-xl border p-6",
                        p.highlighted
                          ? "border-primary/40 bg-card shadow-[0_0_40px_-12px] shadow-primary/20"
                          : "border-border/70 bg-card",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-sm">{p.name}</h3>
                        {p.highlighted ? (
                          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-medium text-primary text-xs">
                            {t("billing:mostPopular")}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-foreground/60 text-sm">
                        {p.tagline}
                      </p>

                      <div className="mt-6 flex items-baseline gap-1.5">
                        <span className="font-medium text-4xl tracking-tight">
                          {price.price}
                        </span>
                        <span className="text-foreground/60 text-sm">
                          {price.suffix}
                        </span>
                      </div>
                      <p className="mt-1.5 text-foreground/60 text-sm">
                        {price.note}
                      </p>

                      <ul className="mt-8 flex-1 space-y-3 text-sm">
                        {p.features.map((feature) => (
                          <li
                            key={feature}
                            className="flex items-start gap-2.5"
                          >
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <span className="text-foreground/90">
                              {feature}
                            </span>
                          </li>
                        ))}
                      </ul>

                      <Button
                        variant={p.highlighted ? "default" : "outline"}
                        className="mt-8 w-full"
                        disabled={!canManage || checkout.isPending}
                        onClick={() =>
                          checkout.mutate({ plan: p.plan, interval })
                        }
                      >
                        {checkout.isPending
                          ? t("billing:starting")
                          : t("billing:chooseNamedPlan", { name: p.name })}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-muted-foreground text-xs">
              {canManage ? t("billing:processor") : t("billing:ownersOnly")}
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}
