import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

const steps = [
  {
    title: "relayops:guide.services",
    body: "relayops:guide.servicesBody",
    target: '[data-guide="services"]',
  },
  {
    title: "relayops:guide.create",
    body: "relayops:guide.createBody",
    target: '[data-guide="create"] button',
  },
  {
    title: "relayops:guide.history",
    body: "relayops:guide.historyBody",
    target: '[data-guide="history"]',
  },
  {
    title: "relayops:guide.board",
    body: "relayops:guide.boardBody",
    target: '[data-guide="board"]',
  },
  {
    title: "relayops:guide.finishIssue",
    body: "relayops:guide.finishIssueBody",
    target: "#incident-commands-heading",
  },
  {
    title: "relayops:guide.analytics",
    body: "relayops:guide.analyticsBody",
    target: '[data-guide="analytics"]',
  },
] as const;

// In normal document flow: never masks the target or traps touch/keyboard users.
export function UsageGuide() {
  const { t } = useTranslation();
  const [step, setStep] = useState<number | null>(null);
  const [missing, setMissing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const open = step !== null;
  function close() {
    setStep(null);
    setMissing(false);
    trigger.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      // Notifications can also use role=dialog. Only defer to the dialog
      // that actually owns keyboard focus, not an unrelated toast.
      const focusedDialog =
        event.target instanceof Element
          ? event.target.closest('[role="dialog"], [role="alertdialog"]')
          : null;
      if (event.key === "Escape" && !focusedDialog) {
        event.preventDefault();
        setStep(null);
        trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [open]);
  useEffect(() => {
    if (step !== null) heading.current?.focus();
  }, [step]);
  const current = step === null ? null : steps[step];
  return (
    <section
      className="mx-auto max-w-[92rem] px-4 py-3 sm:px-6"
      aria-label={t("relayops:guide.title")}
    >
      <Button
        ref={trigger}
        variant="outline"
        onClick={() => {
          setStep(0);
          setMissing(false);
        }}
      >
        {t("relayops:guide.open")}
      </Button>
      {current && step !== null ? (
        <div className="mt-3 max-w-2xl space-y-3 rounded-lg border bg-background p-4 [overflow-wrap:anywhere]">
          <p className="text-xs text-muted-foreground">
            {t("relayops:guide.step", {
              current: step + 1,
              total: steps.length,
            })}
          </p>
          <h2
            ref={heading}
            tabIndex={-1}
            className="font-semibold focus-visible:outline-2"
          >
            {t(current.title)}
          </h2>
          <p className="text-sm">{t(current.body)}</p>
          {step === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("relayops:guide.safety")}
            </p>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => {
              const target = document.querySelector<HTMLElement>(
                current.target,
              );
              setMissing(!target);
              if (target) {
                target.scrollIntoView({ block: "center", behavior: "instant" });
                target.focus();
              }
            }}
          >
            {t("relayops:guide.show")}
          </Button>
          {missing ? (
            <p role="status" className="text-sm">
              {t("relayops:guide.missing")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={step === 0}
              onClick={() => {
                setStep(step - 1);
                setMissing(false);
              }}
            >
              {t("relayops:guide.back")}
            </Button>
            <Button
              onClick={() => {
                if (step === steps.length - 1) close();
                else {
                  setStep(step + 1);
                  setMissing(false);
                }
              }}
            >
              {t(
                step === steps.length - 1
                  ? "relayops:guide.finish"
                  : "relayops:guide.next",
              )}
            </Button>
            <Button variant="ghost" onClick={close}>
              {t("relayops:guide.skip")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
