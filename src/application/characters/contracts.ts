import { z, type ZodError } from "zod";

import { characterSchema, type Character } from "../../domain/models";
import type { ApplicationError, ApplicationErrorCode } from "../error";

export const createCharacterInputSchema = characterSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateCharacterInputSchema = characterSchema.omit({
  createdAt: true,
  updatedAt: true,
});

export const characterIdSchema = characterSchema.shape.id;

export type CreateCharacterInput = z.input<typeof createCharacterInputSchema>;
export type UpdateCharacterInput = z.input<typeof updateCharacterInputSchema>;
export type CharacterValidationIssue = ZodError<unknown>["issues"][number];

export type CharacterUseCaseError =
  | {
      readonly kind: "validation";
      readonly code: "VALIDATION_ERROR";
      readonly issues: readonly CharacterValidationIssue[];
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

export type CharacterUseCaseResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: CharacterUseCaseError };

export type CharacterUseCaseDependencies = Readonly<{
  generateId?: () => string;
  now?: () => Date;
}>;

export interface CharacterApplicationService {
  create(input: unknown): Promise<CharacterUseCaseResult<Character>>;
  list(): Promise<CharacterUseCaseResult<Character[]>>;
  update(input: unknown): Promise<CharacterUseCaseResult<Character>>;
  delete(id: unknown): Promise<CharacterUseCaseResult<void>>;
}
