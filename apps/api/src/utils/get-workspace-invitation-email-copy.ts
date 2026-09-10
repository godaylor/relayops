import enUS from "../../../../i18n/en-US.json";
import ruRU from "../../../../i18n/ru-RU.json";

const messages = {
  en: enUS.invitations.email,
  ru: ruRU.invitations.email,
} as const;

export function getWorkspaceInvitationEmailCopy(locale?: string | null) {
  const normalizedLocale = locale?.toLowerCase();

  if (normalizedLocale?.startsWith("en")) return messages.en;

  return messages.ru;
}
