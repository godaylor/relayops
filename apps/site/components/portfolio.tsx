import type en from "../../../i18n/en-US.json";

type Props = { copy: typeof en.portfolio; locale: "ru" | "en" };
const surfaces = [
  "operations",
  "workbench",
  "board",
  "room",
  "services",
  "analytics",
] as const;

export function Portfolio({ copy, locale }: Props) {
  const basePath = process.env.NEXT_PUBLIC_RELAYOPS_BASE_PATH || "";
  const withBasePath = (path: string) => `${basePath}${path}`;
  const appUrl =
    process.env.NEXT_PUBLIC_RELAYOPS_APP_URL ||
    (process.env.NODE_ENV === "development"
      ? "http://127.0.0.1:32000"
      : undefined);
  return (
    <div className="portfolio" lang={locale}>
      <header className="portfolio-header">
        <a
          href={withBasePath(locale === "ru" ? "/" : "/en/")}
          className="portfolio-brand"
        >
          <img
            src={withBasePath("/favicon.svg")}
            alt=""
            width="36"
            height="36"
          />{" "}
          RelayOps
        </a>
        <nav aria-label={copy.language}>
          <a
            href={withBasePath("/")}
            hrefLang="ru"
            aria-current={locale === "ru" ? "page" : undefined}
          >
            RU
          </a>
          <a
            href={withBasePath("/en/")}
            hrefLang="en"
            aria-current={locale === "en" ? "page" : undefined}
          >
            EN
          </a>
        </nav>
      </header>
      <main>
        <section className="portfolio-hero">
          <div>
            <p className="portfolio-label">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p className="portfolio-intro">{copy.intro}</p>
            {appUrl ? (
              <a className="portfolio-open" href={appUrl}>
                {copy.open} <span aria-hidden="true">↗</span>
              </a>
            ) : null}
            {!appUrl ? <p className="portfolio-local">{copy.local}</p> : null}
          </div>
          <figure className="portfolio-flow">
            <figcaption>{copy.flow}</figcaption>
            <ol>
              {[copy.service, copy.signal, copy.incident, copy.timeline].map(
                (label, index) => (
                  <li key={label}>
                    <span aria-hidden="true">0{index + 1}</span>
                    <strong>{label}</strong>
                  </li>
                ),
              )}
            </ol>
            <p className="portfolio-stack">
              SERVICE → SIGNAL → INCIDENT → TIMELINE
            </p>
          </figure>
        </section>
        <section className="portfolio-surfaces" aria-labelledby="surfaces">
          <h2 id="surfaces">{copy.views}</h2>
          <div>
            {surfaces.map((key) => (
              <article key={key}>
                <h3>{copy[key]}</h3>
                <p>{copy[`${key}Text`]}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="portfolio-architecture">
          <h2>{copy.architecture}</h2>
          <p>{copy.architectureText}</p>
          <p className="portfolio-stack">
            React · Hono · PostgreSQL · WebSocket
          </p>
        </section>
      </main>
      <footer className="portfolio-footer">
        <p>{copy.provenance}</p>
        <a href={withBasePath("/licenses/THIRD_PARTY_NOTICES")}>
          {copy.licenses}
        </a>
        <a href="https://github.com/usekaneo/kaneo">{copy.upstream}</a>
      </footer>
    </div>
  );
}
