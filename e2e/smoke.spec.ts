import { expect, test, type Page } from "@playwright/test";

const APP_ORIGIN = "http://localhost:3000";

// Collects console errors and uncaught page errors from the app's own origin.
// Failed loads from external hosts (for example images.unsplash.com) are ignored.
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const url = message.location().url;
    if (url && !url.startsWith(APP_ORIGIN)) return;
    errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

test("homepage loads with its main heading", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Modern Web Projects");
  expect(errors).toEqual([]);
});

test("sign in page shows its form", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/auth/sign-in");
  await expect(page.getByText("Email", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
  await expect(page.getByText("Password", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("••••••••")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("sign up page shows its form", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/auth/sign-up");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByPlaceholder("John Doe")).toBeVisible();
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
  await expect(page.getByPlaceholder("••••••••")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("signed out visit to the dashboard redirects to sign in", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  expect(errors).toEqual([]);
});
