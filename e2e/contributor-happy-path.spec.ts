import { test, expect } from "@playwright/test";

/**
 * Exercises the real getUserMedia -> MediaRecorder -> upload -> submit path
 * using Chromium's fake camera/mic device (see playwright.config.ts) — not
 * mocked JS, an actual synthetic video stream is recorded and uploaded.
 * Covers spec Section 30's HAPPY PATH scenario end to end.
 */
test("contributor can complete the staff campaign story end to end", async ({ page, context }) => {
  await context.grantPermissions(["camera", "microphone"]);

  await page.goto("/staff");
  await expect(page.getByRole("link", { name: "Share My Coleman Story" })).toBeVisible();
  await page.getByRole("link", { name: "Share My Coleman Story" }).click();

  // Step 1: identity
  await expect(page.getByRole("heading", { name: "Tell us a bit about you" })).toBeVisible();
  await page.getByLabel("First name").fill("Playwright");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("I confirm that I am an adult").check();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: consent
  await expect(page.getByRole("heading", { name: "Before you record" })).toBeVisible();
  await page.getByLabel("I have read and agree to the statement above.").check();
  await page.getByRole("button", { name: "I agree, continue" }).click();

  // Step 3: camera/mic permissions
  await expect(page.getByRole("heading", { name: "Get ready to record" })).toBeVisible();
  await page.getByRole("button", { name: "Allow camera & microphone" }).click();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4: record each question (staff campaign has 4 questions)
  for (let i = 0; i < 4; i++) {
    await expect(page.getByText(`Question ${i + 1} of 4`)).toBeVisible();
    await page.getByRole("button", { name: "Start recording" }).click();
    await expect(page.getByText(/Recording…/)).toBeVisible();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByText("Review your answer below.")).toBeVisible();

    const nextLabel = i < 3 ? "Approve & next question" : "Approve & continue";
    await page.getByRole("button", { name: nextLabel }).click();
  }

  // Step 5/6: upload + completion (server-confirmed, not merely client-claimed)
  await expect(page.getByRole("heading", { name: "Uploading your story…" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your story is now part of the Coleman story." })).toBeVisible({
    timeout: 30_000,
  });
});
