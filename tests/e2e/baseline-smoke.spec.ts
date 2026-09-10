import { expect, test } from "@playwright/test";

test("new user creates a workspace, project, and task", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const taskTitle = `S0 task ${suffix}`;

  await page.goto("/auth/sign-up");
  await page.getByLabel("Full Name").fill("S0 Baseline");
  await page.getByLabel("Email").fill(`s0-${suffix}@example.test`);
  await page
    .locator('input[name="password"]')
    .fill("S0-baseline-password-123!");
  await page.getByRole("button", { name: "Create Account" }).click();

  await expect(page.getByLabel("Workspace Name")).toBeVisible();
  await page.getByLabel("Workspace Name").fill(`S0 Workspace ${suffix}`);
  await page.getByRole("button", { name: "Create Workspace" }).click();

  await expect(
    page.getByRole("button", { name: /create project/i }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /create project/i })
    .first()
    .click();
  await page.getByPlaceholder("Project name").fill(`S0 Project ${suffix}`);
  await page.getByRole("button", { name: "Create Project" }).click();

  await expect(page).toHaveURL(/\/project\/[^/]+\/board/);
  await page.getByTitle("Add task").first().click();
  await page.getByPlaceholder("Task title").fill(taskTitle);
  await page.getByRole("button", { name: "Create Task" }).click();

  await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();
});
