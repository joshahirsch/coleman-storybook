import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Automated WCAG-conscious sweep (spec Section 21) using axe-core. This
 * catches objective violations (missing labels, contrast, landmark/heading
 * structure, etc.) — it does not replace manual screen-reader testing, which
 * is out of scope for this automated pass and is called out as such in
 * docs/testing.md.
 */
test.describe("accessibility (axe-core)", () => {
  test("home page has no serious/critical violations", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("campaign landing page has no serious/critical violations", async ({ page }) => {
    await page.goto("/alumni");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("contributor identity step has no serious/critical violations", async ({ page }) => {
    await page.goto("/alumni/share");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("admin login page has no serious/critical violations", async ({ page }) => {
    await page.goto("/admin/login");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("admin dashboard has no serious/critical violations", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill("brian@campcoleman.org");
    await page.getByLabel("Password").fill("ColemanStorybook!Dev1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
