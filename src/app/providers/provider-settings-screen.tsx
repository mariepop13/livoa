"use client";

import { useEffect, useState, type FormEvent } from "react";

import {
  isProviderSettingsValidationError,
  ProviderSettingsService,
  type ProviderConfigurationValidationIssue,
  type ProviderSettingsSnapshot,
} from "@/application/providers/provider-settings";
import { createBrowserProviderSettingsService } from "./browser-provider-settings";

type ProviderDraft = {
  id: string;
  providerId: string;
  baseUrl: string;
  selectedModelId: string;
  enabled: boolean;
  credential: string;
};

type ProviderSettingsScreenProps = Readonly<{
  service?: ProviderSettingsService;
}>;

const emptyDraft: ProviderDraft = {
  id: "",
  providerId: "",
  baseUrl: "",
  selectedModelId: "",
  enabled: true,
  credential: "",
};

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

function getErrorMessage(error: Error): string {
  return error.message;
}

export default function ProviderSettingsScreen({
  service,
}: ProviderSettingsScreenProps) {
  const [activeService] = useState<ProviderSettingsService | undefined>(() => {
    if (service !== undefined || typeof window === "undefined") {
      return service;
    }

    return createBrowserProviderSettingsService();
  });
  const [snapshot, setSnapshot] = useState<ProviderSettingsSnapshot>();
  const [draft, setDraft] = useState<ProviderDraft>(emptyDraft);
  const [validationIssues, setValidationIssues] = useState<
    readonly ProviderConfigurationValidationIssue[]
  >([]);
  const [statusMessage, setStatusMessage] = useState<string>();
  const [screenError, setScreenError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRemovingCredential, setIsRemovingCredential] = useState<string>();
  const [editingId, setEditingId] = useState<string>();

  useEffect(() => {
    if (activeService === undefined) {
      return;
    }

    let isCurrent = true;

    void activeService.load().then((result) => {
      if (!isCurrent) {
        return;
      }

      if (!result.ok) {
        setScreenError(getErrorMessage(result.error));
        return;
      }

      setSnapshot(result.data);
    });

    return () => {
      isCurrent = false;
    };
  }, [activeService]);

  function updateDraft<Key extends keyof ProviderDraft>(
    key: Key,
    value: ProviderDraft[Key],
  ): void {
    setDraft((current) => ({ ...current, [key]: value }));
    setValidationIssues([]);
    setStatusMessage(undefined);
  }

  function startNewConfiguration(): void {
    setEditingId(undefined);
    setDraft(emptyDraft);
    setValidationIssues([]);
    setStatusMessage(undefined);
  }

  function startEditing(providerId: string): void {
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

    if (activeService === undefined) {
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
    setDraft(emptyDraft);
    setEditingId(undefined);
    setStatusMessage("Provider configuration saved.");
    setIsSubmitting(false);
  }

  async function handleRemoveCredential(providerId: string) {
    if (activeService === undefined) {
      return;
    }

    setIsRemovingCredential(providerId);
    setStatusMessage(undefined);
    setScreenError(undefined);

    const result = await activeService.removeCredential(providerId);

    if (!result.ok) {
      setScreenError(getErrorMessage(result.error));
      setIsRemovingCredential(undefined);
      return;
    }

    setSnapshot(result.data);
    setStatusMessage("Saved credential removed.");
    setIsRemovingCredential(undefined);
  }

  function fieldError(
    field: ProviderConfigurationValidationIssue["field"],
  ): string | undefined {
    return validationIssues.find((issue) => issue.field === field)?.message;
  }

  if (activeService === undefined || snapshot === undefined) {
    return (
      <main className="mx-auto w-full max-w-4xl p-6 sm:p-10" aria-busy="true">
        <h1 className="text-3xl font-semibold tracking-tight">
          Provider settings
        </h1>
        {screenError !== undefined ? (
          <p
            className="mt-4 rounded-md border border-red-300 bg-red-50 p-4 text-red-900"
            role="alert"
          >
            {screenError}
          </p>
        ) : (
          <p className="mt-4" role="status">
            Loading local provider settings…
          </p>
        )}
      </main>
    );
  }

  return (
    <main
      className="mx-auto w-full max-w-4xl p-6 sm:p-10"
      aria-labelledby="provider-settings-title"
    >
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-600">
          Local-first configuration
        </p>
        <h1
          id="provider-settings-title"
          className="mt-2 text-3xl font-semibold tracking-tight"
        >
          Provider settings
        </h1>
        <p className="mt-3 max-w-2xl text-slate-700">
          Configure provider metadata and the model used for local
          conversations. Settings stay on this device.
        </p>
      </header>

      {screenError !== undefined ? (
        <p
          className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-red-900"
          role="alert"
        >
          {screenError}
        </p>
      ) : null}

      {statusMessage !== undefined ? (
        <p
          className="mt-6 rounded-md border border-green-300 bg-green-50 p-4 text-green-900"
          role="status"
          aria-live="polite"
        >
          {statusMessage}
        </p>
      ) : null}

      <section
        className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        aria-labelledby="provider-form-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="provider-form-title" className="text-xl font-semibold">
            {editingId === undefined
              ? "Add provider configuration"
              : `Edit ${editingId}`}
          </h2>
          {editingId !== undefined ? (
            <button
              type="button"
              className="rounded-md border border-slate-400 px-3 py-2 text-sm font-medium hover:bg-slate-50"
              onClick={startNewConfiguration}
            >
              Add another provider
            </button>
          ) : null}
        </div>

        {validationIssues.length > 0 ? (
          <div
            className="mt-5 rounded-md border border-red-300 bg-red-50 p-4 text-red-900"
            role="alert"
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

        <form className="mt-6 space-y-6" onSubmit={handleSubmit} noValidate>
          <fieldset className="space-y-5">
            <legend className="text-base font-semibold">
              Provider metadata
            </legend>
            <div>
              <label
                className="block text-sm font-medium"
                htmlFor="provider-configuration-id"
              >
                Configuration ID
              </label>
              <p
                id="provider-configuration-id-help"
                className="mt-1 text-sm text-slate-600"
              >
                A local name used to identify this configuration.
              </p>
              <input
                id="provider-configuration-id"
                name="id"
                className="mt-2 w-full rounded-md border border-slate-400 px-3 py-2"
                value={draft.id}
                onChange={(event) => updateDraft("id", event.target.value)}
                aria-describedby="provider-configuration-id-help provider-configuration-id-error"
                aria-invalid={fieldError("id") !== undefined}
              />
              {fieldError("id") !== undefined ? (
                <p
                  id="provider-configuration-id-error"
                  className="mt-1 text-sm text-red-700"
                >
                  {fieldError("id")}
                </p>
              ) : null}
            </div>

            <div>
              <label
                className="block text-sm font-medium"
                htmlFor="provider-id"
              >
                Provider ID
              </label>
              <p id="provider-id-help" className="mt-1 text-sm text-slate-600">
                The adapter identifier that will handle this provider.
              </p>
              <input
                id="provider-id"
                name="providerId"
                className="mt-2 w-full rounded-md border border-slate-400 px-3 py-2"
                value={draft.providerId}
                onChange={(event) =>
                  updateDraft("providerId", event.target.value)
                }
                aria-describedby="provider-id-help provider-id-error"
                aria-invalid={fieldError("providerId") !== undefined}
              />
              {fieldError("providerId") !== undefined ? (
                <p id="provider-id-error" className="mt-1 text-sm text-red-700">
                  {fieldError("providerId")}
                </p>
              ) : null}
            </div>

            <div>
              <label
                className="block text-sm font-medium"
                htmlFor="provider-base-url"
              >
                Base URL{" "}
                <span className="font-normal text-slate-600">(optional)</span>
              </label>
              <input
                id="provider-base-url"
                name="baseUrl"
                type="url"
                className="mt-2 w-full rounded-md border border-slate-400 px-3 py-2"
                value={draft.baseUrl}
                onChange={(event) => updateDraft("baseUrl", event.target.value)}
                aria-describedby="provider-base-url-help provider-base-url-error"
                aria-invalid={fieldError("baseUrl") !== undefined}
              />
              <p
                id="provider-base-url-help"
                className="mt-1 text-sm text-slate-600"
              >
                Use an HTTP or HTTPS URL. Do not put credentials in the URL.
              </p>
              {fieldError("baseUrl") !== undefined ? (
                <p
                  id="provider-base-url-error"
                  className="mt-1 text-sm text-red-700"
                >
                  {fieldError("baseUrl")}
                </p>
              ) : null}
            </div>

            <div>
              <label
                className="block text-sm font-medium"
                htmlFor="provider-model-id"
              >
                Selected model ID{" "}
                <span className="font-normal text-slate-600">(optional)</span>
              </label>
              <input
                id="provider-model-id"
                name="selectedModelId"
                className="mt-2 w-full rounded-md border border-slate-400 px-3 py-2"
                value={draft.selectedModelId}
                onChange={(event) =>
                  updateDraft("selectedModelId", event.target.value)
                }
                aria-describedby="provider-model-id-error"
                aria-invalid={fieldError("selectedModelId") !== undefined}
              />
              {fieldError("selectedModelId") !== undefined ? (
                <p
                  id="provider-model-id-error"
                  className="mt-1 text-sm text-red-700"
                >
                  {fieldError("selectedModelId")}
                </p>
              ) : null}
            </div>

            <div className="flex items-start gap-3">
              <input
                id="provider-enabled"
                name="enabled"
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={draft.enabled}
                onChange={(event) =>
                  updateDraft("enabled", event.target.checked)
                }
                aria-describedby="provider-enabled-help"
              />
              <div>
                <label className="font-medium" htmlFor="provider-enabled">
                  Enabled
                </label>
                <p
                  id="provider-enabled-help"
                  className="text-sm text-slate-600"
                >
                  Allow this provider to be used for future conversations.
                </p>
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-slate-200 pt-6">
            <legend className="text-base font-semibold">BYOK credential</legend>
            <p id="provider-credential-help" className="text-sm text-slate-600">
              Optional. The credential is stored separately and will never be
              shown again.
            </p>
            <label
              className="block text-sm font-medium"
              htmlFor="provider-credential"
            >
              New BYOK credential
            </label>
            <input
              id="provider-credential"
              name="credential"
              type="password"
              autoComplete="new-password"
              className="w-full rounded-md border border-slate-400 px-3 py-2"
              value={draft.credential}
              onChange={(event) =>
                updateDraft("credential", event.target.value)
              }
              aria-describedby="provider-credential-help provider-credential-error"
              aria-invalid={fieldError("credential") !== undefined}
            />
            {fieldError("credential") !== undefined ? (
              <p
                id="provider-credential-error"
                className="text-sm text-red-700"
              >
                {fieldError("credential")}
              </p>
            ) : null}
          </fieldset>

          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving…" : "Save provider configuration"}
          </button>
        </form>
      </section>

      <section className="mt-8" aria-labelledby="saved-providers-title">
        <h2 id="saved-providers-title" className="text-xl font-semibold">
          Saved providers
        </h2>
        {snapshot.settings.providers.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-slate-300 p-5 text-slate-700">
            No provider configurations saved yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {snapshot.settings.providers.map((provider) => (
              <li
                key={provider.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">{provider.id}</h3>
                    <p className="mt-1 text-sm text-slate-700">
                      Provider ID: {provider.providerId}
                    </p>
                    <p className="text-sm text-slate-700">
                      Model: {provider.selectedModelId ?? "Not selected"}
                    </p>
                    <p className="text-sm text-slate-700">
                      Status: {provider.enabled ? "Enabled" : "Disabled"}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      Credential:{" "}
                      {snapshot.credentialStatus[provider.id]
                        ? "Saved and hidden"
                        : "Not saved"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-slate-400 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                      onClick={() => startEditing(provider.id)}
                    >
                      Edit {provider.id}
                    </button>
                    {snapshot.credentialStatus[provider.id] ? (
                      <button
                        type="button"
                        className="rounded-md border border-red-400 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() =>
                          handleRemoveCredential(provider.providerId)
                        }
                        disabled={isRemovingCredential === provider.providerId}
                      >
                        {isRemovingCredential === provider.providerId
                          ? "Removing…"
                          : "Remove saved credential"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
