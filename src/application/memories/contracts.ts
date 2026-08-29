import { z, type ZodError } from "zod";

import { memorySchema, type Memory } from "../../domain/models";
import type { ApplicationError, ApplicationErrorCode } from "../error";

export const createMemoryInputSchema = memorySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateMemoryInputSchema = memorySchema.omit({
  createdAt: true,
  updatedAt: true,
});

export const memoryIdSchema = memorySchema.shape.id;

export type CreateMemoryInput = z.input<typeof createMemoryInputSchema>;
export type UpdateMemoryInput = z.input<typeof updateMemoryInputSchema>;
export type MemoryValidationIssue = ZodError<unknown>["issues"][number];

export type MemoryUseCaseError =
  | {
      readonly kind: "validation";
      readonly code: "VALIDATION_ERROR";
      readonly issues: readonly MemoryValidationIssue[];
    }
  | {
      readonly kind: "not_found";
      readonly code: "NOT_FOUND";
      readonly id: string;
      readonly resource: "character" | "memory";
    }
  | {
      readonly kind: "application";
      readonly code: ApplicationErrorCode;
      readonly error: ApplicationError;
    };

export type MemoryUseCaseResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: MemoryUseCaseError };

export type MemoryUseCaseDependencies = Readonly<{
  generateId?: () => string;
  now?: () => Date;
}>;

export interface MemoryApplicationService {
  create(input: unknown): Promise<MemoryUseCaseResult<Memory>>;
  list(): Promise<MemoryUseCaseResult<Memory[]>>;
  update(input: unknown): Promise<MemoryUseCaseResult<Memory>>;
  delete(id: unknown): Promise<MemoryUseCaseResult<void>>;
}
