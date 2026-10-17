import { expect, test } from "@playwright/test";

test("a fresh browser opens its own saved guest demo from a foreign workspace link", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  if (!baseURL?.startsWith("http://127.0.0.1:")) {
    throw new Error("Local isolated environment required");
  }
  const owner = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const guest = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 960 },
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [{ name: "relayops.locale", value: "en-US" }],
        },
      ],
    },
  });
  try {
    const suffix = Date.now();
    expect(
      (
        await owner.request.post("/api/auth/sign-up/email", {
          data: {
            name: "Demo link owner",
            email: `demo-link-owner-${suffix}@example.test`,
            password: "RelayOps-password-123!",
          },
        })
      ).ok(),
    ).toBeTruthy();
    const created = await owner.request.post("/api/auth/organization/create", {
      data: { name: "Demo link source", slug: `demo-link-source-${suffix}` },
    });
    expect(created.ok()).toBeTruthy();
    const foreign = await created.json();
    expect(
      (
        await owner.request.post(
          `/api/relayops/workspaces/${foreign.id}/activate`,
        )
      ).ok(),
    ).toBeTruthy();

    const page = await guest.newPage();
    await page.goto(`/relayops/${foreign.id}/board`);
    await expect(page).toHaveURL(/auth\/sign-in/);
    await page.getByTestId("guest-demo-entry").click();
    await expect(page).toHaveURL(/\/relayops\/[^/?]+\/?$/, { timeout: 30_000 });
    const ownId = page.url().match(/\/relayops\/([^/?]+)/)?.[1];
    expect(ownId).toBeTruthy();
    expect(ownId).not.toBe(foreign.id);
    const session = await (
      await guest.request.get("/api/auth/get-session")
    ).json();
    expect(session.user.isAnonymous).toBe(true);
    expect(
      (
        await guest.request.get(`/api/relayops/workspaces/${foreign.id}`)
      ).status(),
    ).toBe(403);

    const workspaceList = await (
      await guest.request.get("/api/auth/organization/list")
    ).json();
    expect(workspaceList).toHaveLength(1);
    expect(workspaceList[0].id).toBe(ownId);
    const incidents = await (
      await guest.request.get(`/api/relayops/workspaces/${ownId}/incidents`)
    ).json();
    expect(incidents.items).toHaveLength(1);
    const savedDemo = await (
      await guest.request.get(
        `/api/relayops/workspaces/${ownId}/incidents/${incidents.items[0].id}`,
      )
    ).json();
    expect(savedDemo.incident.isDemo).toBe(true);
    await page.reload();
    await expect(
      page
        .locator("#relayops-main")
        .getByText("Checkout latency above error budget", { exact: true })
        .first(),
    ).toBeVisible();
    for (const name of [
      "Issues",
      "Response board",
      "Services",
      "Analytics",
      "Team and access",
    ]) {
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    }
    await page.screenshot({
      path: ".local/browser/guest-after-desktop.png",
      fullPage: true,
    });

    // Revisiting entry in the same browser resumes its saved workspace.
    await page.goto("/auth/sign-in");
    await expect(page).toHaveURL(new RegExp(`/relayops/${ownId}/?$`));
    expect(
      await (await guest.request.get("/api/auth/organization/list")).json(),
    ).toHaveLength(1);
    expect(
      (
        await (
          await guest.request.get(`/api/relayops/workspaces/${ownId}/incidents`)
        ).json()
      ).items,
    ).toHaveLength(1);

    await page.goto(`/relayops/${foreign.id}/board`);
    await expect(
      page.getByRole("heading", { name: "Access denied" }),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/browser/guest-after-access-recovery.png",
      fullPage: true,
    });
    await page.getByRole("link", { name: "Open my workspace" }).click();
    await expect(page).toHaveURL(new RegExp(`/relayops/${ownId}/?$`));

    await page.goto(`/relayops/${foreign.id}/board`);
    await page
      .getByRole("button", { name: "Sign in with another account" })
      .click();
    await expect(page).toHaveURL(/auth\/sign-in\?redirect=/);
    expect(
      await (await guest.request.get("/api/auth/get-session")).json(),
    ).toBeNull();
    await page
      .getByLabel("Email", { exact: true })
      .fill(`demo-link-owner-${suffix}@example.test`);
    await page.locator('input[name="password"]').fill("RelayOps-password-123!");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/relayops/${foreign.id}/board$`));
    expect(
      (
        await guest.request.get(`/api/relayops/workspaces/${foreign.id}`)
      ).status(),
    ).toBe(200);
    expect(
      (await guest.request.get(`/api/relayops/workspaces/${ownId}`)).status(),
    ).toBe(403);
  } finally {
    await guest.close();
    await owner.close();
  }
});

test("Russian mobile guest entry saves a localized, clearly marked sample", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(60_000);
  if (!baseURL?.startsWith("http://127.0.0.1:")) {
    throw new Error("Local isolated environment required");
  }
  const guest = await browser.newContext({
    baseURL,
    locale: "ru-RU",
    viewport: { width: 390, height: 844 },
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [{ name: "relayops.locale", value: "ru-RU" }],
        },
      ],
    },
  });
  try {
    const page = await guest.newPage();
    await page.goto("/auth/sign-in");
    const quickEntry = page.getByTestId("guest-quick-entry");
    await expect(quickEntry).toBeVisible();
    const position = await quickEntry.boundingBox();
    if (!position)
      throw new Error("Mobile guest entry must have a visible target");
    expect(position.y + position.height).toBeLessThanOrEqual(650);
    await quickEntry.click();
    await expect(page).toHaveURL(/\/relayops\/[^/?]+\/?$/, { timeout: 30_000 });
    const workspaceId = page.url().match(/\/relayops\/([^/?]+)/)?.[1];
    const incidents = await (
      await guest.request.get(
        `/api/relayops/workspaces/${workspaceId}/incidents`,
      )
    ).json();
    expect(incidents.items).toHaveLength(1);
    const savedDemo = await (
      await guest.request.get(
        `/api/relayops/workspaces/${workspaceId}/incidents/${incidents.items[0].id}`,
      )
    ).json();
    expect(savedDemo.incident).toMatchObject({
      title: "Оплата картой проходит с задержкой",
      isDemo: true,
    });
    await expect(
      page
        .locator("#relayops-main")
        .getByText("Оплата картой проходит с задержкой", { exact: true })
        .first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await expect(page.locator('[data-slot="toast-title"]')).toHaveCount(0, {
      timeout: 8000,
    });
    await page.screenshot({
      path: ".local/browser/guest-after-mobile-ru.png",
      fullPage: true,
    });
  } finally {
    await guest.close();
  }
});

test("guest setup retries a failed demo request without duplicating saved records", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(60_000);
  if (!baseURL?.startsWith("http://127.0.0.1:")) {
    throw new Error("Local isolated environment required");
  }
  let failDemo = true;
  await page.route("**/api/relayops/workspaces/*/demo-data", async (route) => {
    if (failDemo && route.request().method() === "POST") {
      failDemo = false;
      await route.fulfill({ status: 500, body: "Simulated demo setup outage" });
      return;
    }
    await route.continue();
  });
  await page.goto("/auth/sign-in");
  const failedDemo = page.waitForResponse(
    (response) =>
      response.url().endsWith("/demo-data") && response.status() === 500,
  );
  await page.getByTestId("guest-demo-entry").click();
  await failedDemo;
  await expect(page.getByTestId("guest-demo-entry")).toBeEnabled();
  await expect(page).toHaveURL(/auth\/sign-in/);
  const originalSession = await (
    await context.request.get("/api/auth/get-session")
  ).json();
  const originalWorkspaces = await (
    await context.request.get("/api/auth/organization/list")
  ).json();
  expect(originalWorkspaces).toHaveLength(1);

  await page.getByTestId("guest-demo-entry").click();
  await expect(page).toHaveURL(
    new RegExp(`/relayops/${originalWorkspaces[0].id}/?$`),
  );
  const session = await (
    await context.request.get("/api/auth/get-session")
  ).json();
  expect(session.user.id).toBe(originalSession.user.id);
  expect(
    await (await context.request.get("/api/auth/organization/list")).json(),
  ).toHaveLength(1);
  const root = `/api/relayops/workspaces/${originalWorkspaces[0].id}`;
  expect(
    await (await context.request.get(`${root}/services`)).json(),
  ).toHaveLength(1);
  expect(
    (await (await context.request.get(`${root}/incidents`)).json()).items,
  ).toHaveLength(1);
});
