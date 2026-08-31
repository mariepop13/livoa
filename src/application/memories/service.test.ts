import { describe, expect, it } from "vitest";

import type { Character, Memory } from "../../domain/models";
import type {
  MemoryCharacterWriteRepository,
  MemoryCharacterWriteResult,
  Repository,
} from "../../domain/ports";
import {
  createMemory,
  createMemoryApplicationService,
  deleteMemory,
  updateMemory,
} from "./service";

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

class InMemoryRepository<T extends { id: string }> implements Repository<T> {
  private readonly entities = new Map<string, T>();

  public saveFailure: unknown = null;
  public getFailure: unknown = null;

  public constructor(initialEntities: readonly T[] = []) {
    for (const entity of initialEntities) {
      this.entities.set(entity.id, entity);
    }
  }

  public async list(): Promise<T[]> {
    return [...this.entities.values()];
  }

  public async getById(id: string): Promise<T | null> {
    if (this.getFailure !== null) {
      throw this.getFailure;
    }
    return this.entities.get(id) ?? null;
  }

  public async save(entity: T): Promise<void> {
    if (this.saveFailure !== null) {
      throw this.saveFailure;
    }
    this.entities.set(entity.id, entity);
  }

  public async delete(id: string): Promise<void> {
    this.entities.delete(id);
  }
}

function createMemoryCharacterWriteRepository(
  memories: Repository<Memory>,
  characters: Repository<Character>,
): MemoryCharacterWriteRepository {
  return {
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
}

describe("memory application service", () => {
  it("creates, lists, updates, and deletes a memory for an existing character", async () => {
    const memories = new InMemoryRepository<Memory>();
    const characters = new InMemoryRepository<Character>([character]);
    const memoryCharacterWriteRepository = createMemoryCharacterWriteRepository(
      memories,
      characters,
    );
    const service = createMemoryApplicationService(
      memories,
      memoryCharacterWriteRepository,
      {
        generateId: () => memoryId,
        now: () => timestamp,
      },
    );

    await expect(
      service.create({ characterId, content: "  Prefers concise answers.  " }),
    ).resolves.toEqual({
      ok: true,
      data: {
        id: memoryId,
        characterId,
        subject: "user",
        content: "Prefers concise answers.",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    await expect(service.list()).resolves.toMatchObject({
      ok: true,
      data: [{ id: memoryId, content: "Prefers concise answers." }],
    });
    await expect(
      service.update({
        id: memoryId,
        characterId,
        content: "Prefers direct answers.",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { id: memoryId, content: "Prefers direct answers." },
    });
    await expect(service.delete(memoryId)).resolves.toEqual({
      ok: true,
      data: undefined,
    });
    await expect(service.list()).resolves.toEqual({ ok: true, data: [] });
  });

  it("rejects invalid content and character selection before storage", async () => {
    const memories = new InMemoryRepository<Memory>();
    const characters = new InMemoryRepository<Character>([character]);
    const memoryCharacterWriteRepository = createMemoryCharacterWriteRepository(
      memories,
      characters,
    );

    await expect(
      createMemory(memoryCharacterWriteRepository, {
        characterId: "",
        content: "",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { kind: "validation", code: "VALIDATION_ERROR" },
    });
    await expect(
      createMemory(memoryCharacterWriteRepository, {
        characterId,
        content: "x".repeat(2_001),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { kind: "validation", code: "VALIDATION_ERROR" },
    });
    await expect(memories.list()).resolves.toEqual([]);
  });

  it("requires the selected character to exist for creation and updates", async () => {
    const memory: Memory = {
      id: memoryId,
      characterId,
      subject: "user",
      content: "Existing note.",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const memories = new InMemoryRepository<Memory>([memory]);
    const characters = new InMemoryRepository<Character>();
    const memoryCharacterWriteRepository = createMemoryCharacterWriteRepository(
      memories,
      characters,
    );

    await expect(
      createMemory(memoryCharacterWriteRepository, {
        characterId,
        content: "New note.",
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        kind: "not_found",
        code: "NOT_FOUND",
        id: characterId,
        resource: "character",
      },
    });
    await expect(
      updateMemory(memories, memoryCharacterWriteRepository, {
        id: memoryId,
        characterId,
        content: "Changed note.",
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        kind: "not_found",
        code: "NOT_FOUND",
        id: characterId,
        resource: "character",
      },
    });
  });

  it("normalizes repository failures without exposing storage details", async () => {
    const memories = new InMemoryRepository<Memory>();
    const characters = new InMemoryRepository<Character>([character]);
    const memoryCharacterWriteRepository = createMemoryCharacterWriteRepository(
      memories,
      characters,
    );
    memories.saveFailure = new Error("Bearer memory-secret");

    await expect(
      createMemory(memoryCharacterWriteRepository, {
        characterId,
        content: "A note.",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "STORAGE_ERROR",
        error: { message: "Local data could not be saved." },
      },
    });
    await expect(deleteMemory(memories, memoryId)).resolves.toEqual({
      ok: false,
      error: {
        kind: "not_found",
        code: "NOT_FOUND",
        id: memoryId,
        resource: "memory",
      },
    });
  });
});
