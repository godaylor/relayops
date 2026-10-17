import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";

test.use({ channel: "chrome" });

const output = "docs/redesign-v2";
const screenshots = `${output}/screenshots`;
const axePackage = readdirSync("node_modules/.pnpm").find((name) =>
  name.startsWith("axe-core@"),
);
if (!axePackage) throw new Error("The installed axe-core package is required");
const axePath = resolve(
  "node_modules/.pnpm",
  axePackage,
  "node_modules/axe-core/axe.min.js",
);
type AxeViolation = {
  id: string;
  impact: string;
  description: string;
  nodes: { target: string[]; failureSummary: string }[];
};
type AxeWindow = Window & {
  axe: {
    run: (
      context: Document,
      options: object,
    ) => Promise<{ violations: AxeViolation[] }>;
  };
};

test("Sboritm final visual matrix, real motion, responsive states and navigation", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(300_000);
  if (!baseURL?.startsWith("http://127.0.0.1:"))
    throw new Error("An isolated local environment is required");
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: This standalone Playwright troubleshooting phase does not use Turbo caching.
  const phase = process.env.SBORITM_VISUAL_PHASE;
  const tailOnly = ["tail", "motion", "controls"].includes(phase ?? "");
  const motionOnly = ["motion", "controls"].includes(phase ?? "");
  const controlsOnly = phase === "controls";
  const resume = phase === "resume";
  mkdirSync(screenshots, { recursive: true });
  const report = {
    date: new Date().toISOString(),
    status: "incomplete",
    completedAt: "",
    failure: null as string | null,
    baseURL,
    screenshots: [] as string[],
    errors: [] as string[],
    overflow: [] as object[],
    accessibility: [] as object[],
    issues: [] as string[],
    motion: {} as Record<string, unknown>,
    interactions: {} as Record<string, unknown>,
    workspaceId: "",
    emptyWorkspaceId: "",
    demoVerified: false,
  };
  if (tailOnly || resume) {
    const previous = JSON.parse(
      readFileSync(`${output}/visual-checks.json`, "utf8"),
    );
    report.screenshots = previous.screenshots;
    report.accessibility = previous.accessibility;
    report.overflow = previous.overflow;
    report.interactions = previous.interactions;
    report.motion = previous.motion;
    report.emptyWorkspaceId = previous.emptyWorkspaceId;
  }
  const contexts: BrowserContext[] = [];
  const context = await browser.newContext({
    baseURL,
    locale: "ru-RU",
    bypassCSP: true,
    viewport: { width: 1440, height: 960 },
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
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  async function settle(target: Page) {
    await target.evaluate(() => document.fonts.ready);
    await expect(target.locator('[data-slot="toast-title"]')).toHaveCount(0, {
      timeout: 8_000,
    });
    await target.waitForTimeout(350);
  }
  async function capture(target: Page, name: string) {
    if (resume && report.screenshots.includes(`${name}.png`)) return;
    await settle(target);
    await target.screenshot({
      path: `${screenshots}/${name}.png`,
      fullPage: true,
    });
    report.screenshots.push(`${name}.png`);
  }
  async function audit(target: Page, name: string) {
    if (
      resume &&
      report.accessibility.some(
        (item) => (item as { name: string }).name === name,
      )
    )
      return;
    await target.addScriptTag({ path: axePath });
    const violations = await target.evaluate(async () => {
      const { axe } = window as AxeWindow;
      return (
        await axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
          },
        })
      ).violations
        .filter((violation) =>
          ["serious", "critical"].includes(violation.impact),
        )
        .map(({ id, impact, description, nodes }) => ({
          id,
          impact,
          description,
          nodes: nodes.map(({ target: selectors, failureSummary }) => ({
            target: selectors,
            failureSummary,
          })),
        }));
    });
    report.accessibility.push({ name, seriousCritical: violations });
    if (violations.length)
      report.issues.push(
        `${name}: ${violations.length} serious/critical axe rule(s)`,
      );
  }
  async function theme(value: "light" | "dark") {
    await page.evaluate((next) => {
      const preferences = JSON.parse(
        localStorage.getItem("user-preferences") ?? '{"state":{},"version":0}',
      );
      preferences.state.theme = next;
      localStorage.setItem("user-preferences", JSON.stringify(preferences));
    }, value);
  }
  async function assertOverflow(target: Page, name: string, width: number) {
    const extra = await target.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    );
    report.overflow.push({ name, width, extra });
    if (extra > 1)
      report.issues.push(
        `${name} at ${width}: ${extra}px horizontal document overflow`,
      );
  }
  try {
    await page.goto("/auth/sign-in");
    await expect(page.getByTestId("guest-demo-entry")).toBeVisible();
    if (!tailOnly)
      for (const color of ["light", "dark"] as const) {
        await theme(color);
        await page.reload();
        for (const width of [1440, 390]) {
          await page.setViewportSize({
            width,
            height: width === 390 ? 844 : 960,
          });
          await capture(page, `auth-${color}-${width}`);
          await assertOverflow(page, `auth-${color}`, width);
        }
        await page.setViewportSize({ width: 1440, height: 960 });
        await audit(page, `auth-${color}`);
      }
    if (!tailOnly)
      for (const width of [320, 768]) {
        await page.setViewportSize({ width, height: 900 });
        await assertOverflow(page, "auth", width);
      }
    await theme("light");
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.reload();
    await page.getByTestId("guest-demo-entry").click();
    await expect(page).toHaveURL(/\/relayops\/[^/?]+\/?$/, { timeout: 40_000 });
    const workspaceId = page.url().match(/\/relayops\/([^/?]+)/)?.[1];
    if (!workspaceId) throw new Error("The guest workspace was not created");
    report.workspaceId = workspaceId;
    const root = `/api/relayops/workspaces/${workspaceId}`;
    const saved = await (await context.request.get(`${root}/incidents`)).json();
    expect(saved.items).toHaveLength(1);
    const incidentId = saved.items[0].id;
    const detail = await (
      await context.request.get(`${root}/incidents/${incidentId}`)
    ).json();
    expect(detail.incident).toMatchObject({
      isDemo: true,
      title: "Оплата картой проходит с задержкой",
    });
    report.demoVerified = true;
    const routes = [
      ["overview", ""],
      ["incidents", "/incidents"],
      ["board", "/board"],
      ["room", `/incidents/${incidentId}`],
      ["services", "/services"],
      ["analytics", "/analytics"],
    ] as const;
    if (!tailOnly) {
      for (const color of ["light", "dark"] as const) {
        await theme(color);
        for (const width of [1440, 390]) {
          await page.setViewportSize({
            width,
            height: width === 390 ? 844 : 960,
          });
          for (const [name, path] of routes) {
            await page.goto(`/relayops/${workspaceId}${path}`);
            await expect(
              page.locator("#relayops-main h1").first(),
            ).toBeVisible();
            if (name === "analytics") {
              const includeDemo = page.getByRole("checkbox", {
                name: "Включать учебные инциденты",
                exact: true,
              });
              await expect(includeDemo).not.toBeChecked();
              await expect(
                page.locator("#analytics-demo-policy"),
              ).toContainText("DEMO не входят в расчёт");
              if (color === "light" && width === 1440)
                await capture(
                  page,
                  "analytics-default-excludes-demo-light-1440",
                );
              const includedResponse = page.waitForResponse(
                (response) =>
                  response.url().includes("/analytics/reliability?") &&
                  response.url().includes("includeDemo=true") &&
                  response.status() === 200,
              );
              // Changing URL-backed filters replaces the old checkbox with loading UI.
              await includeDemo.click();
              const included = await (await includedResponse).json();
              expect(included.metrics.volume.count).toBe(1);
              await expect(includeDemo).toBeChecked();
              expect(
                new URL(page.url()).searchParams
                  .get("includeDemo")
                  ?.replaceAll('"', ""),
              ).toBe("true");
              await expect(
                page.locator("#analytics-demo-policy"),
              ).toContainText("включены учебные инциденты");
              report.interactions.analyticsDemoPolicy =
                "Default exclusion is explicit; the UI checkbox updates the shareable URL and returns volume=1 from the real API";
            }
            await capture(page, `${name}-${color}-${width}`);
            await assertOverflow(page, `${name}-${color}`, width);
            if (width === 1440 || name === "board" || name === "room")
              await audit(page, `${name}-${color}-${width}`);
          }
        }
      }
      await theme("light");
      for (const [name, path] of routes) {
        await page.goto(`/relayops/${workspaceId}${path}`);
        await expect(page.locator("#relayops-main h1").first()).toBeVisible();
        for (const width of [320, 768]) {
          await page.setViewportSize({ width, height: 900 });
          await assertOverflow(page, name, width);
        }
      }

      // Preferences are verified through the actual account controls.
      await page.setViewportSize({ width: 1440, height: 960 });
      await page.goto(`/relayops/${workspaceId}`);
      await expect(page.locator("#relayops-main h1").first()).toBeVisible();
      await page.locator(".sbor-account-menu > summary").click();
      await expect(page.locator(".sbor-account-popup")).toBeVisible();
      await capture(page, "account-menu-light-1440");
      await page.locator(".sbor-account-popup").getByRole("switch").click();
      await expect(page.locator("html")).toHaveClass(/dark/);
      await page.locator(".sbor-account-popup").getByRole("switch").click();
      await expect(page.locator("html")).not.toHaveClass(/dark/);
      await page
        .locator(".sbor-account-popup")
        .getByRole("button", { name: "EN", exact: true })
        .click();
      await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
      await page.locator(".sbor-account-menu > summary").click();
      await page
        .locator(".sbor-account-popup")
        .getByRole("button", { name: "RU", exact: true })
        .click();
      await expect(page.locator("html")).toHaveAttribute("lang", "ru-RU");
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", "ru-RU");
      report.interactions.accountThemeLanguage =
        "UI controls and RU/EN persistence passed";
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("button", { name: "Основная навигация", exact: true })
        .click();
      const mobileDialog = page.getByRole("dialog");
      await expect(mobileDialog).toBeVisible();
      await capture(page, "mobile-navigation-light-390");
      await mobileDialog
        .getByRole("link", { name: "Доска", exact: true })
        .click();
      await expect(page).toHaveURL(/\/board$/);
      await expect(mobileDialog).toBeHidden();
      report.interactions.mobileNavigation =
        "Sheet opens, navigates and closes";
    }

    const savedState = await context.storageState();
    if (motionOnly) {
      const controls = [];
      for (const color of ["light", "dark"] as const) {
        await theme(color);
        for (const width of [1440, 390]) {
          await page.setViewportSize({
            width,
            height: width === 390 ? 844 : 960,
          });
          await page.goto(`/relayops/${workspaceId}/board`);
          await expect(
            page.locator("[data-response-board-card-id]").first(),
          ).toBeVisible();
          await capture(page, `board-${color}-${width}`);
          await audit(page, `board-${color}-${width}`);
          const rectangles = await page
            .locator("[data-response-board-card-id]")
            .first()
            .evaluate((card) =>
              [
                ...card.querySelectorAll("button[data-response-board-control]"),
              ].map((button) => {
                const {
                  x,
                  y,
                  width: buttonWidth,
                  height,
                } = button.getBoundingClientRect();
                return {
                  slot: button.getAttribute("data-slot"),
                  x,
                  y,
                  width: buttonWidth,
                  height,
                };
              }),
            );
          expect(rectangles).toHaveLength(2);
          const [drag, menu] = rectangles;
          const overlapWidth = Math.max(
            0,
            Math.min(drag.x + drag.width, menu.x + menu.width) -
              Math.max(drag.x, menu.x),
          );
          const overlapHeight = Math.max(
            0,
            Math.min(drag.y + drag.height, menu.y + menu.height) -
              Math.max(drag.y, menu.y),
          );
          expect(overlapWidth * overlapHeight).toBe(0);
          if (menu.x <= drag.x + drag.width)
            report.issues.push(
              `board-${color}-${width}: status menu must sit to the right of the drag control`,
            );
          controls.push({ color, width, rectangles });
        }
      }
      report.interactions.boardControls = controls;
    }
    if (!motionOnly) {
      // A new independent workspace produces an authentic empty board.
      const emptyContext = await browser.newContext({
        baseURL,
        locale: "ru-RU",
        extraHTTPHeaders: { Origin: baseURL },
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
      contexts.push(emptyContext);
      const suffix = Date.now();
      const signedUp = await emptyContext.request.post(
        "/api/auth/sign-up/email",
        {
          data: {
            name: "Визуальная проверка · DEMO",
            email: `visual-empty-${suffix}@example.test`,
            password: "RelayOps-password-123!",
          },
        },
      );
      expect(signedUp.ok(), await signedUp.text()).toBeTruthy();
      const created = await emptyContext.request.post(
        "/api/auth/organization/create",
        {
          data: {
            name: "Проверка пустого состояния · DEMO",
            slug: `visual-empty-${suffix}`,
          },
        },
      );
      expect(created.ok(), await created.text()).toBeTruthy();
      const empty = await created.json();
      report.emptyWorkspaceId = empty.id;
      expect(
        (
          await emptyContext.request.post(
            `/api/relayops/workspaces/${empty.id}/activate`,
          )
        ).ok(),
      ).toBeTruthy();
      const emptyPage = await emptyContext.newPage();
      await emptyPage.goto(`/relayops/${empty.id}/board`);
      await expect(emptyPage.locator(".sbor-board-empty")).toBeVisible();
      await capture(emptyPage, "board-empty-light-390");
      await emptyPage.setViewportSize({ width: 1440, height: 960 });
      await capture(emptyPage, "board-empty-light-1440");
      await audit(emptyPage, "board-empty");

      const stateContext = await browser.newContext({
        baseURL,
        storageState: savedState,
        locale: "ru-RU",
        viewport: { width: 1440, height: 960 },
        bypassCSP: true,
      });
      contexts.push(stateContext);
      const state = await stateContext.newPage();
      const incidentsUrl = `**/api/relayops/workspaces/${workspaceId}/incidents?*`;
      let releaseLoading: () => void = () => undefined;
      const loadingGate = new Promise<void>((resolveGate) => {
        releaseLoading = resolveGate;
      });
      await state.route(incidentsUrl, async (route) => {
        await loadingGate;
        // URL normalization can cancel the first query while its successor waits.
        await route.continue().catch(() => undefined);
      });
      await state.goto(`/relayops/${workspaceId}/incidents`);
      await expect(
        state.locator('#relayops-main [role="status"]').first(),
      ).toBeVisible();
      await capture(state, "incidents-loading-light-1440");
      releaseLoading();
      await expect(state.getByTestId("workbench-row")).toHaveCount(1);
      await state.unroute(incidentsUrl);
      await state.route(incidentsUrl, (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Simulated visual test error" }),
        }),
      );
      await state.reload();
      await expect(
        state.getByRole("heading", {
          name: "Сборитм временно недоступен",
          exact: true,
        }),
      ).toBeVisible({ timeout: 20_000 });
      await capture(state, "incidents-error-light-1440");
      await state.unroute(incidentsUrl);
      await state.getByRole("button", { name: /Повторить/ }).click();
      await expect(state.getByTestId("workbench-row")).toHaveCount(1);
      report.interactions.loadingErrorRetry =
        "Delayed request, HTTP 500, retry recovery passed";
    }

    if (!controlsOnly) {
      // Real frame-to-frame checks complement screenshots; video also includes app navigation.
      const motionContext = await browser.newContext({
        baseURL,
        locale: "ru-RU",
        viewport: { width: 1440, height: 960 },
        recordVideo: {
          dir: ".local/sboritm-motion",
          size: { width: 1440, height: 960 },
        },
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
      const moving = await motionContext.newPage();
      const video = moving.video();
      await moving.goto("/auth/sign-in");
      const scene = moving.locator(".signal-scene").first();
      await expect(scene).toBeVisible();
      const stageBefore = await scene.getAttribute("data-stage");
      const sampleMotion = () =>
        moving.evaluate(() => {
          const trail = document.querySelector(".signal-trails path");
          const traveler = document.querySelector(
            ".signal-traveler",
          ) as SVGGraphicsElement | null;
          return {
            dash: trail ? getComputedStyle(trail).strokeDashoffset : "",
            traveler: traveler?.getBoundingClientRect().x ?? null,
            offsetDistance: traveler
              ? getComputedStyle(traveler).offsetDistance
              : "",
            animations: document
              .getAnimations()
              .filter((animation) => animation.playState === "running").length,
          };
        });
      const frameBefore = await sampleMotion();
      await moving.waitForTimeout(750);
      const frameAfter = await sampleMotion();
      report.motion = { stageBefore, frameBefore, frameAfter };
      expect(frameBefore.dash).not.toBe(frameAfter.dash);
      expect(frameBefore.traveler).not.toBe(frameAfter.traveler);
      expect(frameBefore.offsetDistance).not.toBe(frameAfter.offsetDistance);
      await expect(scene).not.toHaveAttribute(
        "data-stage",
        stageBefore ?? "0",
        {
          timeout: 5_000,
        },
      );
      const bounds = await scene.boundingBox();
      if (!bounds) throw new Error("Missing hero geometry");
      const pointerBefore = await scene
        .locator(".signal-sculpture")
        .evaluate((element) => getComputedStyle(element).transform);
      await moving.mouse.move(
        bounds.x + bounds.width * 0.85,
        bounds.y + bounds.height * 0.65,
      );
      await moving.waitForTimeout(500);
      const pointerTransform = await scene
        .locator(".signal-sculpture")
        .evaluate((element) => getComputedStyle(element).transform);
      expect(pointerTransform).not.toBe(pointerBefore);
      report.motion = {
        stageBefore,
        stageAfter: await scene.getAttribute("data-stage"),
        frameBefore,
        frameAfter,
        pointerBefore,
        pointerTransform,
      };
      await motionContext.addCookies(savedState.cookies);
      await moving.goto(`/relayops/${workspaceId}`);
      await expect(moving.locator("#relayops-main h1")).toBeVisible();
      await moving.getByRole("link", { name: "Доска", exact: true }).click();
      await expect(moving.locator("#relayops-main h1")).toBeVisible();
      await moving.getByRole("link", { name: "Сервисы", exact: true }).click();
      await moving.waitForTimeout(800);
      await motionContext.close();
      if (video) copyFileSync(await video.path(), `${output}/motion.webm`);

      const reducedContext = await browser.newContext({
        baseURL,
        reducedMotion: "reduce",
        locale: "ru-RU",
        viewport: { width: 1440, height: 960 },
      });
      contexts.push(reducedContext);
      const reduced = await reducedContext.newPage();
      await reduced.goto("/auth/sign-in");
      await expect(reduced.locator(".signal-scene")).toBeVisible();
      const reducedBefore = await reduced
        .locator(".signal-scene")
        .getAttribute("data-stage");
      await reduced.waitForTimeout(4_000);
      expect(
        await reduced.locator(".signal-scene").getAttribute("data-stage"),
      ).toBe(reducedBefore);
      await expect(reduced.locator("animateMotion")).toHaveCount(0);
      await expect(reduced.locator(".signal-traveler")).toHaveCount(0);
      const reducedAnimations = await reduced.evaluate(() =>
        [".signal-trails path", ".signal-art-depth"].map(
          (selector) =>
            getComputedStyle(document.querySelector(selector) as Element)
              .animationName,
        ),
      );
      expect(reducedAnimations).toEqual(["none", "none"]);
      report.motion.reduced = {
        stageStable: true,
        SVGTravelerRemoved: true,
        reducedAnimations,
      };
      await capture(reduced, "auth-reduced-motion-1440");
    }
    expect(report.errors).toEqual([]);
    expect(report.issues, JSON.stringify(report.issues)).toEqual([]);
    report.status = "passed";
    report.completedAt = new Date().toISOString();
  } catch (error) {
    report.status = "failed";
    report.failure = String(error);
    throw error;
  } finally {
    report.screenshots = [...new Set(report.screenshots)];
    report.accessibility = [
      ...new Map(
        report.accessibility.map((item) => [
          (item as { name: string }).name,
          item,
        ]),
      ).values(),
    ];
    report.overflow = [
      ...new Map(
        report.overflow.map((item) => [JSON.stringify(item), item]),
      ).values(),
    ];
    writeFileSync(
      `${output}/visual-checks.json`,
      JSON.stringify(report, null, 2),
    );
    for (const activeContext of contexts) await activeContext.close();
  }
});
