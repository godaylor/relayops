import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type Browser,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";

const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:32041";
const axeSource = readFileSync(
  resolve(
    import.meta.dirname,
    "../../apps/web/node_modules/axe-core/axe.min.js",
  ),
  "utf8",
);

async function expectShellWithinViewport(page: Page) {
  const selectors = [
    "[data-relayops-shell]",
    ".sbor-topbar",
    "#relayops-main",
    "#relayops-main h1",
    ".sbor-footer",
  ];
  for (const selector of selectors) {
    const block = page.locator(selector);
    await expect(block).toBeVisible();
    const bounds = await block.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        viewport: window.innerWidth,
      };
    });
    expect(bounds.left, selector + " left edge").toBeGreaterThanOrEqual(-1);
    expect(bounds.right, selector + " right edge").toBeLessThanOrEqual(
      bounds.viewport + 1,
    );
    expect(bounds.width, selector + " width").toBeGreaterThan(0);
  }
  const shell = page.locator("[data-relayops-shell]");
  expect(
    await shell.evaluate((node) => node.scrollWidth - node.clientWidth),
    "shell content overflow",
  ).toBeLessThanOrEqual(1);
}

async function expectNoSeriousAxeViolations(page: Page, scope: Locator) {
  await page.addScriptTag({ content: axeSource });
  const root = await scope.elementHandle();
  if (!root) throw new Error("Axe scope was not rendered");
  const violations = await page.evaluate(async (node) => {
    const axe = (
      window as typeof window & {
        axe: {
          run: (root: Element) => Promise<{
            violations: Array<{ impact: string | null; id: string }>;
          }>;
        };
      }
    ).axe;
    return (await axe.run(node)).violations.filter(
      ({ impact }) => impact === "serious" || impact === "critical",
    );
  }, root);
  expect(violations).toEqual([]);
}

async function jsonCommand<T>(
  page: Page,
  path: string,
  init?: { method?: string; body?: unknown },
) {
  return page.evaluate(
    async ({ apiUrl, requestPath, requestInit }) => {
      const response = await fetch(`${apiUrl}${requestPath}`, {
        credentials: "include",
        method: requestInit?.method ?? "GET",
        headers: requestInit?.body
          ? { "content-type": "application/json" }
          : undefined,
        body: requestInit?.body ? JSON.stringify(requestInit.body) : undefined,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${requestPath} failed: ${response.status} ${text}`);
      }
      return text ? (JSON.parse(text) as T) : (undefined as T);
    },
    { apiUrl: API_URL, requestPath: path, requestInit: init },
  );
}

async function onboardAdmin(page: Page) {
  const suffix = `s10-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  await page.goto("/auth/sign-up");
  await page.getByLabel("Full Name").fill("S10 Operations Admin");
  await page.getByLabel("Email").fill(`${suffix}@example.test`);
  await page.locator('input[name="password"]').fill("RelayOps-password-123!");
  await page.getByRole("button", { name: "Create Account" }).click();
  await page.getByLabel("Workspace Name").fill(`RelayOps ${suffix}`);
  await page.getByRole("button", { name: "Create Сборитм workspace" }).click();
  await page.getByLabel("Service name").fill("Checkout API");
  await page.getByLabel("Service identifier").fill(`checkout-${suffix}`);
  await page.getByRole("button", { name: "Create first service" }).click();

  const workspaceId = page.url().match(/\/relayops\/([^/?]+)/)?.[1];
  if (!workspaceId) throw new Error("Onboarding did not expose a workspace id");
  const services = await jsonCommand<Array<{ id: string }>>(
    page,
    `/api/relayops/workspaces/${workspaceId}/services?status=active`,
  );
  const serviceId = services[0]?.id;
  if (!serviceId) throw new Error("Onboarding service was not returned");

  const signal = await jsonCommand<{ signal: { id: string } }>(
    page,
    `/api/relayops/workspaces/${workspaceId}/signals/demo`,
    { method: "POST", body: { serviceId } },
  );
  await page.getByRole("button", { name: "Create demo incident" }).click();
  await expect(page).toHaveURL(/\/relayops\/[^/]+\/incidents\/[^/?]+/);
  const incidentId = page.url().match(/\/incidents\/([^/?]+)/)?.[1];
  if (!incidentId) throw new Error("Demo incident id was not returned");

  await expect(
    page.getByText("Checkout latency above SLO", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Attach to incident" }).click();
  await expect(
    page
      .getByRole("region", { name: "Observations", exact: true })
      .getByText("Attached", { exact: true }),
  ).toBeVisible();

  return {
    suffix,
    workspaceId,
    serviceId,
    signalId: signal.signal.id,
    incidentId,
  };
}

async function inviteUser(
  page: Page,
  workspaceId: string,
  email: string,
  role: "incident_commander" | "viewer",
) {
  const payload = await jsonCommand<{
    id?: string;
    invitation?: { id?: string };
    data?: { id?: string };
  }>(page, "/api/auth/organization/invite-member", {
    method: "POST",
    body: { email, role, organizationId: workspaceId },
  });
  const id = payload.id ?? payload.invitation?.id ?? payload.data?.id;
  if (!id)
    throw new Error(
      `Invitation response had no id: ${JSON.stringify(payload)}`,
    );
  return id;
}

async function acceptInvitedUser(
  browser: Browser,
  invitationId: string,
  email: string,
  name: string,
  workspaceId: string,
) {
  const context = await browser.newContext({
    baseURL:
      process.env.PLAYWRIGHT_SECONDARY_BASE_URL ??
      process.env.PLAYWRIGHT_BASE_URL ??
      "http://127.0.0.1:32041",
  });
  await context.addInitScript(() =>
    localStorage.setItem("relayops.locale", "en-US"),
  );
  const page = await context.newPage();
  await page.goto(
    `/auth/sign-up?invitationId=${invitationId}&email=${encodeURIComponent(email)}`,
  );
  await page.getByLabel("Full Name").fill(name);
  await page.locator('input[name="password"]').fill("RelayOps-password-123!");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/invitation/accept/${invitationId}`),
  );
  await page.getByRole("button", { name: "Accept Invitation" }).click();
  await expect(page).toHaveURL(new RegExp(`/relayops/${workspaceId}`));
  const session = await jsonCommand<{ user: { id: string } }>(
    page,
    "/api/auth/get-session",
  );
  return { context, page, userId: session.user.id };
}

async function moveFromBoard(page: Page, title: string, target: string) {
  const move = page.getByRole("button", {
    name: `Change status of ${title}`,
  });
  await expect(move).toBeVisible({ timeout: 10_000 });
  await move.focus();
  await page.keyboard.press("Enter");
  const option = page.getByRole("menuitem", { name: target });
  await expect(option).toBeVisible();
  // Navigate the menu as a keyboard user; opening transfers focus asynchronously.
  await page.keyboard.press("Home");
  for (let step = 0; step < 6; step += 1) {
    if (await option.evaluate((node) => node === document.activeElement)) break;
    await page.keyboard.press("ArrowDown");
  }
  await expect(option).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(option).toBeHidden();
}

async function captureRoomProof(page: Page) {
  const account = page.locator(".sbor-account-menu");
  const setTheme = async (light: boolean) => {
    await account.locator(":scope > summary").click();
    const theme = account.getByRole("switch", { name: "Theme", exact: true });
    if ((await theme.getAttribute("aria-checked")) !== String(light)) {
      await theme.click();
    }
    await account.locator(":scope > summary").click();
    await expect(page.locator("html")).toHaveClass(light ? /light/ : /dark/);
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const light of [true, false]) {
    await setTheme(light);
    const path = resolve(
      `docs/redesign/sbor-room-${light ? "light" : "dark"}.png`,
    );
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
    await test.info().attach(light ? "room-light" : "room-dark", {
      path,
      contentType: "image/png",
    });
  }
  await setTheme(true);
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(
    overflow,
    "Room creates page-level horizontal overflow",
  ).toBeLessThanOrEqual(1);
  const path = resolve("docs/redesign/sbor-room-mobile.png");
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await test.info().attach("room-mobile", { path, contentType: "image/png" });
  await page.locator(".sbor-room-history").scrollIntoViewIfNeeded();
  const historyPath = resolve("docs/redesign/sbor-room-mobile-history.png");
  await page.screenshot({ path: historyPath, animations: "disabled" });
  await test.info().attach("room-mobile-history", {
    path: historyPath,
    contentType: "image/png",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
}

async function createWorkbenchFixture(
  page: Page,
  workspaceId: string,
  serviceId: string,
) {
  await page.evaluate(
    async ({ apiUrl, workspace, service }) => {
      for (let offset = 0; offset < 60; offset += 15) {
        await Promise.all(
          Array.from({ length: 15 }, async (_, index) => {
            const number = offset + index;
            const response = await fetch(
              `${apiUrl}/api/relayops/workspaces/${workspace}/incidents`,
              {
                credentials: "include",
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  serviceId: service,
                  title: `S10 table fixture ${number.toString().padStart(2, "0")}`,
                  severity: "sev4",
                  impact: "none",
                  idempotencyKey: `s10-table-${number}-${crypto.randomUUID()}`,
                }),
              },
            );
            if (!response.ok)
              throw new Error(`Fixture ${number} failed: ${response.status}`);
          }),
        );
      }
    },
    { apiUrl: API_URL, workspace: workspaceId, service: serviceId },
  );
}

test("S10 ten-step clean-DB demo proves two users, keyboard lifecycle, conflict, analytics and Viewer 403", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const { suffix, workspaceId, serviceId, incidentId } =
    await onboardAdmin(page);
  const incidentTitle = "Checkout latency above error budget";

  await page.goto(`/relayops/${workspaceId}`);
  await expect(
    page.getByRole("complementary", { name: "Active now" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("complementary", { name: "Active now" })
      .getByRole("link", { name: new RegExp(incidentTitle) }),
  ).toBeVisible();

  const commanderEmail = `commander-${suffix}@example.test`;
  const commanderInvitation = await inviteUser(
    page,
    workspaceId,
    commanderEmail,
    "incident_commander",
  );
  const commander = await acceptInvitedUser(
    browser,
    commanderInvitation,
    commanderEmail,
    "S10 Incident Commander",
    workspaceId,
  );

  await page.goto(`/relayops/${workspaceId}/incidents/${incidentId}`);
  await page
    .getByLabel("Response coordinator", { exact: true })
    .selectOption(commander.userId);
  await page
    .getByRole("button", { name: "Save coordinator", exact: true })
    .click();
  await expect(page.locator(".sbor-assignment-disclosure")).not.toHaveAttribute(
    "open",
  );
  await expect(
    page.locator(".sbor-assignment-disclosure").locator("summary strong"),
  ).toBeVisible();

  const current = await jsonCommand<{ incident: { version: number } }>(
    page,
    `/api/relayops/workspaces/${workspaceId}/incidents/${incidentId}`,
  );
  await jsonCommand(
    page,
    `/api/relayops/workspaces/${workspaceId}/incidents/${incidentId}/participants`,
    {
      method: "POST",
      body: {
        expectedVersion: current.incident.version,
        idempotencyKey: `s10-assign-${crypto.randomUUID()}`,
        responderIds: [commander.userId],
      },
    },
  );

  await page.goto(`/relayops/${workspaceId}/incidents/${incidentId}`);
  await commander.page.goto(`/relayops/${workspaceId}/incidents/${incidentId}`);
  await expect(
    page.getByText("S10 Incident Commander", { exact: true }).first(),
  ).toBeVisible({ timeout: 10_000 });

  await commander.page.goto(`/relayops/${workspaceId}/board`);
  await moveFromBoard(commander.page, incidentTitle, "Triaging");
  await expect
    .poll(
      async () =>
        (
          await jsonCommand<{ incident: { status: string } }>(
            page,
            `/api/relayops/workspaces/${workspaceId}/incidents/${incidentId}`,
          )
        ).incident.status,
    )
    .toBe("triaging");
  await expect(page.getByText("Triaging", { exact: true }).first()).toBeVisible(
    {
      timeout: 5_000,
    },
  );

  const realtimeLatencies: number[] = [];
  // The clock rail and command panel refetch independently. Wait for the
  // command's authoritative version, not merely the rail's lifecycle label.
  const synchronized = await jsonCommand<{ incident: { version: number } }>(
    page,
    `/api/relayops/workspaces/${workspaceId}/incidents/${incidentId}`,
  );
  await expect(
    page.getByText(
      `Expected incident version ${synchronized.incident.version}`,
      { exact: true },
    ),
  ).toHaveText(`Expected incident version ${synchronized.incident.version}`);
  await commander.page.goto(`/relayops/${workspaceId}/incidents/${incidentId}`);
  await expect(commander.page.locator(".sbor-timeline")).toBeVisible();
  for (let index = 1; index <= 3; index += 1) {
    const message = `S10 realtime proof ${index}`;
    await page.getByLabel("Progress update").fill(message);
    // Record insertion in the receiving browser, rather than the time of the
    // next Playwright assertion poll (which can add up to a second).
    await commander.page.evaluate((expectedMessage) => {
      const receiver = window as Window & { __sborRealtimeReceipt?: number };
      delete receiver.__sborRealtimeReceipt;
      const timeline = document.querySelector(".sbor-timeline");
      if (!timeline) throw new Error("Receiving timeline is missing");
      const observer = new MutationObserver(() => {
        if (!timeline.textContent?.includes(expectedMessage)) return;
        observer.disconnect();
        receiver.__sborRealtimeReceipt = Date.now();
      });
      observer.observe(timeline, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }, message);
    const startedAt = Date.now();
    await page.getByRole("button", { name: "Publish update" }).click();
    await expect(
      commander.page.getByText(message, { exact: true }),
    ).toBeVisible({
      timeout: 5_000,
    });
    await commander.page.waitForFunction(
      () =>
        typeof (window as Window & { __sborRealtimeReceipt?: number })
          .__sborRealtimeReceipt === "number",
    );
    const receivedAt = await commander.page.evaluate(
      () =>
        (window as Window & { __sborRealtimeReceipt: number })
          .__sborRealtimeReceipt,
    );
    realtimeLatencies.push(receivedAt - startedAt);
  }
  const p95 =
    [...realtimeLatencies].sort((a, b) => a - b)[
      Math.ceil(realtimeLatencies.length * 0.95) - 1
    ] ?? Number.POSITIVE_INFINITY;
  console.log(
    `Realtime DOM receipt samples: ${realtimeLatencies.join(", ")} ms; p95=${p95} ms`,
  );
  expect.soft(p95, "Realtime DOM receipt p95").toBeLessThanOrEqual(750);

  await page.getByLabel("Progress update").fill("Draft survives conflict");
  const stale = await jsonCommand<unknown>(
    page,
    `/api/relayops/workspaces/${workspaceId}/incidents/${incidentId}`,
  );
  const incidentPattern = `**/api/relayops/workspaces/${workspaceId}/incidents/${incidentId}`;
  const staleHandler = async (route: import("@playwright/test").Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(stale),
      });
      return;
    }
    await route.continue();
  };
  await page.route(incidentPattern, staleHandler);
  await commander.page.goto(`/relayops/${workspaceId}/incidents/${incidentId}`);
  const commanderUpdate = commander.page.getByLabel("Progress update");
  await expect(commanderUpdate).toBeVisible({ timeout: 10_000 });
  await commanderUpdate.fill("Commander changed the record");
  await commander.page.getByRole("button", { name: "Publish update" }).click();
  await expect(
    commander.page.getByText("Commander changed the record", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish update" }).click();
  await expect(
    page.getByText("Incident changed", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reapply" }).click();
  await expect(
    commander.page.getByText("Draft survives conflict", { exact: true }),
  ).toBeVisible({ timeout: 5_000 });
  await page.unroute(incidentPattern, staleHandler);

  await commander.context.setOffline(true);
  await expect(
    commander.page.getByText("Offline", { exact: true }),
  ).toBeVisible();
  const reconnectStarted = Date.now();
  await commander.context.setOffline(false);
  await expect(commander.page.getByText("Live", { exact: true })).toBeVisible({
    timeout: 5_000,
  });
  expect(Date.now() - reconnectStarted).toBeLessThanOrEqual(5_000);

  await captureRoomProof(commander.page);

  await commander.page.getByRole("button", { name: "Mitigating" }).click();
  await commander.page.getByRole("button", { name: "Monitoring" }).click();
  await commander.page.getByRole("button", { name: "Resolved" }).click();
  await commander.page
    .getByLabel("Resolution summary")
    .fill("Checkout latency returned below the SLO.");
  await commander.page.getByRole("button", { name: "Resolved" }).click();
  await expect(
    commander.page.getByText("Resolved", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    commander.page.locator(".sbor-resolution-summary"),
  ).toContainText("Checkout latency returned below the SLO.");
  await commander.page.screenshot({
    path: resolve("docs/redesign/sbor-room-resolved.png"),
    fullPage: true,
    animations: "disabled",
  });

  const today = new Date().toISOString().slice(0, 10);
  await page.goto(
    `/relayops/${workspaceId}/analytics?from=${today}&to=${today}` +
      `&timezone=UTC&status=resolved&severity=sev2&service=${serviceId}` +
      "&compare=false&includeDemo=true",
  );
  const drilldown = page.getByRole("button", {
    name: new RegExp(`Open ${today} with 1 incidents in Workbench`),
  });
  await expect(drilldown).toBeVisible();
  await drilldown.click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname.endsWith(`/relayops/${workspaceId}/incidents`) &&
      url.searchParams.get("status") === "resolved" &&
      url.searchParams.get("severity") === "sev2" &&
      url.searchParams.get("service") === serviceId,
  );

  const viewerEmail = `viewer-${suffix}@example.test`;
  const viewerInvitation = await inviteUser(
    page,
    workspaceId,
    viewerEmail,
    "viewer",
  );
  const viewer = await acceptInvitedUser(
    browser,
    viewerInvitation,
    viewerEmail,
    "S10 Viewer",
    workspaceId,
  );
  await viewer.page.goto(`/relayops/${workspaceId}/incidents/${incidentId}`);
  await expect(
    viewer.page.getByRole("heading", { name: incidentTitle }),
  ).toBeVisible();
  await expect(
    viewer.page.getByRole("button", { name: "Detected" }),
  ).toHaveCount(0);
  const denial = await viewer.page.evaluate(
    async ({ apiUrl, workspace, incident }) => {
      const detail = (await fetch(
        `${apiUrl}/api/relayops/workspaces/${workspace}/incidents/${incident}`,
        { credentials: "include" },
      ).then((response) => response.json())) as {
        incident: { version: number };
      };
      const transition = await fetch(
        `${apiUrl}/api/relayops/workspaces/${workspace}/incidents/${incident}/transition`,
        {
          credentials: "include",
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedVersion: detail.incident.version,
            idempotencyKey: `s10-viewer-${crypto.randomUUID()}`,
            to: "detected",
          }),
        },
      );
      const analytics = new URL(
        `${apiUrl}/api/relayops/workspaces/${workspace}/analytics/reliability.csv`,
      );
      analytics.searchParams.set("from", new Date().toISOString().slice(0, 10));
      analytics.searchParams.set("to", new Date().toISOString().slice(0, 10));
      analytics.searchParams.set("timezone", "UTC");
      const exportResponse = await fetch(analytics, { credentials: "include" });
      return { transition: transition.status, export: exportResponse.status };
    },
    { apiUrl: API_URL, workspace: workspaceId, incident: incidentId },
  );
  expect(denial).toEqual({ transition: 403, export: 403 });

  await expectNoSeriousAxeViolations(viewer.page, viewer.page.locator("main"));
  await viewer.context.close();
  await commander.context.close();
});

test("S10 responsive, zoom, forced-colors, reduced-motion, focus and table-FPS matrix", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { workspaceId, serviceId } = await onboardAdmin(page);
  await createWorkbenchFixture(page, workspaceId, serviceId);
  await page.goto(`/relayops/${workspaceId}/incidents`);
  await expect(page.getByTestId("workbench-row").first()).toBeVisible();

  const firstRow = page.getByTestId("workbench-row").first();
  await firstRow.focus();
  await firstRow.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Incident inspector" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close inspector" }).click();
  await expect(firstRow).toBeFocused();
  await page.goBack();
  await page.goForward();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Incident Workbench" }),
  ).toBeVisible();

  const fpsSamples = await page
    .getByTestId("workbench-scroll-viewport")
    .evaluate(async (viewport) => {
      const samples: number[] = [];
      for (let sample = 0; sample < 3; sample += 1) {
        let frames = 0;
        const started = performance.now();
        await new Promise<void>((resolveSample) => {
          const frame = (now: number) => {
            frames += 1;
            const progress = Math.min(1, (now - started) / 900);
            viewport.scrollTop =
              progress * (viewport.scrollHeight - viewport.clientHeight);
            if (progress < 1) requestAnimationFrame(frame);
            else resolveSample();
          };
          requestAnimationFrame(frame);
        });
        const seconds = (performance.now() - started) / 1_000;
        samples.push(frames / seconds);
        viewport.scrollTop = 0;
      }
      return samples;
    });
  const medianFps = [...fpsSamples].sort((a, b) => a - b)[1] ?? 0;
  expect(medianFps).toBeGreaterThanOrEqual(55);

  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 834, height: 1112 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    if (viewport.width <= 960) {
      await page.getByRole("button", { name: "Primary navigation" }).click();
      await expect(
        page.getByRole("navigation", { name: "Primary navigation" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      await expect(
        page.getByRole("navigation", { name: "Primary navigation" }),
      ).toBeVisible();
    }
    const rail = page.getByRole("complementary", {
      name: "Active now",
      includeHidden: true,
    });
    if (viewport.width > 960) await expect(rail).toBeVisible();
    else await expect(rail).toBeHidden();
    await expectShellWithinViewport(page);
    await test.info().attach(`relayops-${viewport.name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const zoom of ["200%", "400%"] as const) {
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, zoom);
    await expect(
      page.getByRole("heading", { name: "Incident Workbench" }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(
      overflow,
      `${zoom} text zoom created page-level horizontal overflow`,
    ).toBeLessThanOrEqual(1);
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  const railTransition = await page
    .getByRole("complementary", { name: "Active now" })
    .getByRole("link")
    .first()
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(railTransition).toBe("0s");
  await expectNoSeriousAxeViolations(page, page.locator("main"));
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await firstRow.focus();
  await expect(firstRow).toBeFocused();
  await test.info().attach("relayops-forced-colors", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("390px shell fits all six key screens in RU and EN", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { workspaceId, incidentId } = await onboardAdmin(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const screens = [
    ["overview", ""],
    ["workbench", "/incidents"],
    ["board", "/board"],
    ["room", "/incidents/" + incidentId],
    ["services", "/services"],
    ["analytics", "/analytics"],
  ];
  for (const locale of ["RU", "EN"]) {
    await page.locator(".sbor-account-menu > summary").click();
    await page.getByRole("button", { name: locale, exact: true }).click();
    await page.locator(".sbor-account-menu > summary").click();
    await expect(page.locator("html")).toHaveAttribute(
      "lang",
      locale === "RU" ? "ru-RU" : "en-US",
    );
    for (const [name, path] of screens) {
      await page.goto("/relayops/" + workspaceId + path);
      await expect(page.locator("#relayops-main h1")).toBeVisible();
      await expect(page.locator(".relayops-clock-rail")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      await expectShellWithinViewport(page);
      await page.locator(".sbor-footer").scrollIntoViewIfNeeded();
      await expect(page.locator(".sbor-footer")).toBeInViewport();
      await page.locator(".sbor-app-column").evaluate((node) => {
        node.scrollTop = 0;
      });
      const screenshotPath = test
        .info()
        .outputPath("390-" + locale + "-" + name + ".png");
      await page.screenshot({ path: screenshotPath });
      await test.info().attach("390-" + locale + "-" + name, {
        path: screenshotPath,
        contentType: "image/png",
      });
    }
  }
  expect(errors).toEqual([]);
});
