import { describe, expect, it } from "vitest";

import type { Character, CharacterCard } from "../../domain/models";
import type {
  CharacterCardImportRepository,
  CharacterCardImportWriteResult,
  CharacterCardRepository,
  CharacterRepository,
} from "../../domain/ports";
import { createCharacterCardApplicationService } from "./card-service";
import { parseCharacterCardFile } from "./card-transport";

const timestamp = new Date("2026-01-01T00:00:00.000Z");
const id = "11111111-1111-4111-8111-111111111111";
const payload = JSON.stringify({
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "Astra",
    description: "A guide.",
    personality: "Patient.",
    scenario: "Unused.",
    first_mes: "Hello.",
    mes_example: "Unused.",
    creator_notes: "Unused.",
    system_prompt: "Mapped only to Livoa character state.",
    post_history_instructions: "Never used.",
    alternate_greetings: [],
    tags: [],
    creator: "Author",
    character_version: "1",
    extensions: { "vendor/data": { value: 1 } },
  },
});

class MemoryCardStore
  implements CharacterRepository, CharacterCardRepository, CharacterCardImportRepository
{
  public readonly characters = new Map<string, Character>();
  public readonly cards = new Map<string, CharacterCard>();

  public async list(): Promise<Character[]> {
    return [...this.characters.values()];
  }

  public async getById(characterId: string): Promise<Character | null> {
    return this.characters.get(characterId) ?? null;
  }


  public async delete(characterId: string): Promise<void> {
    this.characters.delete(characterId);
  }

  public async getByCharacterId(characterId: string): Promise<CharacterCard | null> {
    return this.cards.get(characterId) ?? null;
  }

  public async deleteByCharacterId(characterId: string): Promise<void> {
    this.cards.delete(characterId);
  }

  public async saveImportedCharacter(
    character: Character,
    card: CharacterCard,
  ): Promise<CharacterCardImportWriteResult> {
    if (this.characters.has(character.id)) return { kind: "character_exists" };
    this.characters.set(character.id, character);
    this.cards.set(card.characterId, card);
    return { kind: "saved" };
  }

  public async save(character: Character): Promise<void>;
  public async save(card: CharacterCard): Promise<void>;
  public async save(entity: Character | CharacterCard): Promise<void> {
    if ("characterId" in entity) {
      this.cards.set(entity.characterId, entity);
      return;
    }
    this.characters.set(entity.id, entity);
  }
}

describe("character card application service", () => {
  it("previews, imports with a fresh ID, and exports lossless raw card data", async () => {
    const store = new MemoryCardStore();
    const service = createCharacterCardApplicationService(store, store, store, {
      generateId: () => id,
      now: () => timestamp,
    });
    const file = { fileName: "astra.json", bytes: new TextEncoder().encode(payload) };
    expect(parseCharacterCardFile(file).preview.name).toBe("Astra");

    expect(service.previewImport(file)).toMatchObject({
      ok: true,
      data: {
        name: "Astra",
        systemPrompt: "Mapped only to Livoa character state.",
        inertFields: expect.arrayContaining(["post_history_instructions", "extensions"]),
      },
    });
    const imported = await service.import(file);
    expect(imported).toMatchObject({
      ok: true,
      data: { id, name: "Astra", greeting: "Hello." },
    });
    expect(store.cards.get(id)?.rawPayload).toBe(payload);

    const exported = await service.export(id);
    expect(exported).toMatchObject({ ok: true, data: { mediaType: "application/json" } });
    if (exported.ok) {
      expect(new TextDecoder().decode(exported.data.bytes)).toBe(payload);
    }
  });

  it("does not overwrite an existing character when the generated identifier collides", async () => {
    const store = new MemoryCardStore();
    await store.save({
      id,
      name: "Existing",
      description: "",
      personality: "",
      systemPrompt: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const service = createCharacterCardApplicationService(store, store, store, {
      generateId: () => id,
      now: () => timestamp,
    });

    await expect(service.import({ fileName: "astra.json", bytes: new TextEncoder().encode(payload) })).resolves.toMatchObject({
      ok: false,
      error: { code: "STORAGE_ERROR" },
    });
    expect((await store.getById(id))?.name).toBe("Existing");
    expect(await store.getByCharacterId(id)).toBeNull();
  });
});
