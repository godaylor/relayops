import { AlertTriangle, LockKeyhole, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { RelayOpsApiError } from "@/fetchers/relayops";

const SKELETON_ROW_KEYS = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
];

export function RelayOpsSkeleton({ rows = 4 }: { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div
      className="animate-pulse space-y-3"
      role="status"
      aria-label={t("relayops:states.loading")}
    >
      <div className="h-8 w-56 rounded bg-[#dfe6e3] dark:bg-white/10" />
      {SKELETON_ROW_KEYS.slice(0, rows).map((key) => (
        <div
          key={key}
          className="h-16 rounded-md border border-[#17211f]/8 bg-white/70 dark:border-white/10 dark:bg-white/5"
        />
      ))}
    </div>
  );
}

export function RelayOpsErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const status = error instanceof RelayOpsApiError ? error.status : 0;
  const denied = status === 401 || status === 403;
  const retryable = status === 0 || status >= 500;

  if (denied) {
    return (
      <section
        className="grid min-h-72 place-items-center rounded-md border bg-white p-8 text-center dark:bg-[#101a18]"
        aria-labelledby="relayops-denied-title"
      >
        <div className="max-w-md">
          <LockKeyhole className="mx-auto mb-4 size-8 text-[#245ebe] dark:text-[#8fb6ff]" />
          <h1 id="relayops-denied-title" className="font-semibold text-xl">
            {t("relayops:states.deniedTitle")}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            {t("relayops:states.deniedDescription")}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="grid min-h-72 place-items-center rounded-md border bg-white p-8 text-center dark:bg-[#101a18]"
      aria-labelledby="relayops-error-title"
    >
      <div className="max-w-md">
        <AlertTriangle className="mx-auto mb-4 size-8 text-[#b9651b]" />
        <h1 id="relayops-error-title" className="font-semibold text-xl">
          {retryable
            ? t("relayops:states.retryableTitle")
            : t("relayops:states.unrecoverableTitle")}
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">
          {retryable
            ? t("relayops:states.retryableDescription")
            : t("relayops:states.unrecoverableDescription", {
                status: status || "unknown",
              })}
        </p>
        {retryable && (
          <Button className="mt-5" variant="outline" onClick={onRetry}>
            <RotateCw className="size-4" />
            {t("relayops:states.retry")}
          </Button>
        )}
      </div>
    </section>
  );
}
