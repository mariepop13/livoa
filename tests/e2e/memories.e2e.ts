import { expect, test, type Page } from "@playwright/test";

async function createCharacter(page: Page, name = "Mira Vale"): Promise<void> {
  await page.goto("/characters");
  await page.getByLabel("Name").fill(name);
  await page
    .getByLabel("Description")
    .fill("A calm cartographer who turns uncertainty into a route forward.");
  await page.getByLabel("Personality").fill("Observant and grounded.");
  await page
    .getByLabel("System prompt")
    .fill("You are a thoughtful guide who gives clear answers.");
  await page.getByRole("button", { name: "Create character" }).click();
  await expect(page.getByRole("status")).toHaveText("Character created.");
}

test("groups character memories chronologically and preserves CRUD after reload", async ({
  page,
}) => {
  await createCharacter(page);
  await createCharacter(page, "Rin Ash");
  await page.goto("/memories");

  await expect(
    page.getByText("Choose a character to view its memories."),
  ).toBeVisible();

  await page.getByLabel("Character").selectOption({ label: "Rin Ash" });
  await expect(
    page.getByText("No memories saved for Rin Ash yet"),
  ).toBeVisible();

  await page.getByLabel("Character").selectOption({ label: "Mira Vale" });
  const miraCharacterId = await page.getByLabel("Character").inputValue();
  await page
    .getByRole("textbox", { name: "Memory", exact: true })
    .fill("First memory.");
  await page.getByRole("button", { name: "Create memory" }).click();
  await expect(page.getByRole("status")).toHaveText("Memory created.");
  await expect(page.getByLabel("Character")).toHaveValue(miraCharacterId);

  await page.waitForTimeout(10);
  await page
    .getByRole("textbox", { name: "Memory", exact: true })
    .fill("Newest memory.");
  await page.getByRole("button", { name: "Create memory" }).click();
  await expect(page.getByRole("status")).toHaveText("Memory created.");

  await page.getByLabel("Character").selectOption({ label: "Rin Ash" });
  await page
    .getByRole("textbox", { name: "Memory", exact: true })
    .fill("Rin's memory.");
  await page.getByRole("button", { name: "Create memory" }).click();
  await expect(page.getByRole("status")).toHaveText("Memory created.");

  await page.getByLabel("Character").selectOption({ label: "Mira Vale" });
  const savedMemories = page.getByRole("list", {
    name: "Saved memories list",
  });
  const memoryItems = savedMemories.getByRole("listitem");
  await expect(memoryItems).toHaveCount(2);
  await expect(memoryItems.nth(0)).toContainText("Newest memory.");
  await expect(memoryItems.nth(1)).toContainText("First memory.");
  await expect(savedMemories.getByText("Rin's memory.")).toHaveCount(0);
  const createdAt = memoryItems.nth(0).locator("time");
  await expect(createdAt).toHaveAttribute(
    "dateTime",
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  );
  await expect(createdAt).toContainText("Created");

  await page.reload();
  await expect(
    page.getByText("Choose a character to view its memories."),
  ).toBeVisible();
  await page.getByLabel("Character").selectOption({ label: "Mira Vale" });
  await expect(page.getByText("Newest memory.")).toBeVisible();

  await page
    .getByRole("button", {
      name: "Edit memory 1: Newest memory.",
    })
    .click();
  await page
    .getByRole("textbox", { name: "Memory", exact: true })
    .fill("Newest revised memory.");
  await page.getByRole("button", { name: "Save memory changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Memory updated.");
  await expect(page.getByText("Newest revised memory.")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", {
      name: "Delete memory 1: Newest revised memory.",
    })
    .click();
  await expect(page.getByRole("status")).toHaveText("Memory deleted.");

  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", {
      name: "Delete memory 1: First memory.",
    })
    .click();
  await expect(page.getByRole("status")).toHaveText("Memory deleted.");
  await expect(
    page.getByText("No memories saved for Mira Vale yet"),
  ).toBeVisible();
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
