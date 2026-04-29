import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Landing page renders with navigation and hero", async ({ page }) => {
    await test.step("Verify navigation bar", async () => {
      await expect(page.getByRole("navigation").first()).toBeVisible();
      await expect(page.getByText("Monioc").first()).toBeVisible();
    });

    await test.step("Verify sign-in link in navbar", async () => {
      const signInLink = page.getByRole("link", { name: /sign in/i });
      await expect(signInLink).toBeVisible();
      await expect(signInLink).toHaveAttribute("href", "/sign-in");
    });

    await test.step("Verify hero section content", async () => {
      await expect(page.getByText(/spend smarter/i)).toBeVisible();
    });
  });

  test("Sign in button navigates to sign-in page", async ({ page }) => {
    await test.step("Click sign in link", async () => {
      await page.getByRole("link", { name: /sign in/i }).click();
    });

    await test.step("Should be on sign-in page", async () => {
      await expect(page).toHaveURL(/\/sign-in/);
      await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    });
  });

  test("Features section is present", async ({ page }) => {
    await test.step("Scroll to features", async () => {
      await page.locator("#features").scrollIntoViewIfNeeded();
    });

    await test.step("Verify feature sections", async () => {
      const eyebrows = page.locator("#features span.rounded-full");
      await expect(eyebrows.filter({ hasText: "Receipt Scanning" })).toBeVisible();
      await expect(eyebrows.filter({ hasText: "Price Comparison" })).toBeVisible();
      await expect(eyebrows.filter({ hasText: "Analytics" })).toBeVisible();
    });
  });

  test("Footer is present", async ({ page }) => {
    await test.step("Scroll to footer", async () => {
      await page.getByRole("contentinfo").scrollIntoViewIfNeeded();
    });

    await test.step("Verify footer content", async () => {
      await expect(page.getByRole("contentinfo")).toContainText("Monioc");
      await expect(page.getByRole("contentinfo")).toContainText("All rights reserved");
    });
  });
});
