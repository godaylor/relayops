import { type Browser, expect, type Page, test } from "@playwright/test";

type Grants = Record<string, string[]>;

async function openDemoIncident(page: Page) {
  const suffix = `s4-s7-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  await page.goto("/auth/sign-up");
  await page.getByLabel("Full Name").fill("RelayOps Gate Admin");
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

function grantsAllow(grants: Grants, required: Record<string, string[]>) {
  return Object.entries(required).every(([resource, actions]) =>
    actions.every((action) => grants[resource]?.includes(action) === true),
  );
}

function groupSelect(page: Page) {
  return page
    .locator("select")
    .filter({ has: page.locator('option[value="commander"]') });
}

async function openPersonaPage(
  browser: Browser,
  storageState: Awaited<ReturnType<Page["context"]>["storageState"]>,
  url: string,
  grants: Grants,
) {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.route("**/api/auth/organization/has-permission", async (route) => {
    const body = route.request().postDataJSON() as {
      permissions?: Record<string, string[]>;
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: grantsAllow(grants, body.permissions ?? {}),
      }),
    });
  });
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Operational state" }),
  ).toBeVisible();
  return { context, page };
}

test("Workbench URL survives save, refresh, history and a second authorized session", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const { workspaceId } = await openDemoIncident(page);
  await page.goto(`/relayops/${workspaceId}/incidents`);
  await expect(
    page.getByRole("heading", { name: "Incident Workbench" }),
  ).toBeVisible();
  await expect(page.getByTestId("workbench-row").first()).toBeVisible();

  await page
    .getByRole("searchbox", { name: "Search incidents" })
    .fill("Checkout");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe("Checkout");

  await page.locator("#workbench-severity").selectOption(["sev2"]);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("severity"))
    .toContain("sev2");
  await expect(page.locator("#workbench-severity")).toHaveValues(["sev2"]);
  await groupSelect(page).selectOption("severity");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("group"))
    .toBe("severity");
  await expect(groupSelect(page)).toHaveValue("severity");
  await page.getByLabel("Density").selectOption("comfortable");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("density"))
    .toBe("comfortable");
  await expect(page.getByLabel("Density")).toHaveValue("comfortable");

  await page.getByText("Columns", { exact: true }).click();
  await page.getByLabel("Responders", { exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("columns"))
    .not.toContain("responders");
  await expect(
    page.getByLabel("Responders", { exact: true }),
  ).not.toBeChecked();
  await page.getByText("Columns", { exact: true }).click();

  await page.getByLabel("View name").fill("Checkout response");
  await page.getByRole("button", { name: "Save current view" }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("view"))
    .not.toBeNull();
  await expect(page.getByLabel("Saved views").first()).toHaveValue(
    new URL(page.url()).searchParams.get("view")!,
  );

  await page.getByLabel("Density").selectOption("compact");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("density"))
    .toBe("compact");
  await page.goBack();
  await expect(page.getByLabel("Density")).toHaveValue("comfortable");
  await page.goForward();
  await expect(page.getByLabel("Density")).toHaveValue("compact");

  await page.getByTestId("workbench-row").first().click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("incidentId"))
    .not.toBeNull();
  await expect(
    page.getByText("Incident inspector", { exact: true }),
  ).toBeVisible();

  const timelineUrl = new URL(page.url());
  timelineUrl.searchParams.set("tab", "timeline");
  await page.goto(timelineUrl.toString());
  await expect(
    page.getByText("Incident inspector", { exact: true }),
  ).toBeVisible();

  await page.reload();
  // The modal inspector intentionally hides background controls from the AX tree.
  await expect(
    page.getByRole("searchbox", {
      name: "Search incidents",
      includeHidden: true,
    }),
  ).toHaveValue("Checkout");
  await expect(groupSelect(page)).toHaveValue("severity");

  await expect(page.getByLabel("Density")).toHaveValue("compact");
  await expect(
    page.getByText("Incident inspector", { exact: true }),
  ).toBeVisible();

  const sharedUrl = page.url();
  expect(new URL(sharedUrl).searchParams.get("tab")).toBe("timeline");
  const storageState = await page.context().storageState();
  const secondContext = await browser.newContext({ storageState });
  const secondPage = await secondContext.newPage();
  await secondPage.goto(sharedUrl);
  await expect(
    secondPage.getByText("Incident Workbench", { exact: true }),
  ).toBeVisible();
  await expect(
    secondPage.getByRole("searchbox", {
      name: "Search incidents",
      includeHidden: true,
    }),
  ).toHaveValue("Checkout");
  await expect(groupSelect(secondPage)).toHaveValue("severity");
  await expect(secondPage.getByLabel("Density")).toHaveValue("compact");
  await expect(
    secondPage.getByText("Incident inspector", { exact: true }),
  ).toBeVisible();
  await secondPage.getByRole("button", { name: "Close inspector" }).click();
  await secondPage.getByText("Columns", { exact: true }).click();
  await expect(
    secondPage.getByLabel("Responders", { exact: true }),
  ).not.toBeChecked();
  await secondContext.close();
});

test("Viewer, Responder, Commander, Service Owner and Admin discover only allowed incident actions", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await openDemoIncident(page);
  const incidentUrl = page.url();
  const storageState = await page.context().storageState();
  const personas = [
    {
      name: "Viewer",
      grants: { incident: ["read"], incident_timeline: ["read"] },
      transition: false,
      publish: false,
    },
    {
      name: "Responder",
      grants: {
        incident: ["read", "transition"],
        incident_timeline: ["read", "publish"],
      },
      transition: true,
      publish: true,
    },
    {
      name: "Commander",
      grants: {
        incident: ["read", "transition", "resolve", "reopen", "dismiss"],
        incident_timeline: ["read", "publish", "correct"],
      },
      transition: true,
      publish: true,
    },
    {
      name: "Service Owner",
      grants: {
        incident: ["read", "transition_owned"],
        incident_timeline: ["read", "publish"],
      },
      transition: false,
      publish: true,
    },
    {
      name: "Admin",
      grants: {
        incident: ["read", "transition", "resolve", "reopen", "dismiss"],
        incident_timeline: ["read", "publish", "correct"],
      },
      transition: true,
      publish: true,
    },
  ] as const;

  for (const persona of personas) {
    const opened = await openPersonaPage(
      browser,
      storageState,
      incidentUrl,
      persona.grants,
    );
    const transition = opened.page.getByRole("button", { name: "Triaging" });
    const update = opened.page.getByLabel("Durable incident update");
    if (persona.transition)
      await expect(transition, persona.name).toBeVisible();
    else await expect(transition, persona.name).toHaveCount(0);
    if (persona.publish) await expect(update, persona.name).toBeVisible();
    else await expect(update, persona.name).toHaveCount(0);
    await opened.context.close();
  }
});
