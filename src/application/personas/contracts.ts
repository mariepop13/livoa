import { z, type ZodError } from "zod";

import { personaSchema, type Persona } from "../../domain/models";
import type { ApplicationError, ApplicationErrorCode } from "../error";

export const createPersonaInputSchema = personaSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updatePersonaInputSchema = personaSchema.omit({
  createdAt: true,
  updatedAt: true,
});

export const personaIdSchema = personaSchema.shape.id;

export type CreatePersonaInput = z.input<typeof createPersonaInputSchema>;
export type UpdatePersonaInput = z.input<typeof updatePersonaInputSchema>;
export type PersonaValidationIssue = ZodError<unknown>["issues"][number];

export type PersonaUseCaseError =
  | {
      readonly kind: "validation";
      readonly code: "VALIDATION_ERROR";
      readonly issues: readonly PersonaValidationIssue[];
    }
  | {
      readonly kind: "not_found";
      readonly code: "NOT_FOUND";
      readonly id: string;
    }
  | {
      readonly kind: "application";
      readonly code: ApplicationErrorCode;
      readonly error: ApplicationError;
    };

export type PersonaUseCaseResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: PersonaUseCaseError };

export type PersonaUseCaseDependencies = Readonly<{
  generateId?: () => string;
  now?: () => Date;
}>;

export interface PersonaApplicationService {
  create(input: unknown): Promise<PersonaUseCaseResult<Persona>>;
  list(): Promise<PersonaUseCaseResult<Persona[]>>;
  update(input: unknown): Promise<PersonaUseCaseResult<Persona>>;
  delete(id: unknown): Promise<PersonaUseCaseResult<void>>;
}
