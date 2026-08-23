import { describe, expect, it } from "vitest";

import type { Character } from "../../domain/models";
import type { CharacterRepository } from "../../domain/ports";
import {
  createCharacter,
  createCharacterApplicationService,
  deleteCharacter,
  listCharacters,
  updateCharacter,
} from "./service";

const characterId = "11111111-1111-4111-8111-111111111111";
const secondCharacterId = "22222222-2222-4222-8222-222222222222";
const timestamp = new Date("2026-01-01T12:00:00.000Z");

const character: Character = {
  id: characterId,
  name: "Astra",
  description: "A patient guide.",
  personality: "Thoughtful and curious.",
  systemPrompt: "Be helpful.",
  greeting: "Hello.",
  avatar: "https://example.com/astra.png",
  createdAt: timestamp,
  updatedAt: timestamp,
};

class MemoryCharacterRepository implements CharacterRepository {
  private readonly characters = new Map<string, Character>();

  public listCalls = 0;
  public getByIdCalls = 0;
  public saveCalls = 0;
  public deleteCalls = 0;
  public listFailure: unknown = null;
  public getByIdFailure: unknown = null;
  public saveFailure: unknown = null;
  public deleteFailure: unknown = null;

  public constructor(initialCharacters: Character[] = []) {
    for (const initialCharacter of initialCharacters) {
      this.characters.set(initialCharacter.id, initialCharacter);
    }
  }

  public async list(): Promise<Character[]> {
    this.listCalls += 1;
    if (this.listFailure !== null) {
      throw this.listFailure;
    }
    return [...this.characters.values()];
  }

  public async getById(id: string): Promise<Character | null> {
    this.getByIdCalls += 1;
    if (this.getByIdFailure !== null) {
      throw this.getByIdFailure;
    }
    return this.characters.get(id) ?? null;
  }

  public async save(entity: Character): Promise<void> {
    this.saveCalls += 1;
    if (this.saveFailure !== null) {
      throw this.saveFailure;
    }
    this.characters.set(entity.id, entity);
  }

  public async delete(id: string): Promise<void> {
    this.deleteCalls += 1;
    if (this.deleteFailure !== null) {
      throw this.deleteFailure;
    }
    this.characters.delete(id);
  }
}

const createInput = {
  name: "  Nova  ",
  description: "A new guide.",
  personality: "Calm.",
  systemPrompt: "Be concise.",
  greeting: "Welcome.",
};

describe("character application service", () => {
  it("creates, lists, updates, and deletes characters through the repository port", async () => {
    const repository = new MemoryCharacterRepository();
    const service = createCharacterApplicationService(repository, {
      generateId: () => secondCharacterId,
      now: () => timestamp,
    });

    const created = await service.create(createInput);
    expect(created).toEqual({
      ok: true,
      data: {
        ...createInput,
        name: "Nova",
        id: secondCharacterId,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });

    await expect(service.list()).resolves.toEqual({
      ok: true,
      data: [
        {
          ...createInput,
          name: "Nova",
          id: secondCharacterId,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    });

    const updated = await service.update({
      ...createInput,
      id: secondCharacterId,
      name: "Nova Prime",
    });
    expect(updated).toEqual({
      ok: true,
      data: {
        ...createInput,
        name: "Nova Prime",
        id: secondCharacterId,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });

    await expect(service.delete(secondCharacterId)).resolves.toEqual({
      ok: true,
      data: undefined,
    });
    await expect(service.list()).resolves.toEqual({ ok: true, data: [] });
    expect(repository.saveCalls).toBe(2);
    expect(repository.deleteCalls).toBe(1);
  });

  it("rejects invalid create, update, and delete inputs without touching storage", async () => {
    const repository = new MemoryCharacterRepository([character]);

    const invalidCreate = await createCharacter(repository, {
      ...createInput,
      name: "",
    });
    const invalidUpdate = await updateCharacter(repository, {
      ...createInput,
      id: "not-a-uuid",
    });
    const invalidDelete = await deleteCharacter(repository, "not-a-uuid");

    expect(invalidCreate).toMatchObject({
      ok: false,
      error: { kind: "validation", code: "VALIDATION_ERROR" },
    });
    expect(invalidUpdate).toMatchObject({
      ok: false,
      error: { kind: "validation", code: "VALIDATION_ERROR" },
    });
    expect(invalidDelete).toMatchObject({
      ok: false,
      error: { kind: "validation", code: "VALIDATION_ERROR" },
    });
    expect(repository.getByIdCalls).toBe(0);
    expect(repository.saveCalls).toBe(0);
    expect(repository.deleteCalls).toBe(0);
  });

  it("returns an explicit not-found failure for update and delete", async () => {
    const repository = new MemoryCharacterRepository();

    await expect(
      updateCharacter(repository, { ...character, name: "Missing" }),
    ).resolves.toEqual({
      ok: false,
      error: { kind: "not_found", code: "NOT_FOUND", id: characterId },
    });
    await expect(deleteCharacter(repository, characterId)).resolves.toEqual({
      ok: false,
      error: { kind: "not_found", code: "NOT_FOUND", id: characterId },
    });
    expect(repository.saveCalls).toBe(0);
    expect(repository.deleteCalls).toBe(0);
  });

  it("normalizes repository failures to safe application errors", async () => {
    const repository = new MemoryCharacterRepository([character]);
    const secret = "Bearer character-secret";

    repository.saveFailure = new Error(secret);
    await expect(
      createCharacter(repository, createInput, {
        generateId: () => secondCharacterId,
        now: () => timestamp,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "STORAGE_ERROR",
        error: {
          code: "STORAGE_ERROR",
          message: "Local data could not be saved.",
        },
      },
    });

    repository.saveFailure = null;
    repository.listFailure = new Error(secret);
    await expect(listCharacters(repository)).resolves.toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "STORAGE_ERROR",
        error: { code: "STORAGE_ERROR", message: "Local data could not be read." },
      },
    });

    repository.listFailure = null;
    repository.deleteFailure = new Error(secret);
    await expect(deleteCharacter(repository, characterId)).resolves.toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "STORAGE_ERROR",
        error: {
          code: "STORAGE_ERROR",
          message: "Local data could not be deleted.",
        },
      },
    });
    const result = await deleteCharacter(repository, characterId);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "application") {
      expect(result.error.error.message).not.toContain(secret);
    }
  });
});
