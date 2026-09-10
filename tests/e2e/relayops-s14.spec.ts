import { expect, test } from "@playwright/test";

test("S14 clean RU onboarding, localized filters and persistent EN/RU switching", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const suffix = `s14-${Date.now()}`;
    await page.goto("/auth/sign-up");
    await expect(page.locator("html")).toHaveAttribute("lang", "ru-RU");
    await page.getByLabel("Полное имя").fill("Проверка RelayOps");
    await page.locator('input[name="email"]').fill(`${suffix}@example.test`);
    await page.locator('input[name="password"]').fill("RelayOps-password-123!");
    await page
      .getByRole("button", { name: "Создать аккаунт", exact: true })
      .click();
    await page
      .getByLabel("Название рабочей области")
      .fill(`RelayOps ${suffix}`);
    await page
      .getByRole("button", { name: "Создать рабочее пространство RelayOps" })
      .click();
    await page.getByLabel("Название сервиса").fill("Платёжный API");
    await page.getByLabel("Идентификатор сервиса").fill(suffix);
    await page.getByRole("button", { name: "Создать первый сервис" }).click();
    await page.getByRole("button", { name: "Создать демоинцидент" }).click();
    await expect(page).toHaveURL(/\/relayops\/[^/]+\/incidents\/[^/?]+/);
    const workspace = page.url().match(/\/relayops\/([^/]+)/)?.[1];
    expect(workspace).toBeTruthy();
    await page.goto(`/relayops/${workspace}/incidents`);
    await expect(
      page.getByRole("option", { name: "Обнаружен (1)", exact: true }),
    ).toBeAttached();
    await expect(
      page.getByRole("option", { name: "detected (1)", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
    await expect(
      page.getByRole("option", { name: "Detected (1)", exact: true }),
    ).toBeAttached();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "EN", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "RU", exact: true }).click();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "ru-RU");
    await expect(
      page.getByRole("option", { name: "Обнаружен (1)", exact: true }),
    ).toBeAttached();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
