"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  isProviderSettingsValidationError,
  ProviderSettingsService,
  type ProviderConfigurationValidationIssue,
  type ProviderSettingsSnapshot,
} from "@/application/providers/provider-settings";
import type { ProviderModelDiscoveryService } from "@/application/providers/provider-model-discovery";
import {
  OpenRouterOAuthService,
  type OpenRouterOAuthCallbackValues,
} from "@/application/providers/oauth/openrouter-oauth";
import {
  createBrowserOpenRouterOAuthService,
  createBrowserProviderModelDiscoveryService,
  createBrowserProviderSettingsService,
  openRouterConfigurationDefaults,
} from "./browser-provider-settings";
import OpenRouterOAuthSection, {
  type OpenRouterOAuthUiState,
} from "./openrouter-oauth-section";
import ProviderModelSelect from "./provider-model-select";
import { useProviderModelDiscovery } from "./use-provider-model-discovery";

type ProviderDraft = {
  id: string;
  providerId: string;
  baseUrl: string;
  selectedModelId: string;
  enabled: boolean;
  credential: string;
};

type ProviderSettingsScreenProps = Readonly<{
  modelDiscoveryService?: ProviderModelDiscoveryService;
  oauthService?: OpenRouterOAuthService;
  service?: ProviderSettingsService;
}>;

function createOpenRouterDraft(): ProviderDraft {
  return {
    ...openRouterConfigurationDefaults,
    id: "",
    selectedModelId: "",
    enabled: true,
    credential: "",
  };
}

const fieldClassName =
  "mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-slate-100 shadow-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/15 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/15";

const secondaryButtonClassName =
  "min-h-11 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm font-semibold text-slate-100 shadow-sm transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-60";

const primaryButtonClassName =
  "min-h-11 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-300/15 transition hover:bg-cyan-200 focus:outline-none focus:ring-4 focus:ring-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-60";

function draftFromProvider(
  provider: ProviderSettingsSnapshot["settings"]["providers"][number],
): ProviderDraft {
  return {
    id: provider.id,
    providerId: provider.providerId,
    baseUrl: provider.baseUrl ?? "",
    selectedModelId: provider.selectedModelId ?? "",
    enabled: provider.enabled,
    credential: "",
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Provider settings could not be loaded. Try again.";
}

function hasOpenRouterOAuthCallback(location: string): boolean {
  const url = new URL(location);
  return ["code", "error", "state"].some((parameter) =>
    url.searchParams.has(parameter),
  );
}

export default function ProviderSettingsScreen({
  modelDiscoveryService,
  oauthService,
  service,
}: ProviderSettingsScreenProps) {
  const [activeService] = useState<ProviderSettingsService | undefined>(() => {
    if (service !== undefined || typeof window === "undefined") {
      return service;
    }

    return createBrowserProviderSettingsService();
  });
  const [activeModelDiscoveryService] = useState<
    ProviderModelDiscoveryService | undefined
  >(() => {
    if (
      modelDiscoveryService !== undefined ||
      service !== undefined ||
      typeof window === "undefined"
    ) {
      return modelDiscoveryService;
    }

    return createBrowserProviderModelDiscoveryService();
  });
  const [activeOAuthService] = useState<OpenRouterOAuthService | undefined>(
    () => {
      if (
        oauthService !== undefined ||
        service !== undefined ||
        typeof window === "undefined"
      ) {
        return oauthService;
      }

      return createBrowserOpenRouterOAuthService();
    },
  );
  const [snapshot, setSnapshot] = useState<ProviderSettingsSnapshot>();
  const [draft, setDraft] = useState<ProviderDraft>(createOpenRouterDraft);
  const [validationIssues, setValidationIssues] = useState<
    readonly ProviderConfigurationValidationIssue[]
  >([]);
  const [statusMessage, setStatusMessage] = useState<string>();
  const [screenError, setScreenError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingConfiguration, setIsDeletingConfiguration] =
    useState<string>();
  const [isRemovingCredential, setIsRemovingCredential] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [oauthState, setOAuthState] = useState<OpenRouterOAuthUiState>(() =>
    typeof window !== "undefined" &&
    hasOpenRouterOAuthCallback(window.location.href)
      ? { status: "exchanging" }
      : { status: "idle" },
  );
  const oauthCallbackHandled = useRef(false);
  const savedProvidersHeadingRef = useRef<HTMLHeadingElement>(null);
  const modelDiscovery = useProviderModelDiscovery(activeModelDiscoveryService);
  const isProviderMutationPending =
    isSubmitting ||
    isDeletingConfiguration !== undefined ||
    isRemovingCredential !== undefined ||
    oauthState.status === "connecting" ||
    oauthState.status === "exchanging";

  useEffect(() => {
    if (activeService === undefined) {
      return;
    }

    let isCurrent = true;

    void activeService
      .load()
      .then((result) => {
        if (!isCurrent) {
          return;
        }

        if (!result.ok) {
          setScreenError(getErrorMessage(result.error));
          return;
        }

        setSnapshot(result.data);
        setScreenError(undefined);
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setScreenError(getErrorMessage(error));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeService]);

  useEffect(() => {
    if (
      activeOAuthService === undefined ||
      activeService === undefined ||
      typeof window === "undefined" ||
      oauthCallbackHandled.current
    ) {
      return;
    }

    const callbackUrl = new URL(window.location.href);

    if (!hasOpenRouterOAuthCallback(callbackUrl.href)) {
      return;
    }

    oauthCallbackHandled.current = true;
    const callbackValues: OpenRouterOAuthCallbackValues = {
      code: callbackUrl.searchParams.getAll("code"),
      error: callbackUrl.searchParams.getAll("error"),
      state: callbackUrl.searchParams.getAll("state"),
    };

    for (const parameter of ["code", "error", "error_description", "state"]) {
      callbackUrl.searchParams.delete(parameter);
    }

    window.history.replaceState(
      window.history.state,
      "",
      `${callbackUrl.pathname}${callbackUrl.search}${callbackUrl.hash}`,
    );

    void activeOAuthService.complete(callbackValues).then(async (result) => {
      if (!result.ok) {
        setOAuthState({
          status: result.error.code === "cancelled" ? "cancelled" : "error",
          message: result.error.message,
        });
        return;
      }

      const refreshedSettings = await activeService.load();

      if (refreshedSettings.ok) {
        setSnapshot(refreshedSettings.data);
      } else {
        setScreenError(getErrorMessage(refreshedSettings.error));
      }

      setOAuthState({
        status: "success",
        message: `OpenRouter connected for ${result.data.configurationId}. The credential is saved and hidden.`,
      });
    });
  }, [activeOAuthService, activeService]);

  function updateDraft<Key extends keyof ProviderDraft>(
    key: Key,
    value: ProviderDraft[Key],
  ): void {
    setDraft((current) => ({ ...current, [key]: value }));
    setValidationIssues([]);
    setStatusMessage(undefined);
  }

  function startNewConfiguration(): void {
    if (isProviderMutationPending) {
      return;
    }

    setEditingId(undefined);
    setDraft(createOpenRouterDraft());
    setValidationIssues([]);
    setStatusMessage(undefined);
  }

  function startEditing(providerId: string): void {
    if (isProviderMutationPending) {
      return;
    }

    const provider = snapshot?.settings.providers.find(
      (candidate) => candidate.id === providerId,
    );

    if (provider === undefined) {
      return;
    }

    setEditingId(provider.id);
    setDraft(draftFromProvider(provider));
    setValidationIssues([]);
    setStatusMessage(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (activeService === undefined || isProviderMutationPending) {
      return;
    }

    setIsSubmitting(true);
    setValidationIssues([]);
    setStatusMessage(undefined);
    setScreenError(undefined);

    const result = await activeService.save(draft);

    if (!result.ok) {
      if (isProviderSettingsValidationError(result.error)) {
        setValidationIssues(result.error.issues);
      } else {
        setScreenError(getErrorMessage(result.error));
      }

      setIsSubmitting(false);
      return;
    }

    setSnapshot(result.data);
    setDraft(createOpenRouterDraft());
    setEditingId(undefined);
    setStatusMessage("Provider configuration saved.");
    setIsSubmitting(false);
  }

  async function handleConnectOpenRouter(): Promise<void> {
    if (
      activeOAuthService === undefined ||
      activeService === undefined ||
      isProviderMutationPending
    ) {
      return;
    }

    setOAuthState({ status: "connecting" });
    setValidationIssues([]);
    setStatusMessage(undefined);
    setScreenError(undefined);

    const savedConfiguration = await activeService.save({
      ...draft,
      credential: "",
    });

    if (!savedConfiguration.ok) {
      if (isProviderSettingsValidationError(savedConfiguration.error)) {
        setValidationIssues(savedConfiguration.error.issues);
        setOAuthState({ status: "idle" });
      } else {
        setScreenError(getErrorMessage(savedConfiguration.error));
        setOAuthState({
          status: "error",
          message: savedConfiguration.error.message,
        });
      }
      return;
    }

    setSnapshot(savedConfiguration.data);
    const authorization = await activeOAuthService.begin({
      configurationId: draft.id,
      providerId: draft.providerId,
    });

    if (!authorization.ok) {
      setOAuthState({
        status: "error",
        message: authorization.error.message,
      });
      return;
    }

    window.location.assign(authorization.data.authorizationUrl);
  }

  async function handleRemoveCredential(
    configurationId: string,
    providerId: string,
  ) {
    if (activeService === undefined || isProviderMutationPending) {
      return;
    }

    setIsRemovingCredential(configurationId);
    setStatusMessage(undefined);
    setScreenError(undefined);

    const result = await activeService.removeCredential({
      configurationId,
      providerId,
    });

    if (!result.ok) {
      setScreenError(getErrorMessage(result.error));
      setIsRemovingCredential(undefined);
      return;
    }

    setSnapshot(result.data);
    setStatusMessage("Saved credential removed.");
    setIsRemovingCredential(undefined);
  }

  async function handleDeleteConfiguration(
    configurationId: string,
    providerId: string,
  ): Promise<void> {
    if (activeService === undefined || isProviderMutationPending) {
      return;
    }

    const confirmed = window.confirm(
      `Permanently delete provider configuration "${configurationId}" and its saved credential from this device? This local deletion does not revoke an OpenRouter key.`,
    );

    if (!confirmed) {
      setScreenError(undefined);
      setStatusMessage(
        `Deletion cancelled for ${configurationId}. No local data was changed.`,
      );
      return;
    }

    setIsDeletingConfiguration(configurationId);
    setStatusMessage(undefined);
    setScreenError(undefined);

    const result = await activeService.deleteConfiguration({
      configurationId,
      providerId,
    });

    if (!result.ok) {
      const refreshedSettings = await activeService.load({
        migrateLegacyCredentials: false,
      });

      if (refreshedSettings.ok) {
        setSnapshot(refreshedSettings.data);
      }

      setScreenError(getErrorMessage(result.error));
      setIsDeletingConfiguration(undefined);
      return;
    }

    setSnapshot(result.data);

    if (editingId === configurationId) {
      setEditingId(undefined);
      setDraft(createOpenRouterDraft());
      setValidationIssues([]);
    }

    savedProvidersHeadingRef.current?.focus();
    setStatusMessage(
      `Provider configuration ${configurationId} and its saved credential were deleted only from this device.`,
    );
    setIsDeletingConfiguration(undefined);
  }

  function fieldError(
    field: ProviderConfigurationValidationIssue["field"],
  ): string | undefined {
    return validationIssues.find((issue) => issue.field === field)?.message;
  }

  async function reloadSettings(): Promise<void> {
    if (activeService === undefined) {
      return;
    }

    setIsLoading(true);
    setScreenError(undefined);

    try {
      const result = await activeService.load();

      if (!result.ok) {
        setScreenError(getErrorMessage(result.error));
        return;
      }

      setSnapshot(result.data);
    } catch (error: unknown) {
      setScreenError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  if (activeService === undefined || snapshot === undefined) {
    return (
      <main
        className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-10"
        aria-labelledby="provider-settings-loading-title"
        aria-busy={isLoading}
      >
        <div className="mx-auto max-w-5xl rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40 sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
            Local-first configuration
          </p>
          <h1
            id="provider-settings-loading-title"
            className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Provider settings
          </h1>
          {screenError !== undefined ? (
            <div
              className="mt-6 rounded-xl border border-rose-400/40 bg-rose-950/40 p-4 text-rose-100"
              role="alert"
              aria-live="assertive"
            >
              <p>{screenError}</p>
              <button
                type="button"
                className={`mt-4 ${secondaryButtonClassName}`}
                onClick={() => void reloadSettings()}
                disabled={isLoading}
              >
                {isLoading ? "Reloading settings…" : "Reload settings"}
              </button>
            </div>
          ) : (
            <p className="mt-4 text-slate-300" role="status" aria-live="polite">
              Loading local provider settings…
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-10"
      aria-labelledby="provider-settings-title"
      aria-busy={isProviderMutationPending}
    >
      <header className="mx-auto max-w-5xl rounded-3xl border border-slate-800 bg-gradient-to-br from-indigo-950 via-slate-900 to-cyan-950 px-6 py-8 shadow-2xl shadow-slate-950/40 sm:px-10 sm:py-11">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
          Local-first configuration
        </p>
        <h1
          id="provider-settings-title"
          className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl"
        >
          Provider settings
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
          Configure provider metadata and the model used for local
          conversations. Settings stay on this device.
        </p>
      </header>

      {screenError !== undefined ? (
        <p
          className="mx-auto mt-6 max-w-5xl rounded-xl border border-rose-400/40 bg-rose-950/40 p-4 text-rose-100"
          role="alert"
          aria-live="assertive"
        >
          {screenError}
        </p>
      ) : null}

      {statusMessage !== undefined ? (
        <p
          className="mx-auto mt-6 max-w-5xl rounded-xl border border-emerald-400/35 bg-emerald-950/45 p-4 text-emerald-100"
          role="status"
          aria-live="polite"
        >
          {statusMessage}
        </p>
      ) : null}

      <section
        className="mx-auto mt-8 min-w-0 max-w-5xl rounded-3xl border border-slate-800 bg-slate-900/85 p-5 shadow-xl shadow-slate-950/25 sm:p-8"
        aria-labelledby="provider-form-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="provider-form-title"
            className="text-2xl font-bold tracking-tight text-white"
          >
            {editingId === undefined
              ? "Add provider configuration"
              : `Edit ${editingId}`}
          </h2>
          {editingId !== undefined ? (
            <button
              type="button"
              className={secondaryButtonClassName}
              onClick={startNewConfiguration}
              disabled={isProviderMutationPending}
            >
              Add another provider
            </button>
          ) : null}
        </div>

        {validationIssues.length > 0 ? (
          <div
            className="mt-5 rounded-xl border border-rose-400/40 bg-rose-950/40 p-4 text-rose-100"
            role="alert"
            aria-live="assertive"
            aria-labelledby="provider-form-errors"
          >
            <h3 id="provider-form-errors" className="font-semibold">
              Please correct the highlighted fields.
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {validationIssues.map((issue) => (
                <li key={issue.field}>{issue.message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <form
          className="mt-6 space-y-6"
          onSubmit={handleSubmit}
          noValidate
          aria-describedby={
            validationIssues.length > 0 ? "provider-form-errors" : undefined
          }
        >
          <fieldset className="contents" disabled={isProviderMutationPending}>
            <legend className="sr-only">Provider configuration controls</legend>
            <fieldset className="space-y-5">
              <legend className="text-base font-bold text-white">
                Provider metadata
              </legend>
              <div>
                <label
                  className="block text-sm font-semibold text-slate-100"
                  htmlFor="provider-configuration-id"
                >
                  Configuration ID
                </label>
                <p
                  id="provider-configuration-id-help"
                  className="mt-1 text-sm leading-6 text-slate-400"
                >
                  A local name used to identify this configuration.
                </p>
                <input
                  id="provider-configuration-id"
                  name="id"
                  className={fieldClassName}
                  value={draft.id}
                  onChange={(event) => updateDraft("id", event.target.value)}
                  required
                  aria-describedby={`provider-configuration-id-help${
                    fieldError("id") === undefined
                      ? ""
                      : " provider-configuration-id-error"
                  }`}
                  aria-required="true"
                  aria-invalid={fieldError("id") !== undefined}
                />
                {fieldError("id") !== undefined ? (
                  <p
                    id="provider-configuration-id-error"
                    className="mt-1 text-sm font-medium text-rose-300"
                  >
                    {fieldError("id")}
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  className="block text-sm font-semibold text-slate-100"
                  htmlFor="provider-id"
                >
                  Provider ID
                </label>
                <p
                  id="provider-id-help"
                  className="mt-1 text-sm leading-6 text-slate-400"
                >
                  OpenRouter uses the existing OpenAI-compatible adapter.
                </p>
                <input
                  id="provider-id"
                  name="providerId"
                  className={fieldClassName}
                  value={draft.providerId}
                  readOnly
                  required
                  aria-describedby={`provider-id-help${
                    fieldError("providerId") === undefined
                      ? ""
                      : " provider-id-error"
                  }`}
                  aria-required="true"
                  aria-invalid={fieldError("providerId") !== undefined}
                />
                {fieldError("providerId") !== undefined ? (
                  <p
                    id="provider-id-error"
                    className="mt-1 text-sm font-medium text-rose-300"
                  >
                    {fieldError("providerId")}
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  className="block text-sm font-semibold text-slate-100"
                  htmlFor="provider-base-url"
                >
                  OpenRouter base URL
                </label>
                <input
                  id="provider-base-url"
                  name="baseUrl"
                  type="url"
                  className={fieldClassName}
                  value={draft.baseUrl}
                  readOnly
                  aria-describedby={`provider-base-url-help${
                    fieldError("baseUrl") === undefined
                      ? ""
                      : " provider-base-url-error"
                  }`}
                  aria-invalid={fieldError("baseUrl") !== undefined}
                />
                <p
                  id="provider-base-url-help"
                  className="mt-1 text-sm leading-6 text-slate-400"
                >
                  Model discovery uses OpenRouter&apos;s public API. Credentials
                  are never placed in this URL.
                </p>
                {fieldError("baseUrl") !== undefined ? (
                  <p
                    id="provider-base-url-error"
                    className="mt-1 text-sm font-medium text-rose-300"
                  >
                    {fieldError("baseUrl")}
                  </p>
                ) : null}
              </div>

              <ProviderModelSelect
                error={fieldError("selectedModelId")}
                selectedModelId={draft.selectedModelId}
                state={modelDiscovery.state}
                onChange={(modelId) => updateDraft("selectedModelId", modelId)}
                onRefresh={() => void modelDiscovery.refresh()}
              />

              <div className="flex items-start gap-3">
                <input
                  id="provider-enabled"
                  name="enabled"
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-cyan-300"
                  checked={draft.enabled}
                  onChange={(event) =>
                    updateDraft("enabled", event.target.checked)
                  }
                  aria-describedby="provider-enabled-help"
                />
                <div>
                  <label
                    className="font-semibold text-slate-100"
                    htmlFor="provider-enabled"
                  >
                    Enabled
                  </label>
                  <p
                    id="provider-enabled-help"
                    className="text-sm leading-6 text-slate-400"
                  >
                    Allow this provider to be used for future conversations.
                  </p>
                </div>
              </div>
            </fieldset>

            <OpenRouterOAuthSection
              state={oauthState}
              onConnect={() => void handleConnectOpenRouter()}
            />

            <fieldset className="space-y-3 border-t border-slate-800 pt-6">
              <legend className="text-base font-bold text-white">
                BYOK credential
              </legend>
              <p
                id="provider-credential-help"
                className="text-sm leading-6 text-slate-400"
              >
                Required for chat. The credential is stored separately and will
                never be shown again. Public model discovery does not use it.
              </p>
              <label
                className="block text-sm font-semibold text-slate-100"
                htmlFor="provider-credential"
              >
                New BYOK credential
              </label>
              <input
                id="provider-credential"
                name="credential"
                type="password"
                autoComplete="new-password"
                className={fieldClassName}
                value={draft.credential}
                onChange={(event) =>
                  updateDraft("credential", event.target.value)
                }
                aria-describedby={`provider-credential-help${
                  fieldError("credential") === undefined
                    ? ""
                    : " provider-credential-error"
                }`}
                aria-invalid={fieldError("credential") !== undefined}
              />
              {fieldError("credential") !== undefined ? (
                <p
                  id="provider-credential-error"
                  className="text-sm font-medium text-rose-300"
                >
                  {fieldError("credential")}
                </p>
              ) : null}
            </fieldset>

            <button type="submit" className={primaryButtonClassName}>
              {isSubmitting ? "Saving…" : "Save provider configuration"}
            </button>
          </fieldset>
        </form>
      </section>

      <section
        className="mx-auto mt-8 min-w-0 max-w-5xl"
        aria-labelledby="saved-providers-title"
      >
        <h2
          id="saved-providers-title"
          ref={savedProvidersHeadingRef}
          tabIndex={-1}
          className="text-2xl font-bold tracking-tight text-white"
        >
          Saved providers
        </h2>
        {snapshot.settings.providers.length === 0 ? (
          <p
            className="mt-4 rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-5 text-slate-400"
            role="status"
            aria-live="polite"
          >
            No provider configurations saved yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-4" aria-label="Saved providers list">
            {snapshot.settings.providers.map((provider) => {
              const hasLegacyCredential =
                snapshot.legacyCredentialProviderIds.includes(
                  provider.providerId,
                );

              return (
                <li
                  key={provider.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/85 p-5 shadow-xl shadow-slate-950/20"
                >
                  <div>
                    <div>
                      <h3 className="text-lg font-bold text-white">
                        {provider.id}
                      </h3>
                      <p className="mt-1 text-sm text-slate-400">
                        Provider ID: {provider.providerId}
                      </p>
                      <p className="text-sm text-slate-400">
                        Model: {provider.selectedModelId ?? "Not selected"}
                      </p>
                      <p className="text-sm text-slate-400">
                        Status: {provider.enabled ? "Enabled" : "Disabled"}
                      </p>
                      <p className="mt-2 text-sm text-slate-300">
                        Credential:{" "}
                        {snapshot.credentialStatus[provider.id]
                          ? "Saved and hidden"
                          : hasLegacyCredential
                            ? "Needs reassignment"
                            : "Not saved"}
                      </p>
                      {hasLegacyCredential ? (
                        <p
                          className="mt-2 max-w-xl text-sm leading-6 text-amber-200"
                          role="status"
                        >
                          An older credential is shared across configurations.
                          Edit the intended configuration and save the
                          credential again to assign it only there.
                        </p>
                      ) : null}
                      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                        Deleting this configuration removes it and its saved
                        credential only from this device. It does not revoke an
                        OpenRouter key.
                      </p>
                    </div>
                    <div
                      className="mt-4 flex flex-wrap gap-2"
                      role="group"
                      aria-label={`Provider configuration actions for ${provider.id}`}
                    >
                      <button
                        type="button"
                        className={secondaryButtonClassName}
                        onClick={() => startEditing(provider.id)}
                        disabled={isProviderMutationPending}
                      >
                        Edit {provider.id}
                      </button>
                      {snapshot.credentialStatus[provider.id] ? (
                        <button
                          type="button"
                          className={`${secondaryButtonClassName} border-rose-400/50 text-rose-200 hover:border-rose-300 hover:bg-rose-950/40`}
                          onClick={() =>
                            handleRemoveCredential(
                              provider.id,
                              provider.providerId,
                            )
                          }
                          disabled={isProviderMutationPending}
                          aria-label={`Remove saved credential for ${provider.id}`}
                        >
                          {isRemovingCredential === provider.id
                            ? "Removing…"
                            : "Remove saved credential"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={`${secondaryButtonClassName} border-rose-400/50 text-rose-200 hover:border-rose-300 hover:bg-rose-950/40`}
                        onClick={() =>
                          void handleDeleteConfiguration(
                            provider.id,
                            provider.providerId,
                          )
                        }
                        disabled={isProviderMutationPending}
                        aria-label={
                          isDeletingConfiguration === provider.id
                            ? `Deleting provider configuration ${provider.id}`
                            : `Delete provider configuration ${provider.id}`
                        }
                      >
                        {isDeletingConfiguration === provider.id
                          ? "Deleting…"
                          : "Delete provider configuration"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
