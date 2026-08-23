import { expect, test } from "@playwright/test"; test("shows Livoa", async ({ page }) => { await page.goto("/"); await expect(page.getByRole("heading", { name: "Livoa" })).toBeVisible(); });
