import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppSettings } from "@/domain/models";
import type {
  AiModel,
  AiProvider,
  ChatChunk,
  ChatRequest,
  CredentialReference,
  CredentialStore,
  SettingsRepository,
} from "@/domain/ports";
import { ProviderModelDiscoveryService } from "@/application/providers/provider-model-discovery";
import { ProviderSettingsService } from "@/application/providers/provider-settings";
import ProviderSettingsScreen from "./provider-settings-screen";

class MemorySettingsRepository implements SettingsRepository {
  public settings: AppSettings | null;
  public saveError: Error | undefined;
  public readonly savedSettings: AppSettings[] = [];

  public constructor(settings: AppSettings | null = null) {
    this.settings = settings;
  }

  public async get(): Promise<AppSettings | null> {
    return this.settings;
  }

  public async save(settings: AppSettings): Promise<void> {
    if (this.saveError !== undefined) {
      throw this.saveError;
    }

    this.savedSettings.push(settings);
    this.settings = settings;
  }
}

class MemoryCredentialStore implements CredentialStore {
  public readonly credentials = new Map<string, string>();
  public readonly legacyCredentials = new Map<string, string>();
  public readonly removedReferences: CredentialReference[] = [];
  public removeGate: Promise<void> | undefined;
  public removeError: Error | undefined;

  public async has(reference: CredentialReference): Promise<boolean> {
    return this.credentials.has(reference.configurationId);
  }

  public async save(
    reference: CredentialReference,
    credential: string,
  ): Promise<void> {
    this.credentials.set(reference.configurationId, credential);
    this.legacyCredentials.delete(reference.providerId);
  }

  public async remove(reference: CredentialReference): Promise<void> {
    this.removedReferences.push(reference);
    await this.removeGate;

    if (this.removeError !== undefined) {
      throw this.removeError;
    }

    this.credentials.delete(reference.configurationId);
  }

  public async invalidateAll(): Promise<void> {
    this.credentials.clear();
    this.legacyCredentials.clear();
  }

  public async hasLegacy(reference: CredentialReference): Promise<boolean> {
    return this.legacyCredentials.has(reference.providerId);
  }

  public async migrateLegacy(reference: CredentialReference): Promise<boolean> {
    if (this.credentials.has(reference.configurationId)) {
      this.legacyCredentials.delete(reference.providerId);
      return false;
    }

    const credential = this.legacyCredentials.get(reference.providerId);

    if (credential === undefined) {
      return false;
    }

    this.credentials.set(reference.configurationId, credential);
    this.legacyCredentials.delete(reference.providerId);
    return true;
  }
}

class TestProviderError extends Error {
  public readonly code = "network" as const;
  public readonly retryable = true;

  public constructor() {
    super("Unsafe provider detail");
  }
}

function createService(
  settings: AppSettings | null = null,
  credential?: readonly [string, string],
): ProviderSettingsService {
  const credentialStore = new MemoryCredentialStore();
  if (credential !== undefined) {
    credentialStore.credentials.set(...credential);
  }

  return new ProviderSettingsService(
    new MemorySettingsRepository(settings),
    credentialStore,
  );
}

function createModelDiscoveryService(
  listModels: () => Promise<AiModel[]> = async () => availableModels,
): ProviderModelDiscoveryService {
  const provider: AiProvider = {
    id: "openrouter",
    listModels,
    async *streamChat(
      request: ChatRequest,
      signal?: AbortSignal,
    ): AsyncIterable<ChatChunk> {
      void request;
      void signal;
      yield { type: "done" };
    },
  };

  return new ProviderModelDiscoveryService(provider);
}

function createDeferred<T>(): Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
}> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value: T) {
      resolvePromise?.(value);
    },
  };
}

const availableModels: AiModel[] = [
  {
    id: "openai/gpt-4.1-mini",
    displayName: "OpenAI: GPT-4.1 Mini",
    providerId: "openrouter",
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    displayName: "Anthropic: Claude Sonnet 4.5",
    providerId: "openrouter",
  },
];

const savedConfiguration: AppSettings = {
  theme: "system",
  providers: [
    {
      id: "openrouter-local",
      providerId: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      selectedModelId: "openai/gpt-4.1-mini",
      enabled: true,
    },
  ],
};

function renderScreen(
  service = createService(),
  modelDiscoveryService = createModelDiscoveryService(),
) {
  return render(
    <ProviderSettingsScreen
      service={service}
      modelDiscoveryService={modelDiscoveryService}
    />,
  );
}

describe("ProviderSettingsScreen", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("exposes accessible field validation without saving invalid data", async () => {
    renderScreen();

    await screen.findByRole("heading", { name: "Add provider configuration" });
    fireEvent.change(screen.getByLabelText("Configuration ID"), {
      target: { value: "" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save provider configuration" }),
    );

    expect(
      await screen.findByRole("alert", {
        name: "Please correct the highlighted fields.",
      }),
    ).toBeVisible();
    expect(screen.getByLabelText("Configuration ID")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Provider ID")).toHaveAttribute("readonly");
  });

  it("supports keyboard-operable model selection and persists it without rendering the credential", async () => {
    const secret = "ui-secret-that-must-not-render";
    renderScreen();

    await screen.findByRole("option", {
      name: "OpenAI: GPT-4.1 Mini (openai/gpt-4.1-mini)",
    });
    fireEvent.change(screen.getByLabelText("Configuration ID"), {
      target: { value: "openrouter-local" },
    });
    const modelSelect = screen.getByRole("combobox", {
      name: "Selected OpenRouter model",
    });
    modelSelect.focus();
    fireEvent.keyDown(modelSelect, { key: "ArrowDown" });
    fireEvent.change(modelSelect, {
      target: { value: "openai/gpt-4.1-mini" },
    });
    expect(modelSelect).toHaveFocus();
    expect(modelSelect).toHaveValue("openai/gpt-4.1-mini");

    fireEvent.change(screen.getByLabelText("New BYOK credential"), {
      target: { value: secret },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save provider configuration" }),
    );

    expect(
      await screen.findByText("Provider configuration saved."),
    ).toBeVisible();
    expect(screen.getByText("Model: openai/gpt-4.1-mini")).toBeVisible();
    expect(screen.getByText("Credential: Saved and hidden")).toBeVisible();
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    expect(screen.getByLabelText("New BYOK credential")).toHaveValue("");

    fireEvent.click(
      screen.getByRole("button", { name: "Edit openrouter-local" }),
    );
    expect(
      screen.getByRole("combobox", { name: "Selected OpenRouter model" }),
    ).toHaveValue("openai/gpt-4.1-mini");
  });

  it("announces loading and empty model discovery states", async () => {
    const deferredModels = createDeferred<AiModel[]>();
    renderScreen(
      createService(),
      createModelDiscoveryService(() => deferredModels.promise),
    );

    await screen.findByRole("heading", { name: "Add provider configuration" });
    expect(
      screen.getByText("Loading available OpenRouter models…"),
    ).toBeVisible();

    await act(async () => {
      deferredModels.resolve([]);
      await deferredModels.promise;
    });

    expect(
      await screen.findByText(
        "OpenRouter returned no available models. Refresh to try again.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: "Selected OpenRouter model" }),
    ).toBeDisabled();
  });

  it("shows a safe discovery error and retries successfully", async () => {
    const listModels = vi
      .fn<() => Promise<AiModel[]>>()
      .mockRejectedValueOnce(new TestProviderError())
      .mockResolvedValueOnce(availableModels);
    renderScreen(createService(), createModelDiscoveryService(listModels));

    const errorMessage = await screen.findByText(
      "The provider could not be reached. Try again.",
    );
    expect(errorMessage).toBeVisible();
    expect(errorMessage).toHaveAttribute("role", "alert");
    expect(
      screen.queryByText("Unsafe provider detail"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Retry model discovery" }),
    );

    expect(
      await screen.findByRole("option", {
        name: "OpenAI: GPT-4.1 Mini (openai/gpt-4.1-mini)",
      }),
    ).toBeVisible();
    expect(listModels).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale model response after a newer refresh completes", async () => {
    const firstRequest = createDeferred<AiModel[]>();
    const secondRequest = createDeferred<AiModel[]>();
    const listModels = vi
      .fn<() => Promise<AiModel[]>>()
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    renderScreen(createService(), createModelDiscoveryService(listModels));

    await waitFor(() => expect(listModels).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Refresh models" }));

    await act(async () => {
      secondRequest.resolve([
        { id: "model-b", displayName: "Model B", providerId: "openrouter" },
      ]);
      await secondRequest.promise;
    });
    expect(
      await screen.findByRole("option", { name: "Model B (model-b)" }),
    ).toBeVisible();

    await act(async () => {
      firstRequest.resolve([
        { id: "model-a", displayName: "Model A", providerId: "openrouter" },
      ]);
      await firstRequest.promise;
    });

    expect(
      screen.queryByRole("option", { name: "Model A (model-a)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Model B (model-b)" }),
    ).toBeVisible();
  });

  it("preserves an unavailable saved selection and explains recovery", async () => {
    renderScreen(
      createService(savedConfiguration),
      createModelDiscoveryService(async () => [
        {
          id: "model-new",
          displayName: "Model New",
          providerId: "openrouter",
        },
      ]),
    );

    await screen.findByText("Model: openai/gpt-4.1-mini");
    fireEvent.click(
      screen.getByRole("button", { name: "Edit openrouter-local" }),
    );

    expect(
      screen.getByRole("combobox", { name: "Selected OpenRouter model" }),
    ).toHaveValue("openai/gpt-4.1-mini");
    expect(
      await screen.findByText(
        "The saved model is no longer returned by OpenRouter. Choose another model and save this configuration.",
      ),
    ).toBeVisible();
  });

  it("does not read a saved credential into the edit form and supports removal", async () => {
    const secret = "existing-secret-that-must-not-render";
    renderScreen(
      createService(savedConfiguration, ["openrouter-local", secret]),
    );

    await screen.findByText("Credential: Saved and hidden");
    fireEvent.click(
      screen.getByRole("button", { name: "Edit openrouter-local" }),
    );

    expect(screen.getByLabelText("New BYOK credential")).toHaveValue("");
    expect(screen.queryByText(secret)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove saved credential for openrouter-local",
      }),
    );

    expect(await screen.findByText("Saved credential removed.")).toBeVisible();
    await waitFor(() => {
      expect(screen.getByText("Credential: Not saved")).toBeVisible();
    });
  });

  it("announces cancellation without writing to either local store", async () => {
    const settingsRepository = new MemorySettingsRepository(savedConfiguration);
    const credentialStore = new MemoryCredentialStore();
    credentialStore.credentials.set(
      "openrouter-local",
      "credential-that-must-remain-hidden",
    );
    const confirmDeletion = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderScreen(
      new ProviderSettingsService(settingsRepository, credentialStore),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Delete provider configuration openrouter-local",
      }),
    );

    expect(confirmDeletion).toHaveBeenCalledWith(
      'Permanently delete provider configuration "openrouter-local" and its saved credential from this device? This local deletion does not revoke an OpenRouter key.',
    );
    expect(
      await screen.findByText(
        "Deletion cancelled for openrouter-local. No local data was changed.",
      ),
    ).toHaveAttribute("role", "status");
    expect(settingsRepository.savedSettings).toHaveLength(0);
    expect(credentialStore.removedReferences).toHaveLength(0);
    expect(screen.getByText("Credential: Saved and hidden")).toBeVisible();
  });

  it("exposes an accessible pending state while deletion is in progress", async () => {
    const credentialStore = new MemoryCredentialStore();
    credentialStore.credentials.set("openrouter-local", "hidden-secret");
    const removal = createDeferred<void>();
    credentialStore.removeGate = removal.promise;
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderScreen(
      new ProviderSettingsService(
        new MemorySettingsRepository(savedConfiguration),
        credentialStore,
      ),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit openrouter-local" }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete provider configuration openrouter-local",
      }),
    );

    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("button", {
        name: "Deleting provider configuration openrouter-local",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Add another provider" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Save provider configuration" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Connect OpenRouter account" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Edit openrouter-local" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Remove saved credential for openrouter-local",
      }),
    ).toBeDisabled();

    await act(async () => {
      removal.resolve(undefined);
      await removal.promise;
    });

    expect(
      await screen.findByText(
        "Provider configuration openrouter-local and its saved credential were deleted only from this device.",
      ),
    ).toHaveAttribute("role", "status");
  });

  it("deletes the selected local configuration, preserves its peer, and resets editing", async () => {
    const settings: AppSettings = {
      theme: "system",
      providers: [
        ...savedConfiguration.providers,
        {
          id: "openrouter-secondary",
          providerId: "openrouter",
          selectedModelId: "anthropic/claude-sonnet-4.5",
          enabled: true,
        },
      ],
    };
    const settingsRepository = new MemorySettingsRepository(settings);
    const credentialStore = new MemoryCredentialStore();
    credentialStore.credentials.set("openrouter-local", "deleted-secret");
    credentialStore.credentials.set(
      "openrouter-secondary",
      "credential-that-must-remain",
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderScreen(
      new ProviderSettingsService(settingsRepository, credentialStore),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit openrouter-local" }),
    );
    expect(
      screen.getByRole("heading", { name: "Edit openrouter-local" }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete provider configuration openrouter-local",
      }),
    );

    expect(
      await screen.findByText(
        "Provider configuration openrouter-local and its saved credential were deleted only from this device.",
      ),
    ).toHaveAttribute("role", "status");
    expect(
      screen.getByRole("heading", { name: "Add provider configuration" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Saved providers" }),
    ).toHaveFocus();
    expect(screen.getByLabelText("Configuration ID")).toHaveValue("");
    expect(screen.queryByText("openrouter-local")).not.toBeInTheDocument();
    expect(screen.getByText("openrouter-secondary")).toBeVisible();
    expect(screen.getByText("Credential: Saved and hidden")).toBeVisible();
    expect(credentialStore.credentials.get("openrouter-secondary")).toBe(
      "credential-that-must-remain",
    );
  });

  it("places every provider action group consistently below its card content", async () => {
    const settings: AppSettings = {
      theme: "system",
      providers: [
        { id: "without-credential", providerId: "openrouter", enabled: true },
        { id: "with-credential", providerId: "openrouter", enabled: true },
      ],
    };

    renderScreen(
      createService(settings, ["with-credential", "hidden-credential"]),
    );

    const actionGroups = await screen.findAllByRole("group", {
      name: /Provider configuration actions for/u,
    });

    expect(actionGroups).toHaveLength(2);
    for (const actionGroup of actionGroups) {
      expect(actionGroup).toHaveClass("mt-4", "flex", "flex-wrap", "gap-2");
    }
    expect(within(actionGroups[0]).getAllByRole("button")).toHaveLength(2);
    expect(within(actionGroups[1]).getAllByRole("button")).toHaveLength(3);
    expect(
      within(actionGroups[1]).getByRole("button", {
        name: "Remove saved credential for with-credential",
      }),
    ).toBeVisible();
  });

  it("shows a fixed safe error and keeps settings when credential removal fails", async () => {
    const settingsRepository = new MemorySettingsRepository(savedConfiguration);
    const credentialStore = new MemoryCredentialStore();
    credentialStore.credentials.set("openrouter-local", "hidden-secret");
    credentialStore.removeError = new Error("Unsafe credential detail");
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderScreen(
      new ProviderSettingsService(settingsRepository, credentialStore),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Delete provider configuration openrouter-local",
      }),
    );

    expect(
      await screen.findByText(
        "The provider configuration could not be deleted because its local credential could not be removed.",
      ),
    ).toHaveAttribute("role", "alert");
    expect(screen.getByText("openrouter-local")).toBeVisible();
    expect(screen.getByText("Credential: Saved and hidden")).toBeVisible();
    expect(
      screen.queryByText("Unsafe credential detail"),
    ).not.toBeInTheDocument();
    expect(settingsRepository.savedSettings).toHaveLength(0);
  });

  it("refreshes the disconnected configuration after settings persistence fails", async () => {
    const settingsRepository = new MemorySettingsRepository(savedConfiguration);
    settingsRepository.saveError = new Error("Unsafe settings detail");
    const credentialStore = new MemoryCredentialStore();
    credentialStore.credentials.set("openrouter-local", "hidden-secret");
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderScreen(
      new ProviderSettingsService(settingsRepository, credentialStore),
    );

    const deleteButton = await screen.findByRole("button", {
      name: "Delete provider configuration openrouter-local",
    });
    credentialStore.legacyCredentials.set(
      "openrouter",
      "legacy-credential-that-must-not-migrate",
    );
    fireEvent.click(deleteButton);

    expect(
      await screen.findByText(
        "The local credential was removed, but the provider configuration could not be deleted from local settings. It remains saved without a credential. Try again.",
      ),
    ).toHaveAttribute("role", "alert");
    expect(screen.getByText("openrouter-local")).toBeVisible();
    expect(screen.getByText("Credential: Needs reassignment")).toBeVisible();
    expect(
      screen.queryByText("Unsafe settings detail"),
    ).not.toBeInTheDocument();
    expect(credentialStore.credentials.has("openrouter-local")).toBe(false);
    expect(credentialStore.legacyCredentials.get("openrouter")).toBe(
      "legacy-credential-that-must-not-migrate",
    );
  });

  it("keeps configuration IDs immutable while editing", async () => {
    renderScreen(createService(savedConfiguration));

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit openrouter-local" }),
    );

    const configurationId = screen.getByLabelText("Configuration ID");
    expect(configurationId).toHaveAttribute("readonly");
    expect(
      screen.getByText(
        "Configuration IDs identify saved credentials and cannot be changed after creation.",
      ),
    ).toBeVisible();

    fireEvent.change(configurationId, { target: { value: "renamed" } });

    expect(configurationId).toHaveValue("openrouter-local");
  });

  it("does not show one configuration credential as saved on another", async () => {
    const settings: AppSettings = {
      theme: "system",
      providers: [
        {
          id: "Test1",
          providerId: "openrouter",
          enabled: true,
        },
        {
          id: "Test 1",
          providerId: "openrouter",
          enabled: true,
        },
      ],
    };

    renderScreen(createService(settings, ["Test 1", "isolated-secret"]));

    expect(await screen.findByText("Test1")).toBeVisible();
    expect(screen.getAllByText("Credential: Saved and hidden")).toHaveLength(1);
    expect(screen.getByText("Credential: Not saved")).toBeVisible();
  });

  it("asks for reassignment instead of guessing a shared legacy credential", async () => {
    const settings: AppSettings = {
      theme: "system",
      providers: [
        { id: "Test1", providerId: "openrouter", enabled: true },
        { id: "Test 1", providerId: "openrouter", enabled: true },
      ],
    };
    const credentialStore = new MemoryCredentialStore();
    credentialStore.legacyCredentials.set("openrouter", "legacy-secret");
    const service = new ProviderSettingsService(
      new MemorySettingsRepository(settings),
      credentialStore,
    );

    renderScreen(service);

    expect(
      await screen.findAllByText("Credential: Needs reassignment"),
    ).toHaveLength(2);
    expect(
      screen.getAllByText(
        "An older credential is shared across configurations. Edit the intended configuration and save the credential again to assign it only there.",
      ),
    ).toHaveLength(2);
    expect(screen.queryByText("legacy-secret")).not.toBeInTheDocument();
  });
});
