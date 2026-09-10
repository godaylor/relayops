import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";

const axeSource = readFileSync(
  resolve(
    import.meta.dirname,
    "../../apps/web/node_modules/axe-core/axe.min.js",
  ),
  "utf8",
);

async function expectAxeClean(page: Page, scope: Locator) {
  await page.addScriptTag({ content: axeSource });
  const element = await scope.elementHandle();
  if (!element) throw new Error("Axe scope was not rendered");
  const violations = await page.evaluate(async (root) => {
    const axe = (
      window as typeof window & {
        axe: { run: (node: Element) => Promise<{ violations: unknown[] }> };
      }
    ).axe;
    return (await axe.run(root)).violations;
  }, element);
  expect(violations).toEqual([]);
}

async function openDemoIncident(page: Page) {
  const suffix = `s5-s8-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  await page.goto("/auth/sign-up");
  await page.getByLabel("Full Name").fill("RelayOps S5-S8 Admin");
  await page.getByLabel("Email").fill(`${suffix}@example.test`);
  await page.locator('input[name="password"]').fill("RelayOps-password-123!");
  await page.getByRole("button", { name: "Create Account" }).click();
  await page.getByLabel("Workspace Name").fill(`RelayOps ${suffix}`);
  await page.getByRole("button", { name: "Create RelayOps workspace" }).click();
  await page.getByLabel("Service name").fill("Checkout API");
  await page.getByLabel("Service slug").fill(`checkout-${suffix}`);
  await page.getByRole("button", { name: "Create first service" }).click();
  await page.getByRole("button", { name: "Create demo incident" }).click();
  await expect(page).toHaveURL(/\/relayops\/[^/]+\/incidents\/[^/?]+/);

  const match = page.url().match(/\/relayops\/([^/]+)\/incidents\/([^/?]+)/);
  if (!match) throw new Error("Incident deep link did not contain identifiers");
  return { workspaceId: match[1]!, incidentId: match[2]! };
}

test("Response Board, two-browser realtime, presence, and signal intake stay accessible", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const { workspaceId, incidentId } = await openDemoIncident(page);
  const incidentUrl = `/relayops/${workspaceId}/incidents/${incidentId}`;

  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Signals" })).toBeVisible();
  await expect(
    page.getByText("In this Incident Room", { exact: true }),
  ).toBeVisible();

  const storageState = await page.context().storageState();
  const secondContext = await browser.newContext({ storageState });
  const secondPage = await secondContext.newPage();
  await secondPage.goto(incidentUrl);
  await expect(secondPage.getByText("Live", { exact: true })).toBeVisible();

  const latencies: number[] = [];
  for (let index = 1; index <= 3; index += 1) {
    const message = `Realtime evidence ${index}`;
    await page.getByLabel("Durable incident update").fill(message);
    const startedAt = Date.now();
    await page.getByRole("button", { name: "Publish update" }).click();
    await expect(secondPage.getByText(message, { exact: true })).toBeVisible({
      timeout: 5_000,
    });
    latencies.push(Date.now() - startedAt);
  }
  const sorted = [...latencies].sort((left, right) => left - right);
  const p95 =
    sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
  expect(p95).toBeLessThanOrEqual(750);

  await secondContext.setOffline(true);
  await expect(secondPage.getByText("Offline", { exact: true })).toBeVisible();
  await secondContext.setOffline(false);
  await expect(secondPage.getByText("Live", { exact: true })).toBeVisible({
    timeout: 5_000,
  });

  await page.getByLabel("Signal title").fill("Manual checkout saturation");
  await page
    .getByRole("combobox", { name: "Service", exact: true })
    .selectOption({ label: "Checkout API" });
  await page.getByLabel("Severity hint").selectOption("sev2");
  await page.getByRole("button", { name: "Create signal" }).click();
  await expect(
    page.getByText("Manual checkout saturation", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Attach to incident" }).click();
  await expect(page.getByText("Attached", { exact: true })).toBeVisible();

  const signalPanel = page
    .getByRole("heading", { name: "Signals" })
    .locator("xpath=ancestor::section[1]");
  await expectAxeClean(page, signalPanel);

  await page.goto(`/relayops/${workspaceId}/board`);
  await expect(
    page.getByRole("heading", { name: "Response Board" }),
  ).toBeVisible();
  for (const lane of [
    "Detected",
    "Triaging",
    "Mitigating",
    "Monitoring",
    "Resolved",
    "Dismissed",
  ]) {
    await expect(page.getByRole("region", { name: lane })).toBeVisible();
  }

  const moveMenu = page.getByRole("button", {
    name: "Move Checkout latency above error budget to another lifecycle state",
  });
  await moveMenu.focus();
  await page.keyboard.press("Enter");
  const triaging = page.getByRole("menuitem", { name: "Triaging" });
  await expect(triaging).toBeVisible();
  await triaging.press("Enter");
  await expect(
    page
      .getByRole("region", { name: "Triaging" })
      .getByText("Checkout latency above error budget", { exact: true }),
  ).toBeVisible();

  await expectAxeClean(
    page,
    page.locator('section[aria-labelledby="response-board-title"]'),
  );
  await secondContext.close();
});
