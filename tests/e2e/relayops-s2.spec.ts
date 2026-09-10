import { expect, test } from "@playwright/test";

async function createRelayOpsWorkspace(
  page: import("@playwright/test").Page,
  prefix: string,
) {
  const suffix = `${prefix}-${Date.now().toString(36)}`;
  await page.goto("/auth/sign-up");
  await page.getByLabel("Full Name").fill("RelayOps Admin");
  await page.getByLabel("Email").fill(`${suffix}@example.test`);
  await page.locator('input[name="password"]').fill("RelayOps-password-123!");
  await page.getByRole("button", { name: "Create Account" }).click();
  await page.getByLabel("Workspace Name").fill(`RelayOps ${suffix}`);
  await page.getByRole("button", { name: "Create RelayOps workspace" }).click();
  await expect(page).toHaveURL(/\/relayops\/[^/?]+/);
  await expect(
    page.getByRole("heading", { name: "Bring your first service online" }),
  ).toBeVisible();
  return suffix;
}

test("clean onboarding opens Incident Room and removes only marked demo data", async ({
  page,
}) => {
  const suffix = await createRelayOpsWorkspace(page, "s2-first-value");
  const serviceName = `Payments ${suffix}`;
  const primaryNavigation = page.getByRole("navigation", {
    name: "Primary navigation",
  });
  await expect(
    primaryNavigation.getByText("Project", { exact: true }),
  ).not.toBeVisible();
  await expect(
    primaryNavigation.getByText("Task", { exact: true }),
  ).not.toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();

  await page.getByLabel("Service name").fill(serviceName);
  await page
    .getByLabel("Service slug")
    .fill(`payments-${Date.now().toString(36)}`);
  await page.getByLabel("Tier").selectOption("critical");
  await page.getByLabel("Health").selectOption("degraded");
  await page.getByRole("button", { name: "Create first service" }).click();
  await expect(
    page.getByRole("heading", { name: `${serviceName} is ready` }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create demo incident" }).click();

  await expect(page).toHaveURL(/\/relayops\/[^/]+\/incidents\/[^/?]+/);
  await expect(page.getByText("DEMO", { exact: true })).toBeVisible();
  await expect(
    page.getByText("incident.created", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Acknowledge the incident context").check();
  await page.getByLabel("Open the service runbook").check();
  await page.getByLabel("Review the durable timeline").check();
  await expect(page.getByText("Training checklist complete")).toBeVisible();

  await page.getByRole("link", { name: "Back to Operations" }).click();
  await expect(
    page.getByRole("heading", { name: "Current operational state" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove demo data" }).click();
  await page.getByRole("button", { name: "Remove marked data" }).click();
  await expect(page.getByText("Demo data is present")).not.toBeVisible();

  await page.getByRole("link", { name: "Services" }).click();
  await expect(
    page.getByRole("link", { name: new RegExp(serviceName) }),
  ).toBeVisible();
  await page.getByPlaceholder("Search name or slug").fill("no-such-service");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(
    page.getByRole("heading", { name: "No services match these filters" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeVisible();
  await page.getByRole("link", { name: new RegExp(serviceName) }).click();
  await expect(page.getByRole("heading", { name: serviceName })).toBeVisible();
});

test("guided onboarding can skip demo without a second empty state", async ({
  page,
}) => {
  await createRelayOpsWorkspace(page, "s2-optout");
  await page.getByRole("link", { name: "Services" }).click();
  await expect(
    page.getByRole("heading", { name: "No services yet" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Operations", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Bring your first service online" }),
  ).toBeVisible();
  await page.getByLabel("Service name").fill("Catalog API");
  await page
    .getByLabel("Service slug")
    .fill(`catalog-${Date.now().toString(36)}`);
  await page.getByRole("button", { name: "Create first service" }).click();
  await page.getByRole("button", { name: "Skip and open Overview" }).click();
  await expect(
    page.getByRole("heading", { name: "Current operational state" }),
  ).toBeVisible();
  await expect(
    page
      .locator("#operational-insights")
      .getByText("No active incidents", { exact: true }),
  ).toBeVisible();
});

test("denied API state renders a stable access-denied route", async ({
  page,
}) => {
  await createRelayOpsWorkspace(page, "s2-denied");
  const workspaceUrl = page.url();
  await page.route("**/api/relayops/workspaces/*/overview", async (route) => {
    await route.fulfill({ status: 403, body: "Forbidden" });
  });
  await page.goto(workspaceUrl);
  await expect(
    page.getByRole("heading", { name: "Access denied" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try again" }),
  ).not.toBeVisible();
});
