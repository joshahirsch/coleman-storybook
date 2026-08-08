import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "brian@campcoleman.org";
const ADMIN_PASSWORD = "ColemanStorybook!Dev1"; // dev seed only — see src/db/seed.ts

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
}

test("admin can log in, search, review, and the consent trace stays attached", async ({ page }) => {
  await loginAsAdmin(page);

  await expect(page.getByRole("heading", { name: "Story Library" })).toBeVisible();
  await expect(page.getByText("Sarah Cohen")).toBeVisible();
  await expect(page.getByText("Rachel Stein")).toBeVisible();

  // Text search against transcripts (Postgres FTS/ILIKE — Phase 10)
  await page.getByLabel("Search transcripts/names").fill("friend");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Sarah Cohen")).toBeVisible();

  // Open a submission and verify the consent trace + AI metadata are visible.
  await page.getByRole("link", { name: "Open" }).first().click();
  await expect(page.getByRole("heading", { name: "Consent" })).toBeVisible();
  await expect(page.getByText(/Version: v1-draft/)).toBeVisible();
  await expect(page.getByText(/SYNTHETIC — not a real (transcript|AI analysis)/).first()).toBeVisible();

  // Editorial approve + favorite persist across reload.
  await page.getByRole("button", { name: "Approve for marketing use" }).click();
  await page.getByRole("button", { name: "☆ Favorite" }).click();
  await page.waitForTimeout(300); // allow the transition-wrapped server action to settle
  await page.reload();
  await expect(page.getByRole("button", { name: "★ Favorited" })).toBeVisible();
});

test("admin logout ends the session", async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/admin\/login/);
});
