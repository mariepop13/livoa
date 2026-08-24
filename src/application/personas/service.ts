import { z, type ZodError } from "zod";

import { personaSchema, type Persona } from "../../domain/models";
import type { PersonaRepository } from "../../domain/ports";
import { normalizeApplicationError } from "../error";
import {
  createPersonaInputSchema,
  personaIdSchema,
  type PersonaApplicationService,
  type PersonaUseCaseDependencies,
  type PersonaUseCaseResult,
  updatePersonaInputSchema,
} from "./contracts";

const personaListSchema = z.array(personaSchema);

function success<T>(data: T): PersonaUseCaseResult<T> {
  return { ok: true, data };
}

function validationFailure(
  error: ZodError<unknown>,
): PersonaUseCaseResult<never> {
  return {
    ok: false,
    error: {
      kind: "validation",
      code: "VALIDATION_ERROR",
      issues: error.issues,
    },
  };
}

function notFoundFailure(id: string): PersonaUseCaseResult<never> {
  return {
    ok: false,
    error: { kind: "not_found", code: "NOT_FOUND", id },
  };
}

function applicationFailure(
  error: unknown,
  operation: "read" | "write" | "delete",
): PersonaUseCaseResult<never> {
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

function getTimestamp(dependencies: PersonaUseCaseDependencies): Date {
  const timestamp = dependencies.now?.() ?? new Date();
  return new Date(timestamp.getTime());
}

export async function createPersona(
  repository: PersonaRepository,
  input: unknown,
  dependencies: PersonaUseCaseDependencies = {},
): Promise<PersonaUseCaseResult<Persona>> {
  const parsedInput = createPersonaInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return validationFailure(parsedInput.error);
  }

  const timestamp = getTimestamp(dependencies);
  const parsedPersona = personaSchema.safeParse({
    ...parsedInput.data,
    id: dependencies.generateId?.() ?? defaultIdGenerator(),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  if (!parsedPersona.success) {
    return validationFailure(parsedPersona.error);
  }

  try {
    await repository.save(parsedPersona.data);
    return success(parsedPersona.data);
  } catch (error: unknown) {
    return applicationFailure(error, "write");
  }
}

export async function listPersonas(
  repository: PersonaRepository,
): Promise<PersonaUseCaseResult<Persona[]>> {
  try {
    const personas = await repository.list();
    const parsedPersonas = personaListSchema.safeParse(personas);
    if (!parsedPersonas.success) {
      return applicationFailure(parsedPersonas.error, "read");
    }

    return success(parsedPersonas.data);
  } catch (error: unknown) {
    return applicationFailure(error, "read");
  }
}

export async function updatePersona(
  repository: PersonaRepository,
  input: unknown,
  dependencies: PersonaUseCaseDependencies = {},
): Promise<PersonaUseCaseResult<Persona>> {
  const parsedInput = updatePersonaInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return validationFailure(parsedInput.error);
  }

  let currentPersona: Persona | null;
  try {
    currentPersona = await repository.getById(parsedInput.data.id);
  } catch (error: unknown) {
    return applicationFailure(error, "read");
  }

  if (currentPersona === null) {
    return notFoundFailure(parsedInput.data.id);
  }

  const parsedPersona = personaSchema.safeParse({
    ...currentPersona,
    ...parsedInput.data,
    updatedAt: getTimestamp(dependencies),
  });
  if (!parsedPersona.success) {
    return validationFailure(parsedPersona.error);
  }

  try {
    await repository.save(parsedPersona.data);
    return success(parsedPersona.data);
  } catch (error: unknown) {
    return applicationFailure(error, "write");
  }
}

export async function deletePersona(
  repository: PersonaRepository,
  id: unknown,
): Promise<PersonaUseCaseResult<void>> {
  const parsedId = personaIdSchema.safeParse(id);
  if (!parsedId.success) {
    return validationFailure(parsedId.error);
  }

  try {
    const currentPersona = await repository.getById(parsedId.data);
    if (currentPersona === null) {
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

export function createPersonaApplicationService(
  repository: PersonaRepository,
  dependencies: PersonaUseCaseDependencies = {},
): PersonaApplicationService {
  return {
    create: (input) => createPersona(repository, input, dependencies),
    list: () => listPersonas(repository),
    update: (input) => updatePersona(repository, input, dependencies),
    delete: (id) => deletePersona(repository, id),
  };
}

export type { PersonaUseCaseError, PersonaUseCaseResult } from "./contracts";
