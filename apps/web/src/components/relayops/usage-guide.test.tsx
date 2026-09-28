import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";
import { UsageGuide } from "./usage-guide";

afterEach(cleanup);
beforeAll(async () => {
  await i18n.changeLanguage("en-US");
  await i18n.loadNamespaces("relayops");
});
it("starts only on request, tolerates a missing target, and restores focus on Escape", () => {
  render(
    <I18nextProvider i18n={i18n}>
      <div role="dialog" aria-label="Notification">
        Saved
      </div>
      <UsageGuide />
    </I18nextProvider>,
  );
  expect(screen.queryByText("Step 1 of 6")).not.toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "How to use" });
  fireEvent.click(trigger);
  expect(
    screen.getByRole("heading", { name: "1. Choose a service" }),
  ).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Show this control" }));
  expect(screen.getByRole("status")).toHaveTextContent("not on this page");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Step 2 of 6")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(trigger).toHaveFocus();
  expect(screen.queryByText("Step 1 of 6")).not.toBeInTheDocument();
  fireEvent.click(trigger);
  for (let n = 0; n < 5; n++)
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  expect(trigger).toHaveFocus();
});
