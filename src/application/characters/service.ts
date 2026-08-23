import { z, type ZodError } from "zod";

import { characterSchema, type Character } from "../../domain/models";
import type { CharacterRepository } from "../../domain/ports";
import { normalizeApplicationError } from "../error";
import {
  characterIdSchema,
  createCharacterInputSchema,
  type CharacterApplicationService,
  type CharacterUseCaseDependencies,
  type CharacterUseCaseResult,
  updateCharacterInputSchema,
} from "./contracts";

const characterListSchema = z.array(characterSchema);

function success<T>(data: T): CharacterUseCaseResult<T> {
  return { ok: true, data };
}

function validationFailure(
  error: ZodError<unknown>,
): CharacterUseCaseResult<never> {
  return {
    ok: false,
    error: {
      kind: "validation",
      code: "VALIDATION_ERROR",
      issues: error.issues,
    },
  };
}

function notFoundFailure(id: string): CharacterUseCaseResult<never> {
  return {
    ok: false,
    error: { kind: "not_found", code: "NOT_FOUND", id },
  };
}

function applicationFailure(
  error: unknown,
  operation: "read" | "write" | "delete",
): CharacterUseCaseResult<never> {
  const normalized = normalizeApplicationError(error, {
    kind: "storage",
    operation,
  });

  return {
    ok: false,
    error: {
      kind: "application",
      code: normalized.code,
      error: normalized,
    },
  };
}

function defaultIdGenerator(): string {
  return globalThis.crypto.randomUUID();
}

function getTimestamp(dependencies: CharacterUseCaseDependencies): Date {
  const timestamp = dependencies.now?.() ?? new Date();
  return new Date(timestamp.getTime());
}

export async function createCharacter(
  repository: CharacterRepository,
  input: unknown,
  dependencies: CharacterUseCaseDependencies = {},
): Promise<CharacterUseCaseResult<Character>> {
  const parsedInput = createCharacterInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return validationFailure(parsedInput.error);
  }

  const timestamp = getTimestamp(dependencies);
  const parsedCharacter = characterSchema.safeParse({
    ...parsedInput.data,
    id: dependencies.generateId?.() ?? defaultIdGenerator(),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  if (!parsedCharacter.success) {
    return validationFailure(parsedCharacter.error);
  }

  try {
    await repository.save(parsedCharacter.data);
    return success(parsedCharacter.data);
  } catch (error: unknown) {
    return applicationFailure(error, "write");
  }
}

export async function listCharacters(
  repository: CharacterRepository,
): Promise<CharacterUseCaseResult<Character[]>> {
  try {
    const characters = await repository.list();
    const parsedCharacters = characterListSchema.safeParse(characters);
    if (!parsedCharacters.success) {
      return applicationFailure(parsedCharacters.error, "read");
    }

    return success(parsedCharacters.data);
  } catch (error: unknown) {
    return applicationFailure(error, "read");
  }
}

export async function updateCharacter(
  repository: CharacterRepository,
  input: unknown,
  dependencies: CharacterUseCaseDependencies = {},
): Promise<CharacterUseCaseResult<Character>> {
  const parsedInput = updateCharacterInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return validationFailure(parsedInput.error);
  }

  let currentCharacter: Character | null;
  try {
    currentCharacter = await repository.getById(parsedInput.data.id);
  } catch (error: unknown) {
    return applicationFailure(error, "read");
  }

  if (currentCharacter === null) {
    return notFoundFailure(parsedInput.data.id);
  }

  const parsedCharacter = characterSchema.safeParse({
    ...currentCharacter,
    ...parsedInput.data,
    updatedAt: getTimestamp(dependencies),
  });
  if (!parsedCharacter.success) {
    return applicationFailure(parsedCharacter.error, "read");
  }

  try {
    await repository.save(parsedCharacter.data);
    return success(parsedCharacter.data);
  } catch (error: unknown) {
    return applicationFailure(error, "write");
  }
}

export async function deleteCharacter(
  repository: CharacterRepository,
  id: unknown,
): Promise<CharacterUseCaseResult<void>> {
  const parsedId = characterIdSchema.safeParse(id);
  if (!parsedId.success) {
    return validationFailure(parsedId.error);
  }

  try {
    const currentCharacter = await repository.getById(parsedId.data);
    if (currentCharacter === null) {
      return notFoundFailure(parsedId.data);
    }
  } catch (error: unknown) {
    return applicationFailure(error, "read");
  }

  try {
    await repository.delete(parsedId.data);
    return success(undefined);
  } catch (error: unknown) {
    return applicationFailure(error, "delete");
  }
}

export function createCharacterApplicationService(
  repository: CharacterRepository,
  dependencies: CharacterUseCaseDependencies = {},
): CharacterApplicationService {
  return {
    create: (input) => createCharacter(repository, input, dependencies),
    list: () => listCharacters(repository),
    update: (input) => updateCharacter(repository, input, dependencies),
    delete: (id) => deleteCharacter(repository, id),
  };
}

export type {
  CharacterUseCaseError,
  CharacterUseCaseResult,
} from "./contracts";
