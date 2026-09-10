import type { PublicLocale } from "@i18n/resources";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { authClient } from "@/lib/auth-client";
import {
  getPersistedLocale,
  localeStorageKey,
  resolveLocale,
} from "@/lib/i18n";

export function useLocale() {
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();

  const locale = useMemo(
    () => resolveLocale(i18n.resolvedLanguage, getPersistedLocale()),
    [i18n.resolvedLanguage],
  );

  const setLocale = async (nextLocale: PublicLocale) => {
    const resolved = resolveLocale(nextLocale, null);
    window.localStorage.setItem(localeStorageKey, resolved);
    document.documentElement.lang = resolved;
    await i18n.changeLanguage(resolved);

    const { error } = await authClient.updateUser({ locale: resolved });
    if (!error) {
      await queryClient.invalidateQueries({ queryKey: ["session"] });
    }
  };

  return {
    locale,
    setLocale,
  };
}
