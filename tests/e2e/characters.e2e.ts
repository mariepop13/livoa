import { expect, test, type Page } from "@playwright/test";

async function fillCharacterForm(page: Page) {
  await page.getByLabel("Name").fill("Mira Vale");
  await page
    .getByLabel("Description")
    .fill("A calm cartographer who turns uncertainty into a route forward.");
  await page
    .getByLabel("Personality")
    .fill("Observant, grounded, and quietly witty.");
  await page
    .getByLabel("System prompt")
    .fill("You are Mira Vale, a thoughtful guide who gives clear answers.");
  await page.getByLabel("Greeting (optional)").fill("Where should we begin?");
}

test("creates a character with the keyboard and keeps it after reload", async ({
  page,
}) => {
  await page.goto("/characters");
  await fillCharacterForm(page);

  await page.getByLabel("Greeting (optional)").press("Tab");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("status")).toHaveText("Character created.");
  await expect(page.getByRole("heading", { name: "Mira Vale" })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("heading", { name: "Mira Vale" })).toBeVisible();
});

test("edits a saved character", async ({ page }) => {
  await page.goto("/characters");
  await fillCharacterForm(page);
  await page.getByRole("button", { name: "Create character" }).click();

  await page.getByRole("button", { name: "Edit Mira Vale" }).click();
  await page.getByLabel("Name").fill("Mira North");
  await page.getByRole("button", { name: "Save character changes" }).click();

  await expect(page.getByRole("status")).toHaveText("Character updated.");
  await expect(page.getByRole("heading", { name: "Mira North" })).toBeVisible();
});

test("creates and edits a character avatar with accessible rendering", async ({
  page,
}) => {
  await page.goto("/characters");
  await fillCharacterForm(page);

  const initialAvatarUrl = "http://localhost:3000/characters?avatar=mira-vale";
  await page.getByLabel("Avatar URL (optional)").fill(initialAvatarUrl);
  await page.getByRole("button", { name: "Create character" }).click();

  await expect(page.getByRole("status")).toHaveText("Character created.");
  const avatar = page.getByRole("img", { name: "Mira Vale avatar" });
  await expect(avatar).toBeVisible();
  await expect(avatar).toHaveAttribute("src", initialAvatarUrl);

  await page.getByRole("button", { name: "Edit Mira Vale" }).click();
  await expect(page.getByLabel("Avatar URL (optional)")).toHaveValue(
    initialAvatarUrl,
  );

  const updatedAvatarUrl = "http://localhost:3000/characters?avatar=mira-north";
  await page.getByLabel("Avatar URL (optional)").fill(updatedAvatarUrl);
  await page.getByRole("button", { name: "Save character changes" }).click();

  await expect(page.getByRole("status")).toHaveText("Character updated.");
  await expect(avatar).toHaveAttribute("src", updatedAvatarUrl);
});

test("shows accessible validation feedback", async ({ page }) => {
  await page.goto("/characters");
  await page.getByRole("button", { name: "Create character" }).click();

  await expect(
    page.getByRole("alert", {
      name: "Please correct the highlighted fields.",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");
});
