import {
  type AppLocale,
  defaultLocale,
  isPublicLocale,
  isSupportedLocale,
  loadLocale,
  type PublicLocale,
  supportedLocales,
} from "@i18n/resources";
import i18n from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";

function getLanguageCode(locale: string) {
  return locale.toLowerCase().split("-")[0];
}

export function resolveLocale(
  preferredLocale?: string | null,
  persistedLocale?: string | null,
): PublicLocale {
  const candidates = [preferredLocale, persistedLocale].filter(
    (value): value is string => Boolean(value),
  );

  for (const candidate of candidates) {
    const normalizedCandidate = candidate.toLowerCase();
    const exactMatch = supportedLocales.find(
      (locale) => locale.toLowerCase() === normalizedCandidate,
    );
    if (exactMatch && isPublicLocale(exactMatch)) return exactMatch;

    const languageMatch = supportedLocales.find(
      (locale) => getLanguageCode(locale) === getLanguageCode(candidate),
    );
    if (languageMatch && isPublicLocale(languageMatch)) return languageMatch;
  }

  return defaultLocale;
}

export function getBrowserLocale(): string | null {
  if (typeof navigator === "undefined") return null;
  return navigator.language || navigator.languages?.[0] || null;
}

export const localeStorageKey = "relayops.locale";

export function getPersistedLocale(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(localeStorageKey);
  return value && isPublicLocale(value) ? value : value ? defaultLocale : null;
}

// Components subscribe to the default namespace only, so any other namespace
// they reference through `t("ns:key")` must be preloaded after init and on
// every locale change. The lazy backend already returns the whole locale JSON,
// so cache it once per locale to avoid a fresh dynamic import per namespace.
const localeResources = new Map<AppLocale, Promise<Record<string, unknown>>>();

function loadLocaleResources(
  locale: AppLocale,
): Promise<Record<string, unknown>> {
  const cached = localeResources.get(locale);
  if (cached) return cached;
  const pending = loadLocale(locale).then(
    (resources) => resources as Record<string, unknown>,
  );
  localeResources.set(locale, pending);
  return pending;
}

export function preloadNamespaces(locale: AppLocale): Promise<void> {
  return loadLocaleResources(locale).then((resources) =>
    i18n.loadNamespaces(Object.keys(resources)),
  );
}

const initialLocale = resolveLocale(null, getPersistedLocale());

void i18n
  .use(
    resourcesToBackend((language: string, namespace: string) => {
      const locale = isSupportedLocale(language) ? language : defaultLocale;
      return loadLocaleResources(locale).then(
        (resources) => resources[namespace],
      );
    }),
  )
  .use(initReactI18next)
  .init({
    lng: initialLocale,
    fallbackLng: defaultLocale,
    defaultNS: "common",
    interpolation: {
      escapeValue: false,
    },
  })
  .then(() => preloadNamespaces(initialLocale));

export { i18n };
