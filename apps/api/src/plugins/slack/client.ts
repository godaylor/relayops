import * as Sentry from "@sentry/node";
import { safeOutboundFetch } from "../../utils/safe-outbound-fetch";

export type SlackTextObject = {
  type: "mrkdwn" | "plain_text";
  text: string;
};

export type SlackBlock =
  | {
      type: "section";
      text: SlackTextObject;
      fields?: SlackTextObject[];
    }
  | {
      type: "context";
      elements: SlackTextObject[];
    };

export type SlackMessage = {
  text: string;
  blocks?: SlackBlock[];
};

const SLACK_TIMEOUT_MS = 10_000;

export async function postToSlack(
  webhookUrl: string,
  message: SlackMessage,
): Promise<void> {
  Sentry.addBreadcrumb({
    category: "integration",
    level: "info",
    data: { integration: "slack" },
  });
  const response = await safeOutboundFetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
    timeoutMs: SLACK_TIMEOUT_MS,
    maxResponseBytes: 64 * 1024,
    label: "Slack webhook",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Slack webhook request failed (${response.status}): ${errorText}`,
    );
  }
}
