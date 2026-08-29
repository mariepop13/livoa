import { expect, test, type Page } from "@playwright/test";

async function createCharacter(page: Page): Promise<void> {
  await page.goto("/characters");
  await page.getByLabel("Name").fill("Mira Vale");
  await page
    .getByLabel("Description")
    .fill("A calm cartographer who turns uncertainty into a route forward.");
  await page.getByLabel("Personality").fill("Observant and grounded.");
  await page
    .getByLabel("System prompt")
    .fill("You are Mira Vale, a thoughtful guide who gives clear answers.");
  await page.getByRole("button", { name: "Create character" }).click();
  await expect(page.getByRole("status")).toHaveText("Character created.");
}

test("creates, persists, edits, and deletes a character memory", async ({
  page,
}) => {
  await createCharacter(page);
  await page.goto("/memories");

  await page.getByLabel("Character").selectOption({ label: "Mira Vale" });
  await page
    .getByRole("textbox", { name: "Memory", exact: true })
    .fill("Prefers concise answers.");
  await page.getByRole("button", { name: "Create memory" }).click();

  await expect(page.getByRole("status")).toHaveText("Memory created.");
  await expect(page.getByText("Prefers concise answers.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Prefers concise answers.")).toBeVisible();

  await page
    .getByRole("button", {
      name: "Edit memory 1: Prefers concise answers.",
    })
    .click();
  await page
    .getByRole("textbox", { name: "Memory", exact: true })
    .fill("Prefers direct answers.");
  await page.getByRole("button", { name: "Save memory changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Memory updated.");
  await expect(page.getByText("Prefers direct answers.")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", {
      name: "Delete memory 1: Prefers direct answers.",
    })
    .click();
  await expect(page.getByRole("status")).toHaveText("Memory deleted.");
  await expect(page.getByText("No memories saved yet")).toBeVisible();
});

test("shows accessible field feedback when a memory is incomplete", async ({
  page,
}) => {
  await createCharacter(page);
  await page.goto("/memories");
  await page.getByRole("button", { name: "Create memory" }).click();

  await expect(
    page.getByRole("alert", {
      name: "Please correct the highlighted fields.",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Character")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(
    page.getByRole("textbox", { name: "Memory", exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
});
