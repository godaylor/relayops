import { expect, test } from "@playwright/test";

test("root and deep links revalidate HTML; removed assets are real 404s", async ({
  request,
}) => {
  for (const path of ["/", "/index.html", "/auth/sign-in", "/dashboard"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-cache");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  }
  const html = await (await request.get("/")).text();
  const entry = html.match(/src="(\/assets\/app-[^"]+\.js)"/)?.[1];
  expect(entry).toBeTruthy();
  const asset = await request.get(entry as string);
  expect(asset.status()).toBe(200);
  expect(asset.headers()["cache-control"]).toContain("no-cache");
  expect(asset.headers()["content-type"]).toContain("javascript");
  expect(asset.headers()["x-content-type-options"]).toBe("nosniff");
  for (const name of ["previous-deploy.js", "previous-deploy.css"]) {
    const missing = await request.get(`/assets/${name}`);
    expect(missing.status()).toBe(404);
    expect(missing.headers()["cache-control"] ?? "").not.toContain("31536000");
    expect(missing.headers()["x-content-type-options"]).toBe("nosniff");
    expect(await missing.text()).not.toContain('<div id="root">');
  }
});

test("the public root opens sign-in in a clean browser", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByTestId("guest-demo-entry")).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/sign-in/);
  await expect(page.locator("#startup-recovery")).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const language of ["en-US", "ru-RU"] as const) {
  test(`missing entry module has a usable ${language} recovery screen`, async ({
    page,
  }) => {
    await page.addInitScript((locale) => {
      localStorage.setItem("relayops.locale", locale);
      localStorage.setItem("startup-test-draft", "keep this draft");
    }, language);
    await page.route("**/assets/app-*.js", (route) => route.abort());
    await page.goto("/");
    const panel = page.locator("#startup-recovery");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("lang", language);
    const refresh = panel.getByRole("button", {
      name: language === "ru-RU" ? "Обновить страницу" : "Refresh Page",
    });
    await expect(refresh).toBeFocused();
    await page.unroute("**/assets/app-*.js");
    await refresh.click();
    await expect(page.getByTestId("guest-demo-entry")).toBeVisible();
    await expect(panel).toHaveCount(0);
    expect(
      await page.evaluate(() => localStorage.getItem("startup-test-draft")),
    ).toBe("keep this draft");
  });
}

test("a missing bootstrap dependency offers manual recovery", async ({
  page,
}) => {
  let documents = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documents++;
    }
  });
  await page.route("**/assets/chunk-*.js", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#startup-recovery")).toBeVisible();
  expect(documents).toBe(1);
  await page.unroute("**/assets/chunk-*.js");
  await page.locator("#startup-recovery").getByRole("button").click();
  await expect(page.getByTestId("guest-demo-entry")).toBeVisible();
  await expect(page.locator("#startup-recovery")).toHaveCount(0);
});

test("blocked intent preloads preserve the working page, focus and draft", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let documents = 0;
  let blocked = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame())
      documents++;
  });
  await page.goto("/");
  await expect(page.getByTestId("guest-demo-entry")).toBeVisible();
  const email = page.getByRole("textbox", { name: "Email", exact: true });
  await email.fill("draft@example.test");
  await page.route("**/assets/chunk-*.js", (route) => {
    blocked++;
    return route.abort("blockedbyclient");
  });
  await page.getByRole("link", { name: "Create account", exact: true }).hover();
  await expect.poll(() => blocked).toBeGreaterThan(0);
  await email.focus();
  await expect(email).toBeFocused();
  await expect(email).toHaveValue("draft@example.test");
  await expect(page.getByTestId("guest-demo-entry")).toBeVisible();
  await expect(page.locator("#startup-recovery")).toHaveCount(0);
  expect(documents).toBe(1);
  expect(errors).toEqual([]);
});

test("an unrelated stylesheet failure cannot cover an already mounted app", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("guest-demo-entry")).toBeVisible();
  await page.route("**/unavailable-extension.css", (route) =>
    route.abort("blockedbyclient"),
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const style = document.createElement("link");
        style.rel = "stylesheet";
        style.href = "/unavailable-extension.css";
        style.addEventListener("error", () => resolve(), { once: true });
        document.head.append(style);
      }),
  );
  await expect(page.locator("#startup-recovery")).toHaveCount(0);
  await expect(page.getByTestId("guest-demo-entry")).toBeVisible();
});

test("blocked operational preloads do not replace the overview", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByTestId("guest-demo-entry").click();
  await expect(page).toHaveURL(/\/relayops\/[^/?]+\/?$/);
  const overview = page.url();
  await expect(page.locator(".sbor-focus-strip")).toBeVisible();
  let blocked = 0;
  await page.route("**/assets/chunk-*.js", (route) => {
    blocked++;
    return route.abort("blockedbyclient");
  });
  await page.locator('.sbor-sidebar a[href$="/analytics"]').hover();
  await expect.poll(() => blocked).toBeGreaterThan(0);
  await expect(page.locator("#startup-recovery")).toHaveCount(0);
  await expect(page.locator(".sbor-focus-strip")).toBeVisible();
  await expect(page).toHaveURL(overview);
  const pause = page.getByRole("button", {
    name: "Pause animation",
    exact: true,
  });
  await pause.click();
  await expect(
    page.getByRole("button", { name: "Resume animation", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("functional routes load with descriptive analytics asset URLs blocked", async ({
  page,
}) => {
  await page.route("**/assets/*analytics*", (route) =>
    route.abort("blockedbyclient"),
  );
  await page.goto("/");
  await page.getByTestId("guest-demo-entry").click();
  await expect(page).toHaveURL(/\/relayops\/[^/?]+\/?$/);
  await expect(page.locator(".sbor-focus-strip")).toBeVisible();
  for (const suffix of ["/services", "/analytics"]) {
    await page.locator(`.sbor-sidebar a[href$="${suffix}"]`).click();
    await expect(page).toHaveURL((url) => url.pathname.endsWith(suffix));
    await expect(
      page.locator(
        suffix === "/services"
          ? ".sbor-service-grid"
          : ".sbor-reliability-filters",
      ),
    ).toBeVisible();
    await expect(page.locator("#relayops-main h1")).toBeVisible();
    await expect(page.locator("#relayops-main .animate-pulse")).toHaveCount(0);
    await expect(page.locator("#startup-recovery")).toHaveCount(0);
  }
});
