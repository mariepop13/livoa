import { characterSchema, type Character, type CharacterCard } from "../../domain/models";
import type {
  CharacterCardImportRepository,
  CharacterCardRepository,
  CharacterRepository,
} from "../../domain/ports";
import { normalizeApplicationError } from "../error";
import type { CharacterUseCaseDependencies } from "./contracts";
import {
  CharacterCardTransportError,
  exportCharacterCard,
  parseCharacterCardFile,
  type CharacterCardExport,
  type CharacterCardPreview,
} from "./card-transport";

export type CharacterCardUseCaseError = Readonly<{
  code: "INVALID_CARD" | "NOT_FOUND" | "STORAGE_ERROR";
  message: string;
}>;
export type CharacterCardUseCaseResult<T> =
  | Readonly<{ ok: true; data: T }>
  | Readonly<{ ok: false; error: CharacterCardUseCaseError }>;
export interface CharacterCardApplicationService {
  previewImport(input: unknown): CharacterCardUseCaseResult<CharacterCardPreview>;
  import(input: unknown): Promise<CharacterCardUseCaseResult<Character>>;
  export(characterId: unknown): Promise<CharacterCardUseCaseResult<CharacterCardExport>>;
  getAvatar(characterId: unknown): Promise<CharacterCardUseCaseResult<CharacterCard["avatar"] | undefined>>;
}

type CharacterCardFileInput = Readonly<{ fileName: string; bytes: Uint8Array }>;

function invalidCard(): CharacterCardUseCaseResult<never> {
  return {
    ok: false,
    error: { code: "INVALID_CARD", message: "This file is not a supported SillyTavern character card." },
  };
}

function storageFailure(
  operation: "read" | "write",
): CharacterCardUseCaseResult<never> {
  return {
    ok: false,
    error: {
      code: "STORAGE_ERROR",
      message: normalizeApplicationError(new Error(), {
        kind: "storage",
        operation,
      }).message,
    },
  };
}

function parseFileInput(input: unknown): CharacterCardFileInput | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const candidate = input as { fileName?: unknown; bytes?: unknown };
  if (
    typeof candidate.fileName !== "string" ||
    Object.prototype.toString.call(candidate.bytes) !== "[object Uint8Array]"
  ) {
    return null;
  }
  return {
    fileName: candidate.fileName,
    bytes: new Uint8Array(candidate.bytes as Uint8Array),
  };
}

function createImportedCharacter(
  preview: CharacterCardPreview,
  dependencies: CharacterUseCaseDependencies,
): Character | null {
  const timestamp = new Date((dependencies.now?.() ?? new Date()).getTime());
  const parsed = characterSchema.safeParse({
    id: dependencies.generateId?.() ?? globalThis.crypto.randomUUID(),
    name: preview.name,
    description: preview.description,
    personality: preview.personality,
    systemPrompt: preview.systemPrompt,
    greeting: preview.greeting,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return parsed.success ? parsed.data : null;
}

export function createCharacterCardApplicationService(
  characters: CharacterRepository,
  cards: CharacterCardRepository,
  imports: CharacterCardImportRepository,
  dependencies: CharacterUseCaseDependencies = {},
): CharacterCardApplicationService {
  return {
    previewImport(input: unknown): CharacterCardUseCaseResult<CharacterCardPreview> {
      const file = parseFileInput(input);
      if (file === null) return invalidCard();
      try {
        return { ok: true, data: parseCharacterCardFile(file).preview };
      } catch (error: unknown) {
        return error instanceof CharacterCardTransportError ? invalidCard() : invalidCard();
      }
    },

    async import(input: unknown): Promise<CharacterCardUseCaseResult<Character>> {
      const file = parseFileInput(input);
      if (file === null) return invalidCard();
      try {
        const parsed = parseCharacterCardFile(file);
        const character = createImportedCharacter(parsed.preview, dependencies);
        if (character === null) return invalidCard();
        const card: CharacterCard = {
          characterId: character.id,
          format: parsed.preview.format,
          rawPayload: parsed.rawPayload,
          avatar: parsed.avatar,
        };
        const result = await imports.saveImportedCharacter(character, card);
        return result.kind === "saved"
          ? { ok: true, data: character }
          : { ok: false, error: { code: "STORAGE_ERROR", message: "The imported character could not be saved." } };
      } catch (error: unknown) {
        if (error instanceof CharacterCardTransportError) return invalidCard();
        return storageFailure("write");
      }
    },

    async export(characterId: unknown): Promise<CharacterCardUseCaseResult<CharacterCardExport>> {
      const parsedId = characterSchema.shape.id.safeParse(characterId);
      if (!parsedId.success) return invalidCard();
      try {
        if ((await characters.getById(parsedId.data)) === null) {
          return { ok: false, error: { code: "NOT_FOUND", message: "This character no longer exists. Reload the character list and try again." } };
        }
        const card = await cards.getByCharacterId(parsedId.data);
        if (card === null) return invalidCard();
        return { ok: true, data: exportCharacterCard(card) };
      } catch (error: unknown) {
        if (error instanceof CharacterCardTransportError) return invalidCard();
        return storageFailure("read");
      }
    },

    async getAvatar(characterId: unknown): Promise<CharacterCardUseCaseResult<CharacterCard["avatar"] | undefined>> {
      const parsedId = characterSchema.shape.id.safeParse(characterId);
      if (!parsedId.success) return invalidCard();
      try {
        const card = await cards.getByCharacterId(parsedId.data);
        return { ok: true, data: card?.avatar };
      } catch {
        return storageFailure("read");
      }
    },
  };
}
