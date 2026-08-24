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
  await page.getByRole("button", { name: "Create character" }).press("Enter");

  await expect(page.getByRole("status")).toHaveText("Character created.");
  await expect(page.getByRole("heading", { name: "Mira Vale" })).toBeVisible();
}

async function configureLocalProvider(page: Page): Promise<void> {
  await page.goto("/providers");
  await page.getByLabel("Configuration ID").fill("local-test");
  await page.getByLabel("Provider ID").fill("local-test-provider");
  await page.getByLabel("Base URL").fill("http://localhost:3000/local-test");
  await page.getByLabel("Selected model ID").fill("local-test-model");
  await page.getByLabel("New BYOK credential").fill("local-test-credential");
  await page
    .getByRole("button", { name: "Save provider configuration" })
    .press("Enter");

  await expect(page.getByRole("status")).toHaveText(
    "Provider configuration saved.",
  );
  const savedProvider = page
    .getByRole("listitem")
    .filter({ hasText: "local-test" });
  await expect(savedProvider).toContainText("local-test-provider");
  await expect(savedProvider).toContainText("local-test-model");
  await expect(savedProvider).toContainText("Credential: Saved and hidden");
}

test("completes the accessible local-first conversation happy path", async ({
  page,
}) => {
  await createCharacter(page);
  await configureLocalProvider(page);

  await page.goto("/chat?test-double=stream");
  await expect(
    page.getByRole("heading", { name: "Chat with your character." }),
  ).toBeVisible();
  await expect(
    page.getByText("Local deterministic test provider"),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Start conversation with Mira Vale" })
    .press("Enter");
  await expect(page.getByRole("status")).toHaveText("Conversation created.");

  await page
    .getByLabel("Message", { exact: true })
    .fill("Help me choose a direction.");
  await page.getByRole("button", { name: "Send message" }).press("Enter");

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
