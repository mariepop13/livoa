import { z } from "zod";

import {
  appSettingsSchema,
  providerConfigurationSchema,
  type AppSettings,
  type ProviderConfiguration,
} from "@/domain/models";
import type {
  CredentialReference,
  CredentialStore,
  SettingsRepository,
} from "@/domain/ports";
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

const providerConfigurationReferenceSchema = z.object({
  configurationId: requiredText,
  providerId: requiredText,
});

const deletionCredentialFailureMessage =
  "The provider configuration could not be deleted because its local credential could not be removed.";
const deletionSettingsFailureMessage =
  "The local credential was removed, but the provider configuration could not be deleted from local settings. It remains saved without a credential. Try again.";

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
  legacyCredentialProviderIds: readonly string[];
}>;

export type ProviderSettingsLoadOptions = Readonly<{
  migrateLegacyCredentials?: boolean;
}>;

type CredentialState = Readonly<{
  status: Readonly<Record<string, boolean>>;
  legacyProviderIds: readonly string[];
}>;

const defaultSettings: AppSettings = {
  theme: "system",
  providers: [],
  memoryExtractionEnabled: false,
  memoryContextEnabled: false,
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

let providerSettingsMutationQueue: Promise<void> = Promise.resolve();

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

  public async load(
    options: ProviderSettingsLoadOptions = {},
  ): Promise<ProviderSettingsResult<ProviderSettingsSnapshot>> {
    if (options.migrateLegacyCredentials === false) {
      return this.#load(options);
    }

    return this.#runMutation(() => this.#load(options));
  }

  async #load(
    options: ProviderSettingsLoadOptions,
  ): Promise<ProviderSettingsResult<ProviderSettingsSnapshot>> {
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

    const credentialStateResult = await this.#readCredentialState(
      settingsResult.data.providers,
      options.migrateLegacyCredentials ?? true,
    );

    if (!credentialStateResult.ok) {
      return credentialStateResult;
    }

    return success({
      settings: settingsResult.data,
      credentialStatus: credentialStateResult.data.status,
      legacyCredentialProviderIds: credentialStateResult.data.legacyProviderIds,
    });
  }

  public async save(
    input: unknown,
  ): Promise<ProviderSettingsResult<ProviderSettingsSnapshot>> {
    return this.#runMutation(() => this.#save(input));
  }

  async #save(
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
          this.#credentialReference(configuration),
          inputResult.data.credential,
        );
      } catch (error: unknown) {
        return failure(normalizeCredentialError(error, "save"));
      }
    }

    return this.#load({});
  }

  public async removeCredential(
    reference: unknown,
  ): Promise<ProviderSettingsResult<ProviderSettingsSnapshot>> {
    return this.#runMutation(() => this.#removeCredential(reference));
  }

  async #removeCredential(
    reference: unknown,
  ): Promise<ProviderSettingsResult<ProviderSettingsSnapshot>> {
    const parsedReference =
      providerConfigurationReferenceSchema.safeParse(reference);

    if (!parsedReference.success) {
      return failure(
        new ProviderSettingsValidationError([
          { field: "form", message: validationMessages.form },
        ]),
      );
    }

    try {
      await this.#credentialStore.remove(parsedReference.data);
    } catch (error: unknown) {
      return failure(normalizeCredentialError(error, "remove"));
    }

    return this.#load({});
  }

  public async deleteConfiguration(
    reference: unknown,
  ): Promise<ProviderSettingsResult<ProviderSettingsSnapshot>> {
    return this.#runMutation(() => this.#deleteConfiguration(reference));
  }

  async #deleteConfiguration(
    reference: unknown,
  ): Promise<ProviderSettingsResult<ProviderSettingsSnapshot>> {
    const parsedReference =
      providerConfigurationReferenceSchema.safeParse(reference);

    if (!parsedReference.success) {
      return failure(
        new ProviderSettingsValidationError([
          { field: "form", message: validationMessages.form },
        ]),
      );
    }

    const settingsResult = await this.#readSettings();

    if (!settingsResult.ok) {
      return settingsResult;
    }

    const configuration = settingsResult.data.providers.find(
      (provider) =>
        provider.id === parsedReference.data.configurationId &&
        provider.providerId === parsedReference.data.providerId,
    );

    if (configuration === undefined) {
      return failure(
        new ProviderSettingsValidationError([
          { field: "form", message: validationMessages.form },
        ]),
      );
    }

    try {
      await this.#credentialStore.remove(
        this.#credentialReference(configuration),
      );
    } catch (error: unknown) {
      void error;
      return failure(
        new ApplicationError(
          "CREDENTIALS_ERROR",
          deletionCredentialFailureMessage,
        ),
      );
    }

    const nextSettings: AppSettings = {
      ...settingsResult.data,
      providers: settingsResult.data.providers.filter(
        (provider) =>
          provider.id !== configuration.id ||
          provider.providerId !== configuration.providerId,
      ),
    };

    try {
      await this.#settingsRepository.save(nextSettings);
    } catch (error: unknown) {
      void error;
      return failure(
        new ApplicationError("STORAGE_ERROR", deletionSettingsFailureMessage, {
          retryable: true,
        }),
      );
    }

    const credentialStateResult = await this.#readCredentialState(
      nextSettings.providers,
      false,
    );

    if (!credentialStateResult.ok) {
      return credentialStateResult;
    }

    return success({
      settings: nextSettings,
      credentialStatus: credentialStateResult.data.status,
      legacyCredentialProviderIds: credentialStateResult.data.legacyProviderIds,
    });
  }

  async #runMutation<Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const result = providerSettingsMutationQueue.then(operation, operation);

    providerSettingsMutationQueue = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  async #readSettings(): Promise<ProviderSettingsResult<AppSettings>> {
    try {
      return parseSettings(await this.#settingsRepository.get());
    } catch (error: unknown) {
      return failure(normalizeStorageError(error, "read"));
    }
  }

  async #readCredentialState(
    providers: readonly ProviderConfiguration[],
    migrateLegacy = true,
  ): Promise<ProviderSettingsResult<CredentialState>> {
    const entries: Array<readonly [string, boolean]> = [];
    const legacyProviderIds = new Set<string>();
    const providerConfigurationCounts = new Map<string, number>();

    for (const provider of providers) {
      providerConfigurationCounts.set(
        provider.providerId,
        (providerConfigurationCounts.get(provider.providerId) ?? 0) + 1,
      );
    }

    for (const provider of providers) {
      const reference = this.#credentialReference(provider);

      if (
        migrateLegacy &&
        providerConfigurationCounts.get(provider.providerId) === 1
      ) {
        try {
          await this.#credentialStore.migrateLegacy(reference);
        } catch (error: unknown) {
          return failure(normalizeCredentialError(error, "migrate"));
        }
      } else {
        try {
          if (await this.#credentialStore.hasLegacy(reference)) {
            legacyProviderIds.add(provider.providerId);
          }
        } catch (error: unknown) {
          return failure(normalizeCredentialError(error, "has"));
        }
      }

      try {
        entries.push([provider.id, await this.#credentialStore.has(reference)]);
      } catch (error: unknown) {
        return failure(normalizeCredentialError(error, "has"));
      }
    }

    return success({
      status: Object.fromEntries(entries),
      legacyProviderIds: [...legacyProviderIds],
    });
  }

  #credentialReference(provider: ProviderConfiguration): CredentialReference {
    return {
      configurationId: provider.id,
      providerId: provider.providerId,
    };
  }
}
