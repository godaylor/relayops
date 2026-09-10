import { type FormEvent, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  AttachSignalInput,
  ManualSignalInput,
  SignalPanelLabels,
  SignalPanelService,
  SignalPanelSignal,
  SignalSeverity,
} from "./types";

const severityTone: Record<SignalSeverity, string> = {
  unknown: "border-border bg-muted text-muted-foreground",
  sev1: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  sev2: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  sev3: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  sev4: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

const severityRail: Record<SignalSeverity, string> = {
  unknown: "bg-muted-foreground/40",
  sev1: "bg-red-500",
  sev2: "bg-orange-500",
  sev3: "bg-amber-500",
  sev4: "bg-sky-500",
};

export function SignalPanel({
  labels,
  signals,
  services,
  incidentVersion,
  canCreate,
  canAttach,
  pending = false,
  error,
  formatObservedAt,
  onCreateManual,
  onCreateDemo,
  onAttach,
}: {
  labels: SignalPanelLabels;
  signals: SignalPanelSignal[];
  services: SignalPanelService[];
  incidentVersion?: number;
  canCreate: boolean;
  canAttach: boolean;
  pending?: boolean;
  error?: unknown;
  formatObservedAt: (value: string) => string;
  onCreateManual: (input: ManualSignalInput) => Promise<void>;
  onCreateDemo: () => Promise<void>;
  onAttach: (input: AttachSignalInput) => Promise<void>;
}) {
  const panelId = useId();
  const selectClass =
    "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  async function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const serviceId = String(form.get("serviceId") ?? "").trim();
    const summary = String(form.get("summary") ?? "").trim();
    await onCreateManual({
      idempotencyKey: globalThis.crypto.randomUUID(),
      serviceId: serviceId || undefined,
      title: String(form.get("title") ?? "").trim(),
      summary: summary || undefined,
      severityHint: String(form.get("severityHint")) as SignalSeverity,
    });
    formElement.reset();
  }

  return (
    <section
      aria-labelledby={`${panelId}-title`}
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <header className="border-border border-b px-5 py-4">
        <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
          {labels.intakeEyebrow}
        </p>
        <h2 id={`${panelId}-title`} className="mt-1 font-semibold text-lg">
          {labels.title}
        </h2>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
          {labels.description}
        </p>
      </header>

      <div className="grid lg:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.28fr)]">
        <form
          aria-labelledby={`${panelId}-manual`}
          className="space-y-4 border-border border-b bg-muted/20 p-5 lg:border-r lg:border-b-0"
          onSubmit={submitManual}
        >
          <h3 id={`${panelId}-manual`} className="font-medium text-sm">
            {labels.manualHeading}
          </h3>
          <label
            className="block space-y-1.5 text-sm"
            htmlFor={`${panelId}-signal-title`}
          >
            <span>{labels.titleField}</span>
            <Input
              id={`${panelId}-signal-title`}
              name="title"
              required
              maxLength={200}
              disabled={!canCreate || pending}
            />
          </label>
          <label
            className="block space-y-1.5 text-sm"
            htmlFor={`${panelId}-signal-summary`}
          >
            <span>{labels.summaryField}</span>
            <Textarea
              id={`${panelId}-signal-summary`}
              name="summary"
              maxLength={2000}
              disabled={!canCreate || pending}
              className="min-h-20 resize-y"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <label
              className="block space-y-1.5 text-sm"
              htmlFor={`${panelId}-signal-service`}
            >
              <span>{labels.serviceField}</span>
              <select
                id={`${panelId}-signal-service`}
                name="serviceId"
                className={selectClass}
                disabled={!canCreate || pending}
              >
                <option value="">{labels.noService}</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="block space-y-1.5 text-sm"
              htmlFor={`${panelId}-signal-severity`}
            >
              <span>{labels.severityField}</span>
              <select
                id={`${panelId}-signal-severity`}
                name="severityHint"
                className={selectClass}
                defaultValue="unknown"
                disabled={!canCreate || pending}
              >
                {(Object.keys(labels.severity) as SignalSeverity[]).map(
                  (severity) => (
                    <option key={severity} value={severity}>
                      {labels.severity[severity]}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!canCreate || pending}>
              {pending ? labels.pending : labels.createManual}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canCreate || pending}
              onClick={() => void onCreateDemo()}
            >
              {labels.createDemo}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {labels.error}
            </p>
          ) : null}
        </form>

        <div className="min-w-0 p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="font-medium text-sm">{labels.queueHeading}</h3>
            <span className="font-mono text-muted-foreground text-xs tabular-nums">
              {signals.length.toString().padStart(2, "0")}
            </span>
          </div>
          {signals.length === 0 ? (
            <p className="rounded-lg border border-border border-dashed px-4 py-8 text-center text-muted-foreground text-sm">
              {labels.empty}
            </p>
          ) : (
            <ol className="space-y-2">
              {signals.map((signal) => (
                <li
                  key={signal.id}
                  className="relative overflow-hidden rounded-lg border border-border bg-background pl-4"
                >
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 left-0 w-1 ${severityRail[signal.severityHint]}`}
                  />
                  <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${severityTone[signal.severityHint]}`}
                        >
                          {labels.severity[signal.severityHint]}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {labels.source}: {signal.source}
                        </span>
                      </div>
                      <p className="mt-2 truncate font-medium text-sm">
                        {signal.title}
                      </p>
                      {signal.summary ? (
                        <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                          {signal.summary}
                        </p>
                      ) : null}
                      <p className="mt-2 font-mono text-[11px] text-muted-foreground tabular-nums">
                        {labels.observedAt}:{" "}
                        {formatObservedAt(signal.observedAt)}
                      </p>
                    </div>
                    {signal.ingestionStatus === "attached" ? (
                      <span className="shrink-0 text-muted-foreground text-xs">
                        {labels.attached}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!canAttach || pending || !incidentVersion}
                        onClick={() => {
                          if (!incidentVersion) return;
                          void onAttach({
                            signalId: signal.id,
                            expectedVersion: incidentVersion,
                            idempotencyKey: globalThis.crypto.randomUUID(),
                          });
                        }}
                      >
                        {labels.attach}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p aria-live="polite" className="sr-only">
            {pending ? labels.pending : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
