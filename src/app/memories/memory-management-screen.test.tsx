import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createCharacterApplicationService } from "@/application/characters";
import { createMemoryApplicationService } from "@/application/memories";
import type { Character, Memory } from "@/domain/models";
import type {
  CharacterMemoryDeletionRepository,
  MemoryCharacterWriteRepository,
  MemoryCharacterWriteResult,
  Repository,
} from "@/domain/ports";

import type { BrowserMemoryServices } from "./browser-memory-service";
import MemoryManagementScreen from "./memory-management-screen";

const characterId = "11111111-1111-4111-8111-111111111111";
const memoryId = "22222222-2222-4222-8222-222222222222";
const timestamp = new Date("2026-08-28T12:00:00.000Z");
const character: Character = {
  id: characterId,
  name: "Astra",
  description: "A patient guide.",
  personality: "Thoughtful.",
  systemPrompt: "Be helpful.",
  createdAt: timestamp,
  updatedAt: timestamp,
};

const secondCharacterId = "33333333-3333-4333-8333-333333333333";
const emptyCharacterId = "44444444-4444-4444-8444-444444444444";
const olderMemoryCreatedAt = new Date("2026-08-26T08:00:00.000Z");
const newerMemoryCreatedAt = new Date("2026-08-27T09:00:00.000Z");
const secondCharacter: Character = {
  ...character,
  id: secondCharacterId,
  name: "Bram",
};
const emptyCharacter: Character = {
  ...character,
  id: emptyCharacterId,
  name: "Cora",
};
const olderMemory: Memory = {
  id: memoryId,
  characterId,
  content: "Older Astra memory.",
  createdAt: olderMemoryCreatedAt,
  updatedAt: timestamp,
};
const newerMemory: Memory = {
  id: "55555555-5555-4555-8555-555555555555",
  characterId,
  content: "Newer Astra memory.",
  createdAt: newerMemoryCreatedAt,
  updatedAt: timestamp,
};
const secondCharacterMemory: Memory = {
  id: "66666666-6666-4666-8666-666666666666",
  characterId: secondCharacterId,
  content: "Bram's memory.",
  createdAt: timestamp,
  updatedAt: timestamp,
};

class InMemoryRepository<T extends { id: string }> implements Repository<T> {
  private readonly entities = new Map<string, T>();

  public constructor(initialEntities: readonly T[] = []) {
    for (const entity of initialEntities) {
      this.entities.set(entity.id, entity);
    }
  }

  public async list(): Promise<T[]> {
    return [...this.entities.values()];
  }

  public async getById(id: string): Promise<T | null> {
    return this.entities.get(id) ?? null;
  }

  public async save(entity: T): Promise<void> {
    this.entities.set(entity.id, entity);
  }

  public async delete(id: string): Promise<void> {
    this.entities.delete(id);
  }
}

function createServices(
  initialMemories: readonly Memory[] = [],
  initialCharacters: readonly Character[] = [character],
): BrowserMemoryServices {
  const characters = new InMemoryRepository<Character>(initialCharacters);
  const memories = new InMemoryRepository<Memory>(initialMemories);
  const deletionRepository: CharacterMemoryDeletionRepository = {
    async deleteCharacterAndMemories(id: string): Promise<void> {
      await characters.delete(id);
    },
  };
  const memoryCharacterWriteRepository: MemoryCharacterWriteRepository = {
    async saveForExistingCharacter(
      memory: Memory,
    ): Promise<MemoryCharacterWriteResult> {
      if ((await characters.getById(memory.characterId)) === null) {
        return { kind: "character_not_found" };
      }
      await memories.save(memory);
      return { kind: "saved" };
    },
  };

  return {
    characters: createCharacterApplicationService(
      characters,
      deletionRepository,
    ),
    memories: createMemoryApplicationService(
      memories,
      memoryCharacterWriteRepository,
      {
        generateId: () => memoryId,
        now: () => timestamp,
      },
    ),
  };
}

describe("MemoryManagementScreen", () => {
  afterEach(() => {
    cleanup();
  });

  it("creates and edits a memory for the selected character", async () => {
    render(<MemoryManagementScreen services={createServices()} />);

    await screen.findByRole("heading", { name: "Create a memory" });
    fireEvent.change(screen.getByLabelText("Character"), {
      target: { value: characterId },
    });
    fireEvent.change(screen.getByLabelText("Memory"), {
      target: { value: "Prefers concise answers." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create memory" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Memory created.",
    );
    expect(screen.getByText("Prefers concise answers.")).toBeVisible();
    expect(screen.getByLabelText("Character")).toHaveValue(characterId);
    expect(
      screen.getByRole("button", {
        name: "Delete memory 1: Prefers concise answers.",
      }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit memory 1: Prefers concise answers.",
      }),
    );
    fireEvent.change(screen.getByLabelText("Memory"), {
      target: { value: "Prefers direct answers." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save memory changes" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Memory updated.",
    );
    expect(screen.getByText("Prefers direct answers.")).toBeVisible();
  });

  it("filters memories by active character in created order with distinct empty states", async () => {
    render(
      <MemoryManagementScreen
        services={createServices(
          [olderMemory, secondCharacterMemory, newerMemory],
          [character, secondCharacter, emptyCharacter],
        )}
      />,
    );

    await screen.findByRole("heading", { name: "Create a memory" });
    expect(
      screen.getByText("Choose a character to view its memories."),
    ).toBeVisible();
    expect(
      screen.queryByRole("list", { name: "Saved memories list" }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Character"), {
      target: { value: characterId },
    });

    const savedMemories = screen.getByRole("list", {
      name: "Saved memories list",
    });
    const memoryItems = within(savedMemories).getAllByRole("listitem");
    expect(memoryItems).toHaveLength(2);
    expect(memoryItems[0]).toHaveTextContent("Newer Astra memory.");
    expect(memoryItems[1]).toHaveTextContent("Older Astra memory.");
    const createdAt = memoryItems[0]?.querySelector("time");
    if (createdAt === null || createdAt === undefined) {
      throw new Error(
        "Expected the newest memory to expose its creation time.",
      );
    }
    expect(createdAt).toHaveAttribute(
      "dateTime",
      newerMemoryCreatedAt.toISOString(),
    );
    expect(createdAt).toHaveTextContent(
      `Created ${newerMemoryCreatedAt.toLocaleString()}`,
    );
    expect(screen.queryByText("Bram's memory.")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Character"), {
      target: { value: secondCharacterId },
    });
    expect(screen.getByText("Bram's memory.")).toBeVisible();
    expect(screen.queryByText("Newer Astra memory.")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Character"), {
      target: { value: emptyCharacterId },
    });
    expect(screen.getByText("No memories saved for Cora yet")).toBeVisible();
  });

  it("shows field-level feedback for missing character selection and content", async () => {
    render(<MemoryManagementScreen services={createServices()} />);

    await screen.findByRole("heading", { name: "Create a memory" });
    fireEvent.click(screen.getByRole("button", { name: "Create memory" }));

    expect(
      await screen.findByRole("alert", {
        name: "Please correct the highlighted fields.",
      }),
    ).toBeVisible();
    expect(screen.getByLabelText("Character")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Memory")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
