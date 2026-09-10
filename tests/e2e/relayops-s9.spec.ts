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
const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:32041";

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

async function onboardWorkspace(page: Page) {
  const suffix = `s9-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  await page.goto("/auth/sign-up");
  await page.getByLabel("Full Name").fill("RelayOps S9 Admin");
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
  const match = page.url().match(/\/relayops\/([^/]+)\/incidents\//);
  const workspaceId = match?.[1];
  if (!workspaceId)
    throw new Error("RelayOps deep link did not contain workspace id");
  const serviceId = await page.evaluate(
    async ({ workspace, apiUrl }) => {
      const response = await fetch(
        `${apiUrl}/api/relayops/workspaces/${workspace}/services?status=active`,
        { credentials: "include" },
      );
      if (!response.ok)
        throw new Error(`Services request failed: ${response.status}`);
      const services = (await response.json()) as Array<{ id: string }>;
      if (!services[0]) throw new Error("Onboarding service was not returned");
      return services[0].id;
    },
    { workspace: workspaceId, apiUrl: API_URL },
  );
  return { workspaceId, serviceId };
}

test("S9 analytics reconciles a second-browser resolution and cross-filters into Workbench", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const { workspaceId, serviceId } = await onboardWorkspace(page);
  const date = new Date().toISOString().slice(0, 10);
  const analyticsUrl =
    `/relayops/${workspaceId}/analytics?from=${date}&to=${date}` +
    `&timezone=UTC&status=resolved&severity=sev2&service=${serviceId}` +
    "&compare=false&includeDemo=false";

  await page.goto(analyticsUrl);
  await expect(
    page.getByRole("heading", {
      name: "Reliability, measured from durable incident facts",
    }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export filtered CSV" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "acknowledged_at - detected_at; missing or negative durations excluded",
    ),
  ).toBeAttached();

  const storageState = await page.context().storageState();
  const secondContext = await browser.newContext({ storageState });
  const secondPage = await secondContext.newPage();
  await secondPage.goto(`/relayops/${workspaceId}/incidents`);
  const created = await secondPage.evaluate(
    async ({ workspace, service, apiUrl }) => {
      const json = async (path: string, body: Record<string, unknown>) => {
        const response = await fetch(`${apiUrl}${path}`, {
          credentials: "include",
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const responseText = await response.text();
        if (!response.ok) {
          throw new Error(`${path} failed: ${response.status} ${responseText}`);
        }
        const payload = JSON.parse(responseText) as {
          incident?: { id: string; version: number };
        };
        if (!payload.incident) {
          throw new Error(`${path} returned no incident aggregate`);
        }
        return payload.incident;
      };
      let incident = await json(
        `/api/relayops/workspaces/${workspace}/incidents`,
        {
          serviceId: service,
          title: "S9 resolved reconciliation",
          summary: "Created in the second browser for analytics evidence",
          severity: "sev2",
          impact: "degraded",
          idempotencyKey: `s9-create-${crypto.randomUUID()}`,
        },
      );
      for (const to of ["triaging", "mitigating", "monitoring", "resolved"]) {
        incident = await json(
          `/api/relayops/workspaces/${workspace}/incidents/${incident.id}/transition`,
          {
            to,
            expectedVersion: incident.version,
            idempotencyKey: `s9-${to}-${crypto.randomUUID()}`,
            ...(to === "resolved"
              ? { resolutionSummary: "Recovered for S9 reconciliation" }
              : {}),
          },
        );
      }
      return incident;
    },
    { workspace: workspaceId, service: serviceId, apiUrl: API_URL },
  );

  const volumeCard = page
    .getByText("Incident volume", { exact: true })
    .locator("xpath=ancestor::article[1]");
  await expect(volumeCard).toContainText("1", { timeout: 10_000 });
  await expect(
    page.getByRole("button", {
      name: new RegExp(`Open ${date} with 1 incidents in Workbench`),
    }),
  ).toBeVisible();
  await expectAxeClean(page, page.locator("main"));

  await page
    .getByRole("button", {
      name: new RegExp(`Open ${date} with 1 incidents in Workbench`),
    })
    .click();
  await expect(page).toHaveURL((url) => {
    const params = url.searchParams;
    return (
      url.pathname.endsWith(`/relayops/${workspaceId}/incidents`) &&
      params.get("from") === date &&
      params.get("to") === date &&
      params.get("status") === "resolved" &&
      params.get("severity") === "sev2" &&
      params.get("service") === serviceId
    );
  });
  const row = page.getByTestId("workbench-row").filter({
    hasText: "S9 resolved reconciliation",
  });
  await expect(row).toBeVisible();
  await row.focus();
  await row.press("Enter");
  await expect(page).toHaveURL(new RegExp(`incidentId=${created.id}`));
  await expect(
    page.getByRole("heading", { name: "Incident inspector" }),
  ).toBeVisible();

  await secondContext.close();
});
