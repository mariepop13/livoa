import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AppSettings } from "@/domain/models";
import type { CredentialStore, SettingsRepository } from "@/domain/ports";
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

const savedConfiguration: AppSettings = {
  theme: "system",
  providers: [
    {
      id: "openrouter-local",
      providerId: "openrouter-compatible",
      baseUrl: "https://openrouter.ai/api/v1",
      selectedModelId: "openai/gpt-4.1-mini",
      enabled: true,
    },
  ],
};

describe("ProviderSettingsScreen", () => {
  afterEach(() => {
    cleanup();
  });

  it("exposes accessible field validation without saving invalid data", async () => {
    render(<ProviderSettingsScreen service={createService()} />);

    await screen.findByRole("heading", { name: "Add provider configuration" });
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
    expect(screen.getByLabelText("Provider ID")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("saves provider metadata and never renders the submitted credential", async () => {
    const secret = "ui-secret-that-must-not-render";
    const service = createService();
    render(<ProviderSettingsScreen service={service} />);

    await screen.findByRole("heading", { name: "Add provider configuration" });
    fireEvent.change(screen.getByLabelText("Configuration ID"), {
      target: { value: "openrouter-local" },
    });
    fireEvent.change(screen.getByLabelText("Provider ID"), {
      target: { value: "openrouter-compatible" },
    });
    fireEvent.change(screen.getByLabelText("Base URL (optional)"), {
      target: { value: "https://openrouter.ai/api/v1" },
    });
    fireEvent.change(screen.getByLabelText("Selected model ID (optional)"), {
      target: { value: "openai/gpt-4.1-mini" },
    });
    fireEvent.change(screen.getByLabelText("New BYOK credential"), {
      target: { value: secret },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save provider configuration" }),
    );

    expect(
      await screen.findByText("Provider configuration saved."),
    ).toBeVisible();
    expect(screen.getByText("Credential: Saved and hidden")).toBeVisible();
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    expect(screen.getByLabelText("New BYOK credential")).toHaveValue("");
  });

  it("does not read a saved credential into the edit form and supports removal", async () => {
    const secret = "existing-secret-that-must-not-render";
    render(
      <ProviderSettingsScreen
        service={createService(savedConfiguration, [
          "openrouter-compatible",
          secret,
        ])}
      />,
    );

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
