import { z, type ZodError } from "zod";

import { memorySchema, type Memory } from "../../domain/models";
import type {
  MemoryCharacterWriteRepository,
  MemoryRepository,
} from "../../domain/ports";
import { normalizeApplicationError } from "../error";
import {
  createMemoryInputSchema,
  memoryIdSchema,
  type MemoryApplicationService,
  type MemoryUseCaseDependencies,
  type MemoryUseCaseResult,
  updateMemoryInputSchema,
} from "./contracts";

const memoryListSchema = z.array(memorySchema);

function success<T>(data: T): MemoryUseCaseResult<T> {
  return { ok: true, data };
}

function validationFailure(
  error: ZodError<unknown>,
): MemoryUseCaseResult<never> {
  return {
    ok: false,
    error: {
      kind: "validation",
      code: "VALIDATION_ERROR",
      issues: error.issues,
    },
  };
}

function notFoundFailure(
  id: string,
  resource: "character" | "memory",
): MemoryUseCaseResult<never> {
  return {
    ok: false,
    error: { kind: "not_found", code: "NOT_FOUND", id, resource },
  };
}

function applicationFailure(
  error: unknown,
  operation: "read" | "write" | "delete",
): MemoryUseCaseResult<never> {
  const normalized = normalizeApplicationError(error, {
    kind: "storage",
    operation,
  });

  return {
    ok: false,
    error: { kind: "application", code: normalized.code, error: normalized },
  };
}

function getTimestamp(dependencies: MemoryUseCaseDependencies): Date {
  const timestamp = dependencies.now?.() ?? new Date();
  return new Date(timestamp.getTime());
}

export async function createMemory(
  memoryCharacterWriteRepository: MemoryCharacterWriteRepository,
  input: unknown,
  dependencies: MemoryUseCaseDependencies = {},
): Promise<MemoryUseCaseResult<Memory>> {
  const parsedInput = createMemoryInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return validationFailure(parsedInput.error);
  }

  const timestamp = getTimestamp(dependencies);
  const parsedMemory = memorySchema.safeParse({
    ...parsedInput.data,
    id: dependencies.generateId?.() ?? globalThis.crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  if (!parsedMemory.success) {
    return validationFailure(parsedMemory.error);
  }

  try {
    const result =
      await memoryCharacterWriteRepository.saveForExistingCharacter(
        parsedMemory.data,
      );
    if (result.kind === "character_not_found") {
      return notFoundFailure(parsedMemory.data.characterId, "character");
    }
    return success(parsedMemory.data);
  } catch (error: unknown) {
    return applicationFailure(error, "write");
  }
}

export async function listMemories(
  repository: MemoryRepository,
): Promise<MemoryUseCaseResult<Memory[]>> {
  try {
    const memories = await repository.list();
    const parsedMemories = memoryListSchema.safeParse(memories);
    return parsedMemories.success
      ? success(parsedMemories.data)
      : applicationFailure(parsedMemories.error, "read");
  } catch (error: unknown) {
    return applicationFailure(error, "read");
  }
}

export async function updateMemory(
  memoryRepository: MemoryRepository,
  memoryCharacterWriteRepository: MemoryCharacterWriteRepository,
  input: unknown,
  dependencies: MemoryUseCaseDependencies = {},
): Promise<MemoryUseCaseResult<Memory>> {
  const parsedInput = updateMemoryInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return validationFailure(parsedInput.error);
  }

  let currentMemory: Memory | null;
  try {
    currentMemory = await memoryRepository.getById(parsedInput.data.id);
  } catch (error: unknown) {
    return applicationFailure(error, "read");
  }
  if (currentMemory === null) {
    return notFoundFailure(parsedInput.data.id, "memory");
  }

  const parsedMemory = memorySchema.safeParse({
    ...currentMemory,
    ...parsedInput.data,
    updatedAt: getTimestamp(dependencies),
  });
  if (!parsedMemory.success) {
    return validationFailure(parsedMemory.error);
  }

  try {
    const result =
      await memoryCharacterWriteRepository.saveForExistingCharacter(
        parsedMemory.data,
      );
    if (result.kind === "character_not_found") {
      return notFoundFailure(parsedMemory.data.characterId, "character");
    }
    return success(parsedMemory.data);
  } catch (error: unknown) {
    return applicationFailure(error, "write");
  }
}

export async function deleteMemory(
  repository: MemoryRepository,
  id: unknown,
): Promise<MemoryUseCaseResult<void>> {
  const parsedId = memoryIdSchema.safeParse(id);
  if (!parsedId.success) {
    return validationFailure(parsedId.error);
  }

  try {
    if ((await repository.getById(parsedId.data)) === null) {
      return notFoundFailure(parsedId.data, "memory");
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

export function createMemoryApplicationService(
  memoryRepository: MemoryRepository,
  memoryCharacterWriteRepository: MemoryCharacterWriteRepository,
  dependencies: MemoryUseCaseDependencies = {},
): MemoryApplicationService {
  return {
    create: (input) =>
      createMemory(memoryCharacterWriteRepository, input, dependencies),
    list: () => listMemories(memoryRepository),
    update: (input) =>
      updateMemory(
        memoryRepository,
        memoryCharacterWriteRepository,
        input,
        dependencies,
      ),
    delete: (id) => deleteMemory(memoryRepository, id),
  };
}

export type { MemoryUseCaseError, MemoryUseCaseResult } from "./contracts";
