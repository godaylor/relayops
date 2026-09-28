import { expect, test } from "@playwright/test";

const widths = [
  320, 360, 390, 430, 639, 640, 767, 768, 1023, 1024, 1280, 1440, 1920, 2560,
  3840, 5120, 7680,
];
test("V3 newcomer guide, assignment, saved solution, responsive layouts and sign out", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const suffix = `v3-${Date.now()}`;
  await page.goto("/auth/sign-up");
  await expect(
    page.getByRole("heading", {
      name: "Teamwork on website and IT service outages",
    }),
  ).toBeVisible();
  await page
    .getByText("Training example: payment fails in an online store", {
      exact: true,
    })
    .click();
  await expect(
    page.getByText(/This example does not create any records/),
  ).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/v3-entry-mobile.png",
    fullPage: false,
  });
  await page.getByLabel("Full Name").fill("V3 Training Owner");
  await page.getByLabel("Email").fill(`${suffix}@example.test`);
  await page.locator('input[name="password"]').fill("RelayOps-password-123!");
  await page
    .getByRole("button", { name: "Create Account", exact: true })
    .click();
  await page.getByLabel("Workspace Name").fill(`Training ${suffix}`);
  await page.getByRole("button", { name: "Create RelayOps workspace" }).click();
  await expect(
    page.getByText("Signed in: V3 Training Owner", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "How to use", exact: true }).click();
  await expect(page.getByText("Step 1 of 6")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "2. Record a problem" }),
  ).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "How to use", exact: true }),
  ).toBeFocused();
  await page.getByLabel("Service name").fill("Training checkout");
  await page.getByLabel("Service identifier").fill(suffix);
  await page.getByRole("button", { name: "Create first service" }).click();
  await page
    .locator("#relayops-main")
    .getByRole("button", { name: "Create incident", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const title = "Training: payment fails " + "LongText".repeat(18);
  await dialog.getByLabel("Incident title").fill(title);
  await dialog
    .getByRole("button", { name: "Create incident", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const incidentUrl = page.url();
  const workspaceId = incidentUrl.match(/relayops\/([^/]+)/)![1];
  await page
    .getByLabel("Response coordinator", { exact: true })
    .selectOption({ label: "V3 Training Owner" });
  await page.getByRole("button", { name: "Save coordinator" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved" }),
  ).toBeVisible();
  await context.setOffline(true);
  await page
    .getByLabel("Progress update", { exact: true })
    .fill("Checked the training payment gateway; retrying safely.");
  await page.getByRole("button", { name: "Publish update" }).click();
  await context.setOffline(false);
  await expect(
    page.getByText("Checked the training payment gateway; retrying safely.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel("Progress update", { exact: true })).toHaveValue(
    "",
  );
  await page.getByRole("button", { name: "Triaging", exact: true }).click();
  await page
    .getByLabel("Resolution summary", { exact: true })
    .fill("Training only: payment restored after a configuration correction.");
  await page.getByRole("button", { name: "Resolved", exact: true }).click();
  await page.reload();
  await expect(
    page.getByText(
      "Training only: payment restored after a configuration correction.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Checked the training payment gateway; retrying safely.", {
      exact: true,
    }),
  ).toHaveCount(1);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: "docs/screenshots/v3-incident-desktop.png",
    fullPage: false,
  });
  for (const route of ["", "/incidents", "/board", "/analytics"]) {
    await page.goto(`/relayops/${workspaceId}${route}`);
    await expect(page.locator("#relayops-main h1")).toBeVisible();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page
          .locator("[data-relayops-shell]")
          .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
        `${route} at ${width}`,
      ).toBeTruthy();
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    page.getByRole("heading", {
      name: "How quickly the team handles problems",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/v3-analytics-desktop.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: "RU", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 800 });
  await page
    .getByRole("button", { name: "Как пользоваться", exact: true })
    .click();
  await expect(page.getByText("Шаг 1 из 6")).toBeVisible();
  await page.getByRole("button", { name: "Пропустить", exact: true }).click();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(page).toHaveURL(/auth\/sign-in/);
  const result = await page.request.get(
    `/api/relayops/workspaces/${workspaceId}/incidents`,
  );
  expect(result.status()).toBe(401);
  await page.goto(incidentUrl);
  await expect(page).toHaveURL(/auth\/sign-in/);
  expect(errors).toEqual([]);
});

test("V3 independent accounts enforce membership, viewer restrictions, guest and logout boundaries", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  if (!baseURL?.startsWith("http://127.0.0.1:"))
    throw new Error("Local isolated environment required");
  const owner = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const viewer = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const outsider = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const guest = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const suffix = Date.now();
  try {
    for (const [ctx, name] of [
      [owner, "owner"],
      [viewer, "viewer"],
      [outsider, "outsider"],
    ] as const) {
      const r = await ctx.request.post("/api/auth/sign-up/email", {
        data: {
          name: `Training ${name}`,
          email: `${name}-${suffix}@example.test`,
          password: "RelayOps-password-123!",
        },
      });
      expect(r.ok()).toBeTruthy();
    }
    const create = await owner.request.post("/api/auth/organization/create", {
      data: { name: `Boundary training ${suffix}`, slug: `boundary-${suffix}` },
    });
    expect(create.ok()).toBeTruthy();
    const workspace = await create.json();
    const root = `/api/relayops/workspaces/${workspace.id}`;
    const activation = await owner.request.post(`${root}/activate`);
    expect(activation.ok()).toBeTruthy();
    const service = await owner.request.post(`${root}/services`, {
      data: {
        name: "Training checkout",
        slug: `checkout-${suffix}`,
        tier: "standard",
        health: "operational",
      },
    });
    expect(service.ok()).toBeTruthy();
    const incident = await owner.request.post(`${root}/incidents`, {
      data: {
        serviceId: (await service.json()).id,
        title: "Training boundary problem",
        severity: "sev4",
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(incident.ok()).toBeTruthy();
    const record = await incident.json();
    const path = `${root}/incidents/${record.incident.id}`;
    const invite = await owner.request.post(
      "/api/auth/organization/invite-member",
      {
        data: {
          organizationId: workspace.id,
          email: `viewer-${suffix}@example.test`,
          role: "viewer",
        },
      },
    );
    expect(invite.ok()).toBeTruthy();
    const invitation = await invite.json();
    const accepted = await viewer.request.post(
      "/api/auth/organization/accept-invitation",
      { data: { invitationId: invitation.id } },
    );
    expect(accepted.ok()).toBeTruthy();
    expect((await viewer.request.get(path)).status()).toBe(200);
    expect(
      (
        await viewer.request.post(`${path}/transition`, {
          data: {
            expectedVersion: 1,
            idempotencyKey: crypto.randomUUID(),
            to: "triaging",
          },
        })
      ).status(),
    ).toBe(403);
    expect((await outsider.request.get(path)).status()).toBe(403);
    const outsiderSession = await (
      await outsider.request.get("/api/auth/get-session")
    ).json();
    expect(outsiderSession.user.role).not.toBe("admin");
    const anonymous = await guest.request.post("/api/auth/sign-in/anonymous", {
      data: {},
    });
    expect(anonymous.ok()).toBeTruthy();
    const guestSession = await (
      await guest.request.get("/api/auth/get-session")
    ).json();
    expect(guestSession.user.isAnonymous).toBe(true);
    expect(guestSession.user.role).not.toBe("admin");
    expect((await guest.request.get(path)).status()).toBe(403);
    expect(
      (await viewer.request.post("/api/auth/sign-out", { data: {} })).ok(),
    ).toBeTruthy();
    expect((await viewer.request.get(path)).status()).toBe(401);
  } finally {
    for (const ctx of [owner, viewer, outsider, guest]) await ctx.close();
  }
});
