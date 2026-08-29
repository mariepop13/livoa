import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  createCharacterApplicationService,
  type CharacterApplicationService,
} from "@/application/characters";
import type { Character } from "@/domain/models";
import type {
  CharacterMemoryDeletionRepository,
  CharacterRepository,
} from "@/domain/ports";

import CharacterManagementScreen from "./character-management-screen";

const firstCharacterId = "11111111-1111-4111-8111-111111111111";
const createdCharacterId = "22222222-2222-4222-8222-222222222222";
const timestamp = new Date("2026-01-01T00:00:00.000Z");

const savedCharacter: Character = {
  id: firstCharacterId,
  name: "Ada Lovelace",
  description: "A thoughtful pioneer of computing.",
  personality: "Curious, precise, and encouraging.",
  systemPrompt: "You are Ada Lovelace.",
  greeting: "Let us explore an idea.",
  avatar: "https://example.com/ada.png",
  createdAt: timestamp,
  updatedAt: timestamp,
};

class MemoryCharacterRepository
  implements CharacterRepository, CharacterMemoryDeletionRepository
{
  private readonly characters = new Map<string, Character>();

  public constructor(initialCharacters: readonly Character[] = []) {
    for (const character of initialCharacters) {
      this.characters.set(character.id, character);
    }
  }

  public async list(): Promise<Character[]> {
    return [...this.characters.values()];
  }

  public async getById(id: string): Promise<Character | null> {
    return this.characters.get(id) ?? null;
  }

  public async save(character: Character): Promise<void> {
    this.characters.set(character.id, character);
  }

  public async delete(id: string): Promise<void> {
    this.characters.delete(id);
  }

  public async deleteCharacterAndMemories(id: string): Promise<void> {
    await this.delete(id);
  }
}

function createService(
  initialCharacters: readonly Character[] = [],
): CharacterApplicationService {
  const repository = new MemoryCharacterRepository(initialCharacters);

  return createCharacterApplicationService(repository, repository, {
    generateId: () => createdCharacterId,
    now: () => timestamp,
  });
}

function fillCharacterForm(name = "Grace Hopper"): void {
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: name },
  });
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "A patient compiler pioneer." },
  });
  fireEvent.change(screen.getByLabelText("Personality"), {
    target: { value: "Practical, warm, and inventive." },
  });
  fireEvent.change(screen.getByLabelText("System prompt"), {
    target: { value: "You are a helpful computer scientist." },
  });
  fireEvent.change(screen.getByLabelText("Greeting (optional)"), {
    target: { value: "What shall we build today?" },
  });
}

describe("CharacterManagementScreen", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an accessible empty state", async () => {
    render(<CharacterManagementScreen service={createService()} />);

    expect(
      await screen.findByRole("heading", { name: "Saved characters" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "No characters saved yet. Create your first character above.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Create a character" }),
    ).toBeVisible();
  });

  it("lists saved characters with named edit actions", async () => {
    render(
      <CharacterManagementScreen service={createService([savedCharacter])} />,
    );

    expect(
      await screen.findByRole("heading", { name: "Ada Lovelace" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Edit Ada Lovelace" }),
    ).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Ada Lovelace avatar" }),
    ).toHaveAttribute("src", "https://example.com/ada.png");
    expect(screen.getByText("1 saved character")).toBeVisible();
  });

  it("creates a character through the application service", async () => {
    render(<CharacterManagementScreen service={createService()} />);

    await screen.findByRole("heading", { name: "Create a character" });
    fillCharacterForm();
    fireEvent.click(screen.getByRole("button", { name: "Create character" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Character created.",
    );
    expect(screen.getByRole("heading", { name: "Grace Hopper" })).toBeVisible();
    expect(screen.getByText("A patient compiler pioneer.")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Create a character" }),
    ).toBeVisible();
  });

  it("creates a character with an accessible avatar", async () => {
    render(<CharacterManagementScreen service={createService()} />);

    await screen.findByRole("heading", { name: "Create a character" });
    fillCharacterForm();
    fireEvent.change(screen.getByLabelText("Avatar URL (optional)"), {
      target: { value: "https://example.com/grace.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create character" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Character created.",
    );
    expect(
      screen.getByRole("img", { name: "Grace Hopper avatar" }),
    ).toHaveAttribute("src", "https://example.com/grace.png");
  });

  it("edits a saved character and returns to create mode", async () => {
    render(
      <CharacterManagementScreen service={createService([savedCharacter])} />,
    );

    await screen.findByRole("heading", { name: "Ada Lovelace" });
    fireEvent.click(screen.getByRole("button", { name: "Edit Ada Lovelace" }));

    expect(
      screen.getByRole("heading", { name: "Edit character" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Avatar URL (optional)")).toHaveValue(
      "https://example.com/ada.png",
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Ada Byron" },
    });
    fireEvent.change(screen.getByLabelText("Avatar URL (optional)"), {
      target: { value: "https://example.com/ada-byron.png" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save character changes" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Character updated.",
    );
    expect(screen.getByRole("heading", { name: "Ada Byron" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Create a character" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Ada Lovelace" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Ada Byron avatar" }),
    ).toHaveAttribute("src", "https://example.com/ada-byron.png");
  });

  it("rejects unsafe avatar references before saving", async () => {
    render(<CharacterManagementScreen service={createService()} />);

    await screen.findByRole("heading", { name: "Create a character" });
    fillCharacterForm();
    fireEvent.change(screen.getByLabelText("Avatar URL (optional)"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create character" }));

    expect(
      await screen.findByText(
        "Enter an HTTP or HTTPS image URL without credentials, or leave it blank.",
        { selector: "p" },
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("Avatar URL (optional)")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.queryByRole("heading", { name: "Grace Hopper" }),
    ).not.toBeInTheDocument();
  });

  it("renders accessible validation feedback without saving invalid data", async () => {
    render(<CharacterManagementScreen service={createService()} />);

    await screen.findByRole("heading", { name: "Create a character" });
    fireEvent.click(screen.getByRole("button", { name: "Create character" }));

    expect(
      await screen.findByRole("alert", {
        name: "Please correct the highlighted fields.",
      }),
    ).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.getByText("Enter a character name between 1 and 120 characters.", {
        selector: "p",
      }),
    ).toBeVisible();
  });
});
