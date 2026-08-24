import { expect, test, type Page } from "@playwright/test";

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

test("keeps local characters and conversations usable while offline", async ({
  context,
  page,
}) => {
  await createCharacter(page);
  await page.goto("/chat?test-double=stream");

  await expect(
    page.getByRole("heading", { name: "Chat with your character." }),
  ).toBeVisible();
  await expect(page.getByLabel("Character", { exact: true })).toHaveValue(/.+/);
  await expect(
    page.getByText("Local deterministic test provider"),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Start conversation with Mira Vale" })
    .click();
  await expect(page.getByRole("status")).toHaveText("Conversation created.");
  const conversationSelect = page.getByLabel("Conversation", { exact: true });
  const firstConversationId = await conversationSelect.inputValue();

  await page
    .getByLabel("Message", { exact: true })
    .fill("Keep this local note.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toHaveText("Response complete.");
  await expect(page.getByText("Keep this local note.")).toBeVisible();

  await page
    .getByRole("button", { name: "Start conversation with Mira Vale" })
    .click();
  await expect(page.getByRole("status")).toHaveText("Conversation created.");
  await expect(conversationSelect).not.toHaveValue(firstConversationId);

  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);

  await conversationSelect.selectOption(firstConversationId);
  await expect(page.getByText("Keep this local note.")).toBeVisible();
  await expect(
    page.getByText("A local response is arriving in safe chunks."),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Start conversation with Mira Vale" })
    .click();
  await expect(page.getByRole("status")).toHaveText("Conversation created.");
  await expect(page.getByLabel("Character", { exact: true })).toHaveValue(/.+/);
  await expect(
    page.getByText("Local deterministic test provider"),
  ).toBeVisible();
});
