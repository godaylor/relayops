import { expect, type Page, test } from "@playwright/test";

test.use({
  channel: "chrome",
  locale: "en-US",
  viewport: { width: 1440, height: 960 },
});

test.beforeEach(async ({ page, baseURL }) => {
  if (
    !baseURL ||
    !["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname)
  ) {
    throw new Error("An isolated localhost instance is required");
  }
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    localStorage.setItem("relayops.locale", "en-US");
  });
});

async function openEntry(page: Page) {
  await page.goto("/auth/sign-in");
  await expect(page.getByTestId("guest-demo-entry")).toBeVisible({
    timeout: 20_000,
  });
}

async function openGuestWorkspace(page: Page) {
  await openEntry(page);
  await page.getByTestId("guest-demo-entry").click();
  await expect(page).toHaveURL(/\/relayops\/[^/?]+\/?$/, { timeout: 30_000 });
  await expect(page.locator("#relayops-main h1")).toBeVisible();
  await expect(page.locator(".sbor-sidebar .sbor-navigation a")).toHaveCount(
    6,
    {
      timeout: 20_000,
    },
  );
}

// Observe rendered frames during a real interaction; no simulated app events or
// injected route state. This catches a visible flash and an unwanted route replay.
function sampleMainSurface(page: Page, durationMs = 1_000) {
  return page.evaluate(async (duration) => {
    const end = performance.now() + duration;
    let minimumOpacity = 1;
    let missingFrames = 0;
    let movedFrames = 0;
    while (performance.now() < end) {
      const main = document.getElementById("relayops-main");
      if (!main) {
        missingFrames++;
      } else {
        const style = getComputedStyle(main);
        minimumOpacity = Math.min(minimumOpacity, Number(style.opacity));
        if (style.transform !== "none") {
          const matrix = new DOMMatrixReadOnly(style.transform);
          if (Math.abs(matrix.m41) > 0.1 || Math.abs(matrix.m42) > 0.1) {
            movedFrames++;
          }
        }
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
    return { minimumOpacity, missingFrames, movedFrames };
  }, durationMs);
}

test("the entry story can pause, switch steps and resume without losing its controls", async ({
  page,
}) => {
  await openEntry(page);
  const scene = page.locator(".sbor-auth-hero .signal-scene");
  const activeCard = scene.locator('.signal-story-card[aria-hidden="false"]');
  await scene
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await expect(
    scene.getByRole("button", { name: "Resume animation" }),
  ).toBeVisible();
  const pausedText = await activeCard.locator("strong").innerText();
  // Deliberately exceed one real 3.6-second story interval to prove it is paused.
  await page.waitForTimeout(3_900);
  await expect(activeCard.locator("strong")).toHaveText(pausedText);

  const actionStep = scene.getByRole("button", {
    name: "The team moves forward",
    exact: true,
  });
  await actionStep.click();
  await expect(activeCard.locator("strong")).toHaveText(
    "The team moves forward",
  );
  await expect(activeCard).toHaveCSS("opacity", "1");
  await expect(actionStep).toBeFocused();
  await expect(actionStep).toHaveAttribute("aria-pressed", "true");

  await scene.getByRole("button", { name: "Resume animation" }).click();
  await expect(activeCard.locator("strong")).toHaveText(
    "Service restored. Context preserved.",
    { timeout: 6_000 },
  );
  await expect(
    scene.getByRole("button", { name: "Pause animation" }),
  ).toBeVisible();
});

test("reduced motion stops decorative playback while keeping manual story controls usable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openEntry(page);
  const scene = page.locator(".sbor-auth-hero .signal-scene");
  const activeCard = scene.locator('.signal-story-card[aria-hidden="false"]');
  const firstStory = await activeCard.locator("strong").innerText();
  await expect(scene.locator(".signal-motion-toggle")).toHaveCount(0);
  await expect(scene.locator(".signal-art-depth")).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.waitForTimeout(3_900);
  await expect(activeCard.locator("strong")).toHaveText(firstStory);

  const ownerStep = scene.getByRole("button", {
    name: "Someone takes the lead",
    exact: true,
  });
  await ownerStep.focus();
  const renderedMovement = page.evaluate(async () => {
    const end = performance.now() + 600;
    let movingFrames = 0;
    while (performance.now() < end) {
      const card = document.querySelector(
        '.signal-story-card[aria-hidden="false"]',
      );
      if (card) {
        const transform = getComputedStyle(card).transform;
        // Browsers serialize an unchanged transform as either none or an
        // identity matrix; neither should be mistaken for actual movement.
        if (
          transform !== "none" &&
          !new DOMMatrixReadOnly(transform).isIdentity
        ) {
          movingFrames++;
        }
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
    return movingFrames;
  });
  await page.keyboard.press("Enter");
  await expect(activeCard.locator("strong")).toHaveText(
    "Someone takes the lead",
  );
  expect(await renderedMovement).toBe(0);
  await expect(ownerStep).toBeFocused();
});

test("pointer navigation preserves the main surface and never fades its content away", async ({
  page,
}) => {
  await openGuestWorkspace(page);
  const originalMain = await page.locator("#relayops-main").elementHandle();
  if (!originalMain) throw new Error("Missing workspace main surface");
  const frames = sampleMainSurface(page, 2_000);
  const servicesLink = page
    .locator(".sbor-sidebar")
    .getByRole("link", { name: "Services", exact: true });
  await servicesLink.click();
  await expect(
    page.getByRole("heading", { name: "Operational services" }),
  ).toBeVisible();
  expect(await originalMain.evaluate((element) => element.isConnected)).toBe(
    true,
  );
  await expect(servicesLink).toBeFocused();
  const observed = await frames;
  expect(observed.missingFrames).toBe(0);
  expect(observed.minimumOpacity).toBe(1);

  await page
    .locator(".sbor-sidebar")
    .getByRole("link", { name: "Response board", exact: true })
    .click();
  await expect(page).toHaveURL(/\/board(?:\?|$)/);
  await expect(page.locator("#relayops-main h1")).toBeVisible();
  expect(await originalMain.evaluate((element) => element.isConnected)).toBe(
    true,
  );
});

test("keyboard navigation is immediate and preserves the focused navigation link", async ({
  page,
}) => {
  await openGuestWorkspace(page);
  const originalMain = await page.locator("#relayops-main").elementHandle();
  if (!originalMain) throw new Error("Missing workspace main surface");
  const servicesLink = page
    .locator(".sbor-sidebar")
    .getByRole("link", { name: "Services", exact: true });
  await servicesLink.focus();
  const frames = sampleMainSurface(page);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Operational services" }),
  ).toBeVisible();
  await expect(servicesLink).toBeFocused();
  expect(await originalMain.evaluate((element) => element.isConnected)).toBe(
    true,
  );
  const observed = await frames;
  expect(observed).toEqual({
    minimumOpacity: 1,
    missingFrames: 0,
    movedFrames: 0,
  });
});

test("service filters update the URL and results without replaying page motion", async ({
  page,
}) => {
  await openGuestWorkspace(page);
  await page
    .locator(".sbor-sidebar")
    .getByRole("link", { name: "Services", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Operational services" }),
  ).toBeVisible();
  const main = page.locator("#relayops-main");
  await expect
    .poll(() =>
      main.evaluate(
        (element) =>
          element.getAnimations().filter((item) => item.playState === "running")
            .length,
      ),
    )
    .toBe(0);
  const originalMain = await main.elementHandle();
  if (!originalMain) throw new Error("Missing workspace main surface");
  await page
    .getByRole("textbox", { name: "Search services" })
    .fill("no-such-service-polish");
  const frames = sampleMainSurface(page);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(/q=no-such-service-polish/);
  await expect(
    page.getByRole("heading", { name: "No services match these filters" }),
  ).toBeVisible();
  expect(await originalMain.evaluate((element) => element.isConnected)).toBe(
    true,
  );
  expect(await frames).toEqual({
    minimumOpacity: 1,
    missingFrames: 0,
    movedFrames: 0,
  });
});

test("applying a service filter preserves keyboard focus and an unsaved service draft", async ({
  page,
}) => {
  await openGuestWorkspace(page);
  await page
    .locator(".sbor-sidebar")
    .getByRole("link", { name: "Services", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Operational services" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New service", exact: true }).click();
  const draft = page
    .locator("#create-service-panel")
    .getByRole("textbox", { name: "Service name", exact: true });
  await draft.fill("A service draft kept while filtering");
  const search = page.getByRole("textbox", { name: "Search services" });
  await search.fill("Payment");
  const response = page.waitForResponse((item) => {
    const url = new URL(item.url());
    return (
      item.request().method() === "GET" &&
      url.pathname.endsWith("/services") &&
      url.searchParams.get("q") === "Payment"
    );
  });
  await search.press("Enter");
  await (await response).finished();
  await expect(page).toHaveURL(/q=Payment/);
  // Wait until the successful server response has painted before asserting focus.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("Payment");
  await expect(draft).toHaveValue("A service draft kept while filtering");
});

test("mobile navigation closes after a selection and when returning to desktop", async ({
  page,
}) => {
  await openGuestWorkspace(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole("button", {
    name: "Primary navigation",
    exact: true,
  });
  await trigger.click();
  const drawer = page.locator(".sbor-mobile-sidebar");
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "Services", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Operational services" }),
  ).toBeVisible();
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(drawer).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(drawer).not.toBeVisible();
  await page
    .locator(".sbor-sidebar")
    .getByRole("link", { name: "Overview", exact: true })
    .click();
  await expect(page.locator(".sbor-overview")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
});
