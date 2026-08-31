import { z } from "zod";

import { appSettingsSchema, type AppSettings } from "@/domain/models";
import type { SettingsRepository } from "@/domain/ports";
import {
  normalizeStorageError,
  type ApplicationError,
} from "@/application/error";

export const memorySettingsSchema = z.object({
  memoryExtractionEnabled: z.boolean(),
  memoryContextEnabled: z.boolean(),
});

export type MemorySettings = z.infer<typeof memorySettingsSchema>;
export type MemorySettingsResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ApplicationError };

const defaultSettings: AppSettings = {
  theme: "system",
  providers: [],
  memoryExtractionEnabled: false,
  memoryContextEnabled: false,
};

function success<T>(data: T): MemorySettingsResult<T> {
  return { ok: true, data };
}

function failure(
  error: unknown,
  operation: "read" | "write",
): MemorySettingsResult<never> {
  return { ok: false, error: normalizeStorageError(error, operation) };
}

export class MemorySettingsService {
  public constructor(private readonly repository: SettingsRepository) {}

  public async load(): Promise<MemorySettingsResult<MemorySettings>> {
    try {
      const parsed = appSettingsSchema.safeParse(
        (await this.repository.get()) ?? defaultSettings,
      );
      return parsed.success
        ? success(memorySettingsSchema.parse(parsed.data))
        : failure(parsed.error, "read");
    } catch (error: unknown) {
      return failure(error, "read");
    }
  }

  public async update(
    input: unknown,
  ): Promise<MemorySettingsResult<MemorySettings>> {
    const next = memorySettingsSchema.safeParse(input);
    if (!next.success) {
      return failure(next.error, "write");
    }

    try {
      const parsed = appSettingsSchema.safeParse(
        (await this.repository.get()) ?? defaultSettings,
      );
      if (!parsed.success) {
        return failure(parsed.error, "read");
      }
      await this.repository.save({ ...parsed.data, ...next.data });
      return success(next.data);
    } catch (error: unknown) {
      return failure(error, "write");
    }
  }
}
