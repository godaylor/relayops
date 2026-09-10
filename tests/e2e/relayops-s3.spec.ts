import { expect, test } from "@playwright/test";

async function openDemoIncident(page: import("@playwright/test").Page) {
  const suffix = `s3-${Date.now().toString(36)}`;
  await page.goto("/auth/sign-up");
  await page.getByLabel("Full Name").fill("RelayOps S3 Admin");
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

test("Incident Room preserves and reapplies a stale durable update draft", async ({
  page,
  request,
}) => {
  const { workspaceId, incidentId } = await openDemoIncident(page);
  await expect(
    page.locator('[data-slot="badge"]').filter({ hasText: "Detected" }),
  ).toBeVisible();
  await expect(
    page.getByText("Degraded service", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Operational state" }),
  ).toBeVisible();
  await expect(
    page.getByText("incident.created", { exact: true }),
  ).toBeVisible();

  const currentResponse = await request.get(
    `${process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:32041"}/api/relayops/workspaces/${workspaceId}/incidents/${incidentId}`,
    {
      headers: {
        cookie: (await page.context().cookies())
          .map((item) => `${item.name}=${item.value}`)
          .join("; "),
      },
    },
  );
  expect(currentResponse.status()).toBe(200);
  const current = await currentResponse.json();

  const inputs: Array<Record<string, unknown>> = [];
  let attempt = 0;
  await page.route(
    "**/api/relayops/workspaces/*/incidents/*/updates",
    async (route) => {
      attempt += 1;
      inputs.push(route.request().postDataJSON());
      if (attempt === 1) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            code: "version_conflict",
            message: "Incident changed",
            current: {
              ...current,
              incident: {
                ...current.incident,
                version: current.incident.version + 1,
              },
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...current,
          incident: {
            ...current.incident,
            version: current.incident.version + 2,
          },
        }),
      });
    },
  );

  const draft = page.getByLabel("Durable incident update");
  await draft.fill("Failover is in progress; customer errors are falling.");
  await page.getByRole("button", { name: "Publish update" }).click();
  await expect(
    page.getByText("Incident changed", { exact: true }),
  ).toBeVisible();
  await expect(draft).toHaveValue(
    "Failover is in progress; customer errors are falling.",
  );

  await page.getByRole("button", { name: "Reapply draft" }).click();
  await expect(draft).toHaveValue("");
  expect(inputs).toHaveLength(2);
  expect(inputs[1]).toMatchObject({
    expectedVersion: current.incident.version + 1,
    idempotencyKey: inputs[0]?.idempotencyKey,
    message: "Failover is in progress; customer errors are falling.",
  });
});
