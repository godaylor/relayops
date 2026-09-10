import { useTranslation } from "react-i18next";

export function KaneoBranding() {
  const { t } = useTranslation();

  return (
    <span className="text-muted-foreground">
      {t("publicProject:branding.poweredBy")}{" "}
      <span className="font-medium">{t("common:appName")}</span>
    </span>
  );
}
