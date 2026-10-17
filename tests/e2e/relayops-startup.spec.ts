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
  const entry = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
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
    await page.route("**/assets/index-*.js", (route) => route.abort());
    await page.goto("/");
    const panel = page.locator("#startup-recovery");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("lang", language);
    const refresh = panel.getByRole("button", {
      name: language === "ru-RU" ? "Обновить страницу" : "Refresh Page",
    });
    await expect(refresh).toBeFocused();
    await page.unroute("**/assets/index-*.js");
    await refresh.click();
    await expect(page.getByTestId("guest-demo-entry")).toBeVisible();
    await expect(panel).toHaveCount(0);
    expect(
      await page.evaluate(() => localStorage.getItem("startup-test-draft")),
    ).toBe("keep this draft");
  });
}

test("a missing lazy chunk offers recovery without an automatic reload", async ({
  page,
}) => {
  let documents = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documents++;
    }
  });
  await page.route("**/assets/sign-up-*.js", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByTestId("guest-demo-entry")).toBeVisible();
  await page.getByRole("link", { name: "Create account", exact: true }).click();
  await expect(page.locator("#startup-recovery")).toBeVisible();
  expect(documents).toBe(1);
  await page.unroute("**/assets/sign-up-*.js");
  await page.locator("#startup-recovery").getByRole("button").click();
  await expect(page).toHaveURL(/\/auth\/sign-up/);
  await expect(page.locator("#startup-recovery")).toHaveCount(0);
});
