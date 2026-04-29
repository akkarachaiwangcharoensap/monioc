import { test, expect } from "@playwright/test";

test.describe("WorkflowDemo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Scroll the demo section into view so animations/observers fire.
    await page.locator("#demo").scrollIntoViewIfNeeded();
  });

  test("demo section is visible with 6 step tabs", async ({ page }) => {
    const demo = page.locator("#demo");
    await expect(demo).toBeVisible();

    // Desktop sidebar or mobile pill tabs — both use role=tab.
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(12); // 6 desktop + 6 mobile (one set hidden via CSS)
  });

  test("step 1 label is visible on load", async ({ page }) => {
    // 'Upload Receipt' is the first step label.
    await expect(
      page.getByRole("tab", { name: /upload receipt/i }).first(),
    ).toBeVisible();
  });

  test("Continue button advances to step 2", async ({ page }) => {
    const continueBtn = page.getByRole("button", { name: /continue/i });
    await expect(continueBtn).toBeVisible();
    await continueBtn.click();

    // After clicking, the progress counter should show step 2.
    await expect(page.locator("#demo").getByText("2/6")).toBeVisible();
  });

  test("Back button is hidden on the first step", async ({ page }) => {
    // On step 1 there is no Back button — a placeholder div replaces it.
    const backBtn = page.locator("#demo").getByRole("button", { name: /back/i });
    await expect(backBtn).toHaveCount(0);
  });

  test("Back button appears after advancing to step 2", async ({ page }) => {
    await page.getByRole("button", { name: /continue/i }).click();

    const backBtn = page.locator("#demo").getByRole("button", { name: /back/i });
    await expect(backBtn).toBeVisible();
  });

  test("clicking a step tab changes the active step", async ({ page }) => {
    // Click the third desktop tab (Scan & Extract → Review & Edit).
    const thirdTab = page
      .locator("nav[role='tablist']")
      .getByRole("tab")
      .nth(2);
    await thirdTab.click();

    // Progress counter should reflect step 3.
    await expect(page.locator("#demo").getByText("3/6")).toBeVisible();
  });

  test("mockup panel is present and not empty", async ({ page }) => {
    const panel = page.getByRole("tabpanel");
    await expect(panel).toBeVisible();

    // Panel should contain some child elements (not completely empty).
    const childCount = await panel.locator("> *").count();
    expect(childCount).toBeGreaterThan(0);
  });

  test("progress bar width increases as steps advance", async ({ page }) => {
    // Grab initial width via inline style.
    const progressBar = page.locator("#demo .h-1 > div").first();

    const initialStyle = await progressBar.getAttribute("style");
    expect(initialStyle).toContain("width");

    // Advance to step 3 and verify width changed.
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /continue/i }).click();

    const updatedStyle = await progressBar.getAttribute("style");
    expect(updatedStyle).not.toBe(initialStyle);
  });

  test("no console errors about missing data on step navigation", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    // Navigate through all steps.
    for (let i = 0; i < 5; i++) {
      const continueBtn = page.getByRole("button", { name: /continue/i });
      if (await continueBtn.count() > 0) {
        await continueBtn.click();
        await page.waitForTimeout(300); // allow transition
      }
    }

    // Filter out non-related browser errors (e.g. font loading).
    const relevantErrors = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("font"),
    );
    expect(relevantErrors).toHaveLength(0);
  });

  test("mock data disclaimer text is visible", async ({ page }) => {
    await expect(
      page.getByText(/mock data.*visual purposes/i),
    ).toBeVisible();
  });
});
