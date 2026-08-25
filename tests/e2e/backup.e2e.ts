import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupSnapshotSchema,
} from "../../src/application/backup";

const timestamp = "2026-08-24T12:00:00.000Z";

async function createCharacter(page: Page, name: string): Promise<void> {
  await page.goto("/characters");
  await page.getByLabel("Name").fill(name);
  await page
    .getByLabel("Description")
    .fill(`${name} keeps local data organized.`);
  await page.getByLabel("Personality").fill("Observant and grounded.");
  await page
    .getByLabel("System prompt")
    .fill(`You are ${name}, a thoughtful local guide.`);
  await page.getByRole("button", { name: "Create character" }).click();
  await expect(page.getByRole("status")).toHaveText("Character created.");
}

async function createPersona(page: Page): Promise<void> {
  await page.goto("/personas");
  await page.getByLabel("Name").fill("Avery North");
  await page
    .getByLabel("Description")
    .fill("A curious traveler planning a careful route.");
  await page.getByRole("button", { name: "Create persona" }).click();
  await expect(page.getByRole("status")).toHaveText("Persona created.");
}

async function configureProvider(page: Page): Promise<void> {
  await page.route("https://openrouter.ai/api/v1/models", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: [{ id: "local-test-model", name: "Local test model" }],
      }),
    });
  });

  await page.goto("/providers");
  await page.getByLabel("Configuration ID").fill("local-backup-provider");
  await page
    .getByLabel("Selected OpenRouter model")
    .selectOption("local-test-model");
  await page
    .getByLabel("New BYOK credential")
    .fill("credential-must-never-be-exported");
  await page
    .getByRole("button", { name: "Save provider configuration" })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Provider configuration saved.",
  );
}

async function createConversation(page: Page): Promise<void> {
  await page.goto("/chat?test-double=stream");
  await page
    .getByRole("button", { name: "Start conversation with Mira Vale" })
    .click();
  await expect(page.getByRole("status")).toHaveText("Conversation created.");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Keep this route in my backup.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toHaveText("Response complete.");
}

function replacementBackup(): string {
  const characterId = "51111111-1111-4111-8111-111111111111";
  const conversationId = "53333333-3333-4333-8333-333333333333";

  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: timestamp,
    data: {
      characters: [
        {
          id: characterId,
          name: "Imported Character",
          description: "Should only appear after a successful transaction.",
          personality: "Careful.",
          systemPrompt: "Protect local data.",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      personas: [],
      conversations: [
        {
          id: conversationId,
          characterId,
          title: "Imported conversation",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      messages: [
        {
          id: "54444444-4444-4444-8444-444444444444",
          conversationId,
          role: "user",
          content: "Imported message",
          createdAt: timestamp,
        },
      ],
      settings: null,
    },
  });
}

test("exports and restores every supported collection without credentials", async ({
  page,
}) => {
  await createCharacter(page, "Mira Vale");
  await createPersona(page);
  await configureProvider(page);
  await createConversation(page);

  await page.goto("/backup");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();

  if (downloadPath === null) {
    throw new Error("The browser did not provide the backup download path.");
  }

  const contents = await readFile(downloadPath, "utf8");
  const snapshot = backupSnapshotSchema.parse(JSON.parse(contents) as unknown);

  expect(download.suggestedFilename()).toMatch(/^livoa-backup-.+\.json$/);
  expect(contents).not.toContain("credential-must-never-be-exported");
  expect(contents).not.toContain('"credential"');
  expect(snapshot.data.characters).toHaveLength(1);
  expect(snapshot.data.personas).toHaveLength(1);
  expect(snapshot.data.conversations).toHaveLength(1);
  expect(snapshot.data.messages.length).toBeGreaterThanOrEqual(2);
  expect(snapshot.data.settings?.providers).toHaveLength(1);

  await createCharacter(page, "Temporary Character");
  await page.goto("/backup");
  await page.getByLabel("Backup file").setInputFiles({
    name: "livoa-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(contents),
  });

  await expect(
    page.getByRole("heading", { name: "Confirm replacement" }),
  ).toBeVisible();
  const importButton = page.getByRole("button", {
    name: "Import and replace local data",
  });
  await expect(importButton).toBeDisabled();
  const confirmation = page.getByLabel(
    /I understand this replaces all current Livoa content/,
  );
  await confirmation.focus();
  await expect(confirmation).toBeFocused();
  await confirmation.press("Space");
  await importButton.press("Enter");

  await expect(page.getByRole("status")).toHaveText(
    "Backup imported. Your local Livoa data was replaced. Credentials were unchanged.",
  );

  await page.goto("/characters");
  await expect(page.getByRole("heading", { name: "Mira Vale" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Temporary Character" }),
  ).toHaveCount(0);
  await page.goto("/personas");
  await expect(
    page.getByRole("heading", { name: "Avery North" }),
  ).toBeVisible();
  await page.goto("/chat?test-double=stream");
  await expect(page.getByText("Keep this route in my backup.")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem(
          "livoa:credentials:v2:configuration:local-backup-provider",
        ),
      ),
    )
    .toBe("credential-must-never-be-exported");
});

test("rejects an invalid file before showing replacement confirmation", async ({
  page,
}) => {
  await createCharacter(page, "Current Character");
  await page.goto("/backup");
  await page.getByLabel("Backup file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"not-livoa"}'),
  });

  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "This file is not a valid Livoa backup. Choose an unmodified backup file.",
  );
  await expect(
    page.getByRole("heading", { name: "Confirm replacement" }),
  ).toHaveCount(0);

  await page.goto("/characters");
  await expect(
    page.getByRole("heading", { name: "Current Character" }),
  ).toBeVisible();
});

test("rolls back every IndexedDB table when an atomic import write fails", async ({
  page,
}) => {
  await createCharacter(page, "Current Character");
  await createPersona(page);
  await page.goto("/backup");
  await page.getByLabel("Backup file").setInputFiles({
    name: "replacement.json",
    mimeType: "application/json",
    buffer: Buffer.from(replacementBackup()),
  });
  await page
    .getByLabel(/I understand this replaces all current Livoa content/)
    .check();

  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;

    Object.defineProperty(IDBObjectStore.prototype, "put", {
      configurable: true,
      value: function failingMessageWrite(
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ): IDBRequest<IDBValidKey> {
        if (this.name === "messages") {
          throw new DOMException("Injected backup test failure", "AbortError");
        }

        return Reflect.apply(
          originalPut,
          this,
          key === undefined ? [value] : [value, key],
        ) as IDBRequest<IDBValidKey>;
      },
    });
  });

  await page
    .getByRole("button", { name: "Import and replace local data" })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Backup could not be imported. Your current data was not changed.",
  );

  await page.reload();
  await page.goto("/characters");
  await expect(
    page.getByRole("heading", { name: "Current Character" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Imported Character" }),
  ).toHaveCount(0);
  await page.goto("/personas");
  await expect(
    page.getByRole("heading", { name: "Avery North" }),
  ).toBeVisible();
});
