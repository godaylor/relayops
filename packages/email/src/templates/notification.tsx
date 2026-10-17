import { Link, Section, Text } from "@react-email/components";
import React from "react";
import { resolveEmailLocale } from "./resolve-locale";
import { EmailShell, styles } from "./shell";

void React;

export type NotificationEmailProps = {
  title: string;
  message: string;
  actionUrl?: string | null;
  actionLabel?: string;
  locale?: string | null;
};

const messages = {
  en: {
    preview: "You have a new Сборитм notification",
    subtitle: "A notification matched your delivery preferences.",
    footer: "Сборитм notification",
    actionLabel: "Open in Сборитм",
  },
  de: {
    preview: "Du hast eine neue Сборитм-Benachrichtigung",
    subtitle:
      "Eine Benachrichtigung entspricht deinen Zustellungs-Einstellungen.",
    footer: "Сборитм-Benachrichtigung",
    actionLabel: "In Сборитм oeffnen",
  },
  vi: {
    preview: "Bạn có thông báo mới từ Сборитм",
    subtitle: "Một thông báo khớp với tùy chọn nhận thông báo của bạn.",
    footer: "Thông báo Сборитм",
    actionLabel: "Mở trong Сборитм",
  },
  ja: {
    preview: "Сборитм の新しい通知",
    subtitle: "配信設定に一致する通知がありました。",
    footer: "Сборитм 通知",
    actionLabel: "Сборитм で開く",
  },
} as const;

const NotificationEmail = ({
  title,
  message,
  actionUrl,
  actionLabel,
  locale,
}: NotificationEmailProps) => {
  const copy = messages[resolveEmailLocale(locale)];

  return (
    <EmailShell preview={copy.preview} title={title} subtitle={copy.subtitle}>
      <Section>
        <Text style={styles.paragraph}>{message}</Text>
        {actionUrl ? (
          <Link style={styles.button} href={actionUrl}>
            {actionLabel ?? copy.actionLabel}
          </Link>
        ) : null}
        <Section style={styles.divider} />
        <Text style={styles.footer}>{copy.footer}</Text>
      </Section>
    </EmailShell>
  );
};

NotificationEmail.PreviewProps = {
  title: "Task assigned to you",
  message: "You were assigned to Design account notifications.",
  actionUrl: "https://relayops.example",
} as NotificationEmailProps;

export default NotificationEmail;
