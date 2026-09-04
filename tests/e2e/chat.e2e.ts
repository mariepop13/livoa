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

test("renders safe Markdown in a persisted chat message after reload", async ({
  page,
}) => {
  await openChat(page, "stream");

  await page.getByLabel("Message", { exact: true }).fill(`# Markdown note

- First item
- Second item

[Safe documentation](https://example.com)

\`\`\`ts
const greeting = "hello";
console.log(greeting);
\`\`\`

<img src=x onerror="window.__xss = true">

[Unsafe link](javascript:alert(1))`);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toHaveText("Response complete.");

  const messages = page.getByRole("list", { name: "Conversation messages" });
  await expect(
    messages.getByRole("heading", { name: "Markdown note" }),
  ).toBeVisible();
  await expect(messages.getByRole("list")).toContainText("First item");
  await expect(
    messages.getByRole("link", { name: "Safe documentation" }),
  ).toHaveAttribute("target", "_blank");
  await expect(
    messages.getByRole("link", { name: "Safe documentation" }),
  ).toHaveAttribute("rel", "noopener noreferrer");
  expect(await messages.locator("pre").textContent()).toBe(
    'const greeting = "hello";\nconsole.log(greeting);\n',
  );
  await expect(messages.getByText(/<img src=x/)).toBeVisible();
  await expect(messages.locator("img")).toHaveCount(0);
  await expect(messages.getByRole("link", { name: "Unsafe link" })).toHaveCount(
    0,
  );

  await page.reload();

  const restoredMessages = page.getByRole("list", {
    name: "Conversation messages",
  });
  await expect(
    restoredMessages.getByRole("heading", { name: "Markdown note" }),
  ).toBeVisible();
  expect(await restoredMessages.locator("pre").textContent()).toBe(
    'const greeting = "hello";\nconsole.log(greeting);\n',
  );
  await expect(restoredMessages.locator("img")).toHaveCount(0);
  await expect(
    restoredMessages.getByRole("link", { name: "Unsafe link" }),
  ).toHaveCount(0);
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

test("edits, regenerates, and deletes coherent local message sequences", async ({
  page,
}) => {
  await openChat(page, "stream");

  await page.getByLabel("Message", { exact: true }).fill("Original question.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toHaveText("Response complete.");

  const messages = page.getByRole("list", { name: "Conversation messages" });
  const originalUserMessage = messages
    .getByRole("listitem")
    .filter({ hasText: "Original question." });
  await originalUserMessage
    .getByRole("button", { name: "Edit message" })
    .click();
  const editDialog = page.getByRole("dialog", {
    name: "Edit message and keep a coherent history?",
  });
  await expect(editDialog).toContainText("discard 1 later message");
  await editDialog.getByLabel("Message").fill("Edited question.");
  await editDialog
    .getByRole("button", { name: "Save edit and discard following messages" })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Message edited; following history discarded.",
  );
  await expect(messages.getByText("Edited question.")).toBeVisible();
  await expect(
    messages.getByText("A local response is arriving in safe chunks."),
  ).toHaveCount(0);

  await page.reload();
  await expect(messages.getByText("Edited question.")).toBeVisible();
  await expect(
    messages.getByText("A local response is arriving in safe chunks."),
  ).toHaveCount(0);

  await page.getByLabel("Message", { exact: true }).fill("Try another answer.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toHaveText("Response complete.");

  const assistantMessage = messages
    .getByRole("listitem")
    .filter({ hasText: "A local response is arriving in safe chunks." });
  await assistantMessage
    .getByRole("button", { name: "Regenerate response" })
    .click();
  await page
    .getByRole("button", { name: "Generate replacement preview" })
    .click();
  const regenerationDialog = page.getByRole("dialog", {
    name: "Use regenerated response?",
  });
  await expect(regenerationDialog).toContainText(
    "A local response is arriving in safe chunks.",
  );
  await regenerationDialog
    .getByRole("button", { name: "Keep existing response" })
    .click();
  await expect(
    messages.getByText("A local response is arriving in safe chunks."),
  ).toBeVisible();

  await assistantMessage
    .getByRole("button", { name: "Regenerate response" })
    .click();
  await page
    .getByRole("button", { name: "Generate replacement preview" })
    .click();
  await page.getByRole("button", { name: "Replace saved response" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Regenerated response saved; prior response discarded.",
  );
  await page.reload();
  await expect(
    messages.getByText("A local response is arriving in safe chunks."),
  ).toBeVisible();

  await messages.getByRole("button", { name: "Delete message" }).last().click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete message?" });
  await expect(deleteDialog).toContainText("permanently discard this message");
  await deleteDialog.getByRole("button", { name: "Delete message" }).click();
  await expect(page.getByRole("status")).toHaveText("Message deleted.");
  await page.reload();
  await expect(
    messages.getByText("A local response is arriving in safe chunks."),
  ).toHaveCount(0);
});

test("cancelling regeneration retains the saved assistant response", async ({
  page,
}) => {
  await openChat(page, "slow");

  await page.getByLabel("Message", { exact: true }).fill("Keep this answer.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toHaveText("Response complete.");

  const messages = page.getByRole("list", { name: "Conversation messages" });
  await messages.getByRole("button", { name: "Regenerate response" }).click();
  await page
    .getByRole("button", { name: "Generate replacement preview" })
    .click();
  await page.getByRole("button", { name: "Cancel generation" }).click();
  await expect(page.getByRole("status")).toHaveText("Response cancelled.");
  await expect(
    messages.getByText("A local response is arriving in safe chunks."),
  ).toBeVisible();

  await page.reload();
  await expect(
    messages.getByText("A local response is arriving in safe chunks."),
  ).toBeVisible();
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
