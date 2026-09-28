import { useTranslation } from "react-i18next";
import { Logo } from "../common/logo";
import { RelayOpsLanguageSwitcher } from "../relayops/language-switcher";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";

type AuthLayoutProps = {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
};

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  const { t } = useTranslation();
  return (
    <div className="h-svh w-full overflow-y-auto bg-background flex flex-col items-center px-4 py-6 sm:py-10">
      <div className="w-full max-w-xl space-y-4 my-auto [overflow-wrap:anywhere]">
        <Logo className="mx-auto flex w-full items-end justify-center" />
        <RelayOpsLanguageSwitcher />
        <section className="space-y-3" aria-labelledby="product-purpose">
          <h1 id="product-purpose" className="font-semibold text-2xl">
            {t("relayops:intro.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("relayops:intro.description")}
          </p>
          <details className="rounded-lg border p-3 text-sm">
            <summary className="min-h-11 cursor-pointer font-medium">
              {t("relayops:intro.example")}
            </summary>
            <p>{t("relayops:intro.exampleBody")}</p>
          </details>
          <p className="text-sm text-muted-foreground">
            {t("relayops:intro.access")}
          </p>
        </section>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{title}</CardTitle>
            {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
          </CardHeader>
          <CardContent className="pt-0">{children}</CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          {t("relayops:intro.cold")}
        </p>
      </div>
    </div>
  );
}
