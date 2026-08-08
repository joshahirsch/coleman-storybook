import { test, expect } from "@playwright/test";

test.describe("negative paths (spec Section 30)", () => {
  test("disabled campaign cannot be started", async ({ page }) => {
    await page.goto("/friendships");
    await expect(page.getByText("This campaign is not currently accepting stories.")).toBeVisible();
  });

  test("unknown campaign 404s", async ({ page }) => {
    const response = await page.goto("/this-campaign-does-not-exist");
    expect(response?.status()).toBe(404);
  });

  test("camera/mic permission denial shows recovery instructions, not a crash", async ({ page }) => {
    // Force getUserMedia to reject before the app's own script runs, to
    // exercise the denial path independent of the fake-UI auto-accept flag.
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator.mediaDevices as any).getUserMedia = () =>
        Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
    });

    await page.goto("/parents/share");
    await page.getByLabel("First name").fill("Deny");
    await page.getByLabel("Last name").fill("Test");
    await page.getByLabel("I confirm that I am an adult").check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("I have read and agree to the statement above.").check();
    await page.getByRole("button", { name: "I agree, continue" }).click();

    await page.getByRole("button", { name: "Allow camera & microphone" }).click();
    await expect(page.getByText(/Camera\/microphone access was denied/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("unauthenticated admin access is redirected to login, never shown data", async ({ page }) => {
    const response = await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/login/);
    expect(response?.status()).toBeLessThan(400); // redirect resolves to the login page, not an error page
    await expect(page.getByText(/Sarah|Cohen|Miller|Stein/)).toHaveCount(0);
  });

  test("submission answer belonging to another submission cannot be spoofed into upload-init", async ({ request }) => {
    const res = await request.post("/api/uploads/init", {
      data: {
        submissionAnswerId: "00000000-0000-0000-0000-000000000000",
        mimeType: "video/webm",
        estimatedBytes: 1000,
      },
    });
    expect(res.status()).toBe(404);
  });

  test("private media object is not readable without a valid signed token", async ({ request }) => {
    const res = await request.get("/api/media/read?key=camp-coleman/fake/fake/fake.webm&token=not-a-real-token");
    expect(res.status()).toBe(403);
  });

  test("processing job endpoint rejects requests without the cron secret", async ({ request }) => {
    const res = await request.post("/api/jobs/process");
    expect(res.status()).toBe(401);
  });
});
