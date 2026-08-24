import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppSettings } from "@/domain/models";
import type {
  AiModel,
  AiProvider,
  ChatChunk,
  ChatRequest,
  CredentialStore,
  SettingsRepository,
} from "@/domain/ports";
import { ProviderModelDiscoveryService } from "@/application/providers/provider-model-discovery";
import { ProviderSettingsService } from "@/application/providers/provider-settings";
import ProviderSettingsScreen from "./provider-settings-screen";

class MemorySettingsRepository implements SettingsRepository {
  public settings: AppSettings | null;

  public constructor(settings: AppSettings | null = null) {
    this.settings = settings;
  }

  public async get(): Promise<AppSettings | null> {
    return this.settings;
  }

  public async save(settings: AppSettings): Promise<void> {
    this.settings = settings;
  }
}

class MemoryCredentialStore implements CredentialStore {
  public readonly credentials = new Map<string, string>();

  public async has(providerId: string): Promise<boolean> {
    return this.credentials.has(providerId);
  }

  public async save(providerId: string, credential: string): Promise<void> {
    this.credentials.set(providerId, credential);
  }

  public async remove(providerId: string): Promise<void> {
    this.credentials.delete(providerId);
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
    renderScreen(createService(savedConfiguration, ["openrouter", secret]));

    await screen.findByText("Credential: Saved and hidden");
    fireEvent.click(
      screen.getByRole("button", { name: "Edit openrouter-local" }),
    );

    expect(screen.getByLabelText("New BYOK credential")).toHaveValue("");
    expect(screen.queryByText(secret)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove saved credential" }),
    );

    expect(await screen.findByText("Saved credential removed.")).toBeVisible();
    await waitFor(() => {
      expect(screen.getByText("Credential: Not saved")).toBeVisible();
    });
  });
});
