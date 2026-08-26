import { expect, test, type Locator, type Page } from "@playwright/test";

const modelId = "openai/test-model";

async function openProviderSettings(page: Page): Promise<void> {
  await page.route("https://openrouter.ai/api/v1/models", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: [{ id: modelId, name: "Deletion test model" }],
      }),
    });
  });
  await page.goto("/providers");
}

async function saveConfiguration(
  page: Page,
  configurationId: string,
  credential: string,
): Promise<void> {
  await page.getByLabel("Configuration ID").fill(configurationId);
  await page.getByLabel("Selected OpenRouter model").selectOption(modelId);
  await page.getByLabel("New BYOK credential").fill(credential);
  await page
    .getByRole("button", { name: "Save provider configuration" })
    .press("Enter");
  await expect(page.getByRole("status")).toHaveText(
    "Provider configuration saved.",
  );
}

function providerCard(page: Page, configurationId: string): Locator {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: configurationId }) });
}

async function confirmDeletion(
  page: Page,
  configurationId: string,
  accept: boolean,
): Promise<void> {
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain(
      `provider configuration "${configurationId}"`,
    );
    expect(dialog.message()).toContain("from this device");
    expect(dialog.message()).toContain("does not revoke an OpenRouter key");
    if (accept) {
      await dialog.accept();
    } else {
      await dialog.dismiss();
    }
  });

  await providerCard(page, configurationId)
    .getByRole("button", {
      name: `Delete provider configuration ${configurationId}`,
    })
    .press("Enter");
}

test("cancels local provider configuration deletion without writing", async ({
  page,
}) => {
  await openProviderSettings(page);
  await saveConfiguration(page, "cancel-deletion", "cancelled-secret");

  await confirmDeletion(page, "cancel-deletion", false);

  await expect(page.getByRole("status")).toHaveText(
    "Deletion cancelled for cancel-deletion. No local data was changed.",
  );
  await expect(providerCard(page, "cancel-deletion")).toContainText(
    "Credential: Saved and hidden",
  );
});

test("deletes one local configuration, preserves its peer, and resets editing", async ({
  page,
}) => {
  await openProviderSettings(page);
  await saveConfiguration(page, "delete-target", "deleted-secret");
  await saveConfiguration(page, "keep-target", "preserved-secret");

  await providerCard(page, "delete-target")
    .getByRole("button", { name: "Edit delete-target" })
    .press("Enter");
  await expect(
    page.getByRole("heading", { name: "Edit delete-target" }),
  ).toBeVisible();

  await confirmDeletion(page, "delete-target", true);

  await expect(page.getByRole("status")).toHaveText(
    "Provider configuration delete-target and its saved credential were deleted only from this device.",
  );
  await expect(providerCard(page, "delete-target")).toHaveCount(0);
  await expect(providerCard(page, "keep-target")).toContainText(
    "Credential: Saved and hidden",
  );
  await expect(
    page.getByRole("heading", { name: "Add provider configuration" }),
  ).toBeVisible();
  await expect(page.getByLabel("Configuration ID")).toHaveValue("");
});

test("keeps settings unchanged when local credential removal fails", async ({
  page,
}) => {
  await openProviderSettings(page);
  await saveConfiguration(page, "credential-failure", "hidden-secret");
  await page.evaluate(() => {
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key: string): void {
      if (this === window.localStorage) {
        throw new DOMException("Simulated local failure", "SecurityError");
      }

      originalRemoveItem.call(this, key);
    };
  });

  await confirmDeletion(page, "credential-failure", true);

  await expect(
    page.getByRole("alert").filter({
      hasText:
        "The provider configuration could not be deleted because its local credential could not be removed.",
    }),
  ).toBeVisible();
  await expect(providerCard(page, "credential-failure")).toContainText(
    "Credential: Saved and hidden",
  );
  await expect(page.getByText("Simulated local failure")).toHaveCount(0);
});

test("keeps a disconnected configuration when local settings persistence fails", async ({
  page,
}) => {
  await openProviderSettings(page);
  await saveConfiguration(page, "settings-failure", "removed-secret");
  await page.evaluate(() => {
    const failingPut: typeof IDBObjectStore.prototype.put = () => {
      throw new DOMException("Simulated settings failure", "UnknownError");
    };
    IDBObjectStore.prototype.put = failingPut;
  });

  await confirmDeletion(page, "settings-failure", true);

  await expect(
    page.getByRole("alert").filter({
      hasText:
        "The local credential was removed, but the provider configuration could not be deleted from local settings. It remains saved without a credential. Try again.",
    }),
  ).toBeVisible();
  await expect(providerCard(page, "settings-failure")).toContainText(
    "Credential: Not saved",
  );
  await expect(page.getByText("Simulated settings failure")).toHaveCount(0);
});
