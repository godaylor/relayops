import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandWordmark } from "@/components/relayops/brand";
import { SignalScene } from "@/components/relayops/signal-scene";
import { ThemeToggleDropdown } from "@/components/theme-toggle-dropdown";
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
  guestAction?: React.ReactNode;
};

export function AuthLayout({
  children,
  title,
  subtitle,
  guestAction,
}: AuthLayoutProps) {
  const { t } = useTranslation();
  return (
    <div className="relay-auth sbor-auth">
      <header className="sbor-auth-header">
        <a href="/" aria-label={t("relayops:brand.name")}>
          <BrandWordmark />
        </a>
        <span className="sbor-auth-category">
          {t("relayops:brand.category")}
        </span>
        <div className="sbor-auth-preferences">
          <ThemeToggleDropdown />
          <RelayOpsLanguageSwitcher />
        </div>
      </header>
      <main className="sbor-auth-grid">
        <section
          className={`sbor-auth-hero${guestAction ? " has-quick-entry" : ""}`}
          aria-labelledby="product-purpose"
        >
          <SignalScene />
          <div className="sbor-auth-headline">
            <p className="sbor-eyebrow">
              <span className="signal-dot" />
              {t("relayops:brand.promise")}
            </p>
            <h1 id="product-purpose">{t("relayops:brand.heroTitle")}</h1>
            <p className="sbor-auth-description">
              {t("relayops:brand.heroDescription")}
            </p>
            {guestAction ? (
              <div className="sbor-hero-entry">{guestAction}</div>
            ) : null}
          </div>
          <a className="sbor-auth-discover" href="#entry">
            <span>{t("relayops:brand.tryProduct")}</span>
            <ArrowUpRight size={18} />
          </a>
        </section>
        <section
          id="entry"
          className="relay-auth-entry sbor-auth-entry"
          aria-label={title}
        >
          <div className="sbor-entry-intro">
            <span className="sbor-eyebrow">
              {t("relayops:brand.entryEyebrow")}
            </span>
            <ShieldCheck size={20} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="sbor-entry-title">{title}</CardTitle>
              {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
            </CardHeader>
            <CardContent>{children}</CardContent>
          </Card>
          <p className="sbor-entry-note">{t("relayops:brand.accessNote")}</p>
          <details className="sbor-hosting-note">
            <summary>{t("relayops:redesign.connectionHelp")}</summary>
            <p>{t("relayops:intro.cold")}</p>
          </details>
        </section>
      </main>
      <footer className="sbor-auth-footer">
        <span>{t("relayops:shell.provenance")}</span>
        <span>{t("relayops:brand.builtForTeams")}</span>
      </footer>
    </div>
  );
}
