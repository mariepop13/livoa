import { expect, test, type Page } from "@playwright/test";

async function fillPersonaForm(
  page: Page,
  name: string,
  description: string,
): Promise<void> {
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Description").fill(description);
}

async function createCharacter(page: Page): Promise<void> {
  await page.goto("/characters");
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
  await page.getByRole("button", { name: "Create character" }).click();
  await expect(page.getByRole("status")).toHaveText("Character created.");
}

test("manages personas and persists the selected persona on a new conversation", async ({
  page,
}) => {
  await page.goto("/personas");
  await fillPersonaForm(
    page,
    "Sage Rowan",
    "A reflective guide for careful decisions.",
  );
  await page.getByRole("button", { name: "Create persona" }).click();
  await expect(page.getByRole("status")).toHaveText("Persona created.");
  await expect(page.getByRole("heading", { name: "Sage Rowan" })).toBeVisible();

  await page.getByRole("button", { name: "Edit Sage Rowan" }).click();
  await page.getByLabel("Name").fill("Sage North");
  await page.getByRole("button", { name: "Save persona changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Persona updated.");
  await expect(page.getByRole("heading", { name: "Sage North" })).toBeVisible();

  await fillPersonaForm(
    page,
    "Temporary Persona",
    "This entry is removed before the chat flow.",
  );
  await page.getByRole("button", { name: "Create persona" }).click();
  await expect(page.getByRole("status")).toHaveText("Persona created.");
  await page.getByRole("button", { name: "Delete Temporary Persona" }).click();
  await expect(page.getByRole("status")).toHaveText("Persona deleted.");
  await expect(
    page.getByRole("heading", { name: "Temporary Persona" }),
  ).not.toBeVisible();

  await createCharacter(page);
  await page.goto("/chat?test-double=stream");
  await expect(
    page.getByRole("heading", { name: "Chat with your character." }),
  ).toBeVisible();

  const personaSelect = page.getByLabel("Persona");
  await personaSelect.selectOption({ label: "Sage North" });
  const selectedPersonaId = await personaSelect.inputValue();
  await page
    .getByRole("button", { name: "Start conversation with Mira Vale" })
    .click();
  await expect(page.getByRole("status")).toHaveText("Conversation created.");

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Chat with your character." }),
  ).toBeVisible();
  await expect(page.getByLabel("Persona")).toHaveValue(selectedPersonaId);
});
