import { useTranslation } from "react-i18next";

export function DemoAlert() {
  const { t } = useTranslation("relayops");
  return (
    <div className="sticky top-0 left-0 right-0 flex flex-col border-warning/30 border-b bg-warning/10 px-4 py-3 text-center">
      <div className="flex flex-col items-center justify-center gap-2 text-sm text-warning-foreground sm:flex-row">
        <p className="flex flex-col sm:flex-row items-center gap-2">
          {t("onboarding.demoSafety")}
        </p>
      </div>
    </div>
  );
}
