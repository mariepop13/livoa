import { z } from "zod";

import {
  appSettingsSchema,
  providerConfigurationSchema,
  type AppSettings,
  type ProviderConfiguration,
} from "@/domain/models";
import type { CredentialStore, SettingsRepository } from "@/domain/ports";
import {
  ApplicationError,
  normalizeCredentialError,
  normalizeStorageError,
} from "@/application/error";

const httpUrlSchema = z.url().refine(
  (value) => {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === ""
    );
  },
  { message: "Enter an HTTP or HTTPS URL without embedded credentials." },
);

const requiredText = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().min(1),
);

const optionalText = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, z.string().min(1).optional());

const optionalUrl = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, httpUrlSchema.optional());

const optionalCredential = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .refine((value) => value.trim().length > 0)
    .optional(),
);

export const providerConfigurationInputSchema = z.object({
  id: requiredText,
  providerId: requiredText,
  baseUrl: optionalUrl,
  selectedModelId: optionalText,
  enabled: z.boolean(),
  credential: optionalCredential,
});

export type ProviderConfigurationInput = z.infer<
  typeof providerConfigurationInputSchema
>;

export type ProviderConfigurationValidationField =
  | "id"
  | "providerId"
  | "baseUrl"
  | "selectedModelId"
  | "enabled"
  | "credential"
  | "form";

export type ProviderConfigurationValidationIssue = Readonly<{
  field: ProviderConfigurationValidationField;
  message: string;
}>;

const validationMessages: Record<ProviderConfigurationValidationField, string> =
  {
    id: "Enter a configuration ID.",
    providerId: "Enter a provider ID.",
    baseUrl:
      "Enter a valid HTTP or HTTPS base URL without embedded credentials.",
    selectedModelId: "Enter a selected model ID or leave this field blank.",
    enabled: "Choose whether this provider is enabled.",
    credential: "Enter a credential or leave this field blank.",
    form: "Check the highlighted provider fields.",
  };

export class ProviderSettingsValidationError extends Error {
  public readonly code = "VALIDATION_ERROR" as const;

  public constructor(
    public readonly issues: readonly ProviderConfigurationValidationIssue[],
  ) {
    super(validationMessages.form);
    this.name = "ProviderSettingsValidationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type ProviderSettingsError =
  ApplicationError | ProviderSettingsValidationError;

export type ProviderSettingsResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ProviderSettingsError };

export type ProviderSettingsSnapshot = Readonly<{
  settings: AppSettings;
  credentialStatus: Readonly<Record<string, boolean>>;
}>;

const defaultSettings: AppSettings = {
  theme: "system",
  providers: [],
};

function success<T>(data: T): ProviderSettingsResult<T> {
  return { ok: true, data };
}

function failure(error: ProviderSettingsError): ProviderSettingsResult<never> {
  return { ok: false, error };
}

function issueField(value: unknown): ProviderConfigurationValidationField {
  if (
    value === "id" ||
    value === "providerId" ||
    value === "baseUrl" ||
    value === "selectedModelId" ||
    value === "enabled" ||
    value === "credential"
  ) {
    return value;
  }

  return "form";
}

function validationError(error: z.ZodError): ProviderSettingsValidationError {
  const fields = new Set<ProviderConfigurationValidationField>();

  for (const issue of error.issues) {
    fields.add(issueField(issue.path[0]));
  }

  const issues = [...fields].map((field) => ({
    field,
    message: validationMessages[field],
  }));

  return new ProviderSettingsValidationError(
    issues.length > 0
      ? issues
      : [{ field: "form", message: validationMessages.form }],
  );
}

function validateInput(
  input: unknown,
): ProviderSettingsResult<ProviderConfigurationInput> {
  const parsed = providerConfigurationInputSchema.safeParse(input);

  return parsed.success
    ? success(parsed.data)
    : failure(validationError(parsed.error));
}

function parseSettings(
  settings: AppSettings | null,
): ProviderSettingsResult<AppSettings> {
  const parsed = appSettingsSchema.safeParse(settings ?? defaultSettings);

  return parsed.success
    ? success(parsed.data)
    : failure(normalizeStorageError(parsed.error, "read"));
}

function toProviderConfiguration(
  input: ProviderConfigurationInput,
): ProviderSettingsResult<ProviderConfiguration> {
  const parsed = providerConfigurationSchema.safeParse({
    id: input.id,
    providerId: input.providerId,
    baseUrl: input.baseUrl,
    selectedModelId: input.selectedModelId,
    enabled: input.enabled,
  });

  return parsed.success
    ? success(parsed.data)
    : failure(validationError(parsed.error));
}

export function isProviderSettingsValidationError(
  error: ProviderSettingsError,
): error is ProviderSettingsValidationError {
  return error instanceof ProviderSettingsValidationError;
}

export class ProviderSettingsService {
  readonly #settingsRepository: SettingsRepository;
  readonly #credentialStore: CredentialStore;

  public constructor(
    settingsRepository: SettingsRepository,
    credentialStore: CredentialStore,
  ) {
    this.#settingsRepository = settingsRepository;
    this.#credentialStore = credentialStore;
  }

  public async load(): Promise<
    ProviderSettingsResult<ProviderSettingsSnapshot>
  > {
    let rawSettings: AppSettings | null;

    try {
      rawSettings = await this.#settingsRepository.get();
    } catch (error: unknown) {
      return failure(normalizeStorageError(error, "read"));
    }

    const settingsResult = parseSettings(rawSettings);

    if (!settingsResult.ok) {
      return settingsResult;
    }

    const credentialStatusResult = await this.#readCredentialStatus(
      settingsResult.data.providers,
    );

    if (!credentialStatusResult.ok) {
      return credentialStatusResult;
    }

    return success({
      settings: settingsResult.data,
      credentialStatus: credentialStatusResult.data,
    });
  }

  public async save(
    input: unknown,
  ): Promise<ProviderSettingsResult<ProviderSettingsSnapshot>> {
    const inputResult = validateInput(input);

    if (!inputResult.ok) {
      return inputResult;
    }

    const settingsResult = await this.#readSettings();

    if (!settingsResult.ok) {
      return settingsResult;
    }

    const configurationResult = toProviderConfiguration(inputResult.data);

    if (!configurationResult.ok) {
      return configurationResult;
    }

    const configuration = configurationResult.data;
    const providerIndex = settingsResult.data.providers.findIndex(
      (provider) => provider.id === configuration.id,
    );

    const providers = [...settingsResult.data.providers];

    if (providerIndex === -1) {
      providers.push(configuration);
    } else {
      providers[providerIndex] = configuration;
    }

    const nextSettings: AppSettings = {
      ...settingsResult.data,
      providers,
    };

    try {
      await this.#settingsRepository.save(nextSettings);
    } catch (error: unknown) {
      return failure(normalizeStorageError(error, "write"));
    }

    if (inputResult.data.credential !== undefined) {
      try {
        await this.#credentialStore.save(
          configuration.providerId,
          inputResult.data.credential,
        );
      } catch (error: unknown) {
        return failure(normalizeCredentialError(error, "save"));
      }
    }

    return this.load();
  }

  public async removeCredential(
    providerId: unknown,
  ): Promise<ProviderSettingsResult<ProviderSettingsSnapshot>> {
    const parsedProviderId = z.string().trim().min(1).safeParse(providerId);

    if (!parsedProviderId.success) {
      return failure(
        new ProviderSettingsValidationError([
          { field: "providerId", message: validationMessages.providerId },
        ]),
      );
    }

    try {
      await this.#credentialStore.remove(parsedProviderId.data);
    } catch (error: unknown) {
      return failure(normalizeCredentialError(error, "remove"));
    }

    return this.load();
  }

  async #readSettings(): Promise<ProviderSettingsResult<AppSettings>> {
    try {
      return parseSettings(await this.#settingsRepository.get());
    } catch (error: unknown) {
      return failure(normalizeStorageError(error, "read"));
    }
  }

  async #readCredentialStatus(
    providers: readonly ProviderConfiguration[],
  ): Promise<ProviderSettingsResult<Readonly<Record<string, boolean>>>> {
    const entries: Array<readonly [string, boolean]> = [];

    for (const provider of providers) {
      try {
        entries.push([
          provider.id,
          await this.#credentialStore.has(provider.providerId),
        ]);
      } catch (error: unknown) {
        return failure(normalizeCredentialError(error, "has"));
      }
    }

    return success(Object.fromEntries(entries));
  }
}
