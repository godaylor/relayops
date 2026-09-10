import { expect, test } from "@playwright/test";

test("Create an ordinary incident and retry a lost response without duplicates", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const suffix = `create-${Date.now()}`;
  await page.goto("/auth/sign-up");
  await page.getByLabel("Full Name").fill("Incident responder");
  await page.getByLabel("Email").fill(`${suffix}@example.test`);
  await page.locator('input[name="password"]').fill("RelayOps-password-123!");
  await page.getByRole("button", { name: "Create Account" }).click();
  await page.getByLabel("Workspace Name").fill(suffix);
  await page.getByRole("button", { name: "Create RelayOps workspace" }).click();
  await page.getByLabel("Service name").fill("Payments API");
  await page.getByLabel("Service slug").fill(suffix);
  await page.getByRole("button", { name: "Create first service" }).click();
  await page
    .locator("#relayops-main")
    .getByRole("button", { name: "Create incident", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Primary service")).not.toHaveValue("");
  await dialog
    .getByLabel("Incident title")
    .fill("Payment authorizations are timing out");
  await dialog.getByLabel("Severity").selectOption("sev2");
  await dialog
    .getByLabel("Summary (optional)")
    .fill("Investigating elevated latency in the payment gateway.");
  await page.screenshot({ path: ".local/browser/create-incident-form.png" });
  const commands: Array<{ idempotencyKey: string }> = [];
  await page.route("**/api/relayops/workspaces/*/incidents", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    commands.push(route.request().postDataJSON());
    if (commands.length === 1) {
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      await route.abort("failed");
    } else await route.continue();
  });
  await dialog
    .getByRole("button", { name: "Create incident", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Incident title")).toHaveValue(
    "Payment authorizations are timing out",
  );
  await dialog
    .getByRole("button", { name: "Create incident", exact: true })
    .click();
  await expect(page).toHaveURL(/\/incidents\/[^/?]+/);
  expect(commands).toHaveLength(2);
  expect(commands[0]?.idempotencyKey).toBe(commands[1]?.idempotencyKey);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Payment authorizations are timing out",
    }),
  ).toBeVisible();
  await expect(page.getByText("incident.created", { exact: true })).toHaveCount(
    1,
  );
  await page.screenshot({
    path: ".local/browser/created-incident.png",
    fullPage: true,
  });
  const workspaceId = page.url().match(/\/relayops\/([^/]+)/)?.[1];
  await page.goto(`/relayops/${workspaceId}/incidents`);
  await expect(
    page
      .locator("#relayops-main")
      .getByText("Payment authorizations are timing out", { exact: true }),
  ).toHaveCount(1);
});
