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

async function openChat(page: Page, mode: "stream" | "slow" | "error") {
  await createCharacter(page);
  await page.goto(`/chat?test-double=${mode}`);
  await expect(
    page.getByRole("heading", { name: "Chat with your character." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start conversation with Mira Vale" })
    .click();
  await expect(page.getByRole("status")).toHaveText("Conversation created.");
}

test("shows the accessible chat flow and streamed response", async ({
  page,
}) => {
  await openChat(page, "stream");

  await page
    .getByLabel("Message", { exact: true })
    .fill("Help me choose a direction.");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(
    page.getByRole("status", { name: "Sending your message…" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Assistant is streaming a response." }),
  ).toBeVisible();
  await expect(page.getByTestId("assistant-streaming")).toContainText(
    "A local response",
  );
  await expect(page.getByRole("status")).toHaveText("Response complete.");
  await expect(
    page.getByText("A local response is arriving in safe chunks."),
  ).toBeVisible();
});

test("cancels an in-flight deterministic response", async ({ page }) => {
  await openChat(page, "slow");

  await page
    .getByLabel("Message", { exact: true })
    .fill("Please take your time.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByRole("button", { name: "Cancel response" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Cancel response" }).click();
  await expect(page.getByRole("status")).toHaveText("Response cancelled.");
  await expect(page.getByTestId("assistant-streaming")).toHaveCount(0);
});

test("permanently deletes the active local conversation and survives reload", async ({
  page,
}) => {
  await openChat(page, "stream");

  await page.getByLabel("Message", { exact: true }).fill("Keep this message.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toHaveText("Response complete.");

  await page
    .getByRole("button", { name: "Start conversation with Mira Vale" })
    .click();
  await expect(page.getByRole("status")).toHaveText("Conversation created.");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Delete this message.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toHaveText("Response complete.");

  await page
    .getByRole("button", { name: "Delete selected conversation" })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Permanently delete conversation?",
  });
  await expect(confirmation).toContainText("This action is irreversible");
  await page.getByRole("button", { name: "Permanently delete" }).click();

  await expect(page.getByRole("status")).toHaveText("Conversation deleted.");
  await expect(page.getByLabel("Conversation").locator("option")).toHaveCount(
    2,
  );
  await expect(page.getByText("Delete this message.")).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Chat with your character." }),
  ).toBeVisible();
  await expect(page.getByLabel("Conversation").locator("option")).toHaveCount(
    2,
  );
  await expect(page.getByText("Keep this message.")).toBeVisible();
  await expect(page.getByText("Delete this message.")).toHaveCount(0);

  await page
    .getByLabel("Message", { exact: true })
    .fill("Chat still works after deletion.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toHaveText("Response complete.");
});

test("shows a normalized safe error for a provider failure", async ({
  page,
}) => {
  await openChat(page, "error");

  await page
    .getByLabel("Message", { exact: true })
    .fill("Show the safe failure state.");
  await page.getByRole("button", { name: "Send message" }).click();

  const errorAlert = page.getByRole("alert", {
    name: "The provider could not be reached.",
  });
  await expect(errorAlert).toBeVisible();
  await expect(errorAlert).not.toContainText("credential");
});
