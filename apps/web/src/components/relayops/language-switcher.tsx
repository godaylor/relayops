import { type PublicLocale, publicLocales } from "@i18n/resources";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";

const labels: Record<PublicLocale, string> = {
  "ru-RU": "RU",
  "en-US": "EN",
};

export function RelayOpsLanguageSwitcher() {
  const { t } = useTranslation("settings");
  const { locale, setLocale } = useLocale();

  return (
    <fieldset className="flex min-h-8 items-center rounded-md border bg-white p-0.5 dark:bg-[#101a18]">
      <legend className="sr-only">{t("preferencesPage.language")}</legend>
      {publicLocales.map((candidate) => (
        <Button
          key={candidate}
          type="button"
          size="xs"
          variant={locale === candidate ? "secondary" : "ghost"}
          className="h-7 min-w-9 px-2 font-mono text-[11px]"
          aria-pressed={locale === candidate}
          onClick={() => void setLocale(candidate)}
        >
          {labels[candidate]}
        </Button>
      ))}
    </fieldset>
  );
}
