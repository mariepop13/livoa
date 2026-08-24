"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import type {
  PersonaApplicationService,
  PersonaUseCaseError,
} from "@/application/personas";
import type { PersonaValidationIssue } from "@/application/personas/contracts";
import type { Persona } from "@/domain/models";

import { createBrowserPersonaService } from "./browser-persona-service";

type PersonaDraft = {
  name: string;
  description: string;
};

type PersonaManagementScreenProps = Readonly<{
  service?: PersonaApplicationService;
}>;

type PersonaField = keyof PersonaDraft;
type PersonaValidationField = PersonaField | "form";

type PersonaFieldIssue = Readonly<{
  field: PersonaValidationField;
  message: string;
}>;

const emptyDraft: PersonaDraft = {
  name: "",
  description: "",
};

const validationMessages: Record<PersonaValidationField, string> = {
  name: "Enter a persona name between 1 and 120 characters.",
  description: "Enter a description of 2,000 characters or fewer.",
  form: "Check the highlighted persona fields.",
};

const fieldClassName =
  "mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-slate-100 shadow-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/15 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/15";

const secondaryButtonClassName =
  "rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm font-semibold text-slate-100 shadow-sm transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-60";

function draftFromPersona(persona: Persona): PersonaDraft {
  return {
    name: persona.name,
    description: persona.description,
  };
}

function isPersonaField(value: unknown): value is PersonaField {
  return value === "name" || value === "description";
}

function mapValidationIssue(issue: PersonaValidationIssue): PersonaFieldIssue {
  const field = isPersonaField(issue.path[0]) ? issue.path[0] : "form";

  return { field, message: validationMessages[field] };
}

function mapValidationIssues(
  issues: readonly PersonaValidationIssue[],
): readonly PersonaFieldIssue[] {
  const uniqueIssues = new Map<PersonaValidationField, PersonaFieldIssue>();

  for (const issue of issues.map(mapValidationIssue)) {
    uniqueIssues.set(issue.field, issue);
  }

  return [...uniqueIssues.values()];
}

function getErrorMessage(error: PersonaUseCaseError): string {
  switch (error.kind) {
    case "validation":
      return "The persona data could not be processed. Check the form and try again.";
    case "not_found":
      return "This persona no longer exists. Reload the persona list and try again.";
    case "application":
      return error.error.message;
  }
}

function getUnexpectedErrorMessage(): string {
  return "Personas could not be loaded or saved. Try again.";
}

function PersonaFieldControl({
  id,
  label,
  value,
  error,
  helpText,
  children,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  error?: string;
  helpText?: string;
  children: (props: {
    id: string;
    value: string;
    describedBy: string;
    invalid: boolean;
  }) => ReactNode;
}>) {
  const helpId = helpText === undefined ? undefined : `${id}-help`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [helpId, errorId].filter(
    (value): value is string => value !== undefined,
  );

  return (
    <div className="space-y-2">
      <label
        className="block text-sm font-semibold text-slate-100"
        htmlFor={id}
      >
        {label}
      </label>
      {helpText !== undefined ? (
        <p id={helpId} className="text-sm leading-6 text-slate-400">
          {helpText}
        </p>
      ) : null}
      {children({
        id,
        value,
        describedBy: describedBy.join(" "),
        invalid: error !== undefined,
      })}
      {error !== undefined ? (
        <p id={errorId} className="text-sm font-medium text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function PersonaManagementScreen({
  service,
}: PersonaManagementScreenProps) {
  const [activeService] = useState<PersonaApplicationService | undefined>(
    () => {
      if (service !== undefined || typeof window === "undefined") {
        return service;
      }

      return createBrowserPersonaService();
    },
  );
  const [personas, setPersonas] = useState<readonly Persona[]>();
  const [draft, setDraft] = useState<PersonaDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string>();
  const [validationIssues, setValidationIssues] = useState<
    readonly PersonaFieldIssue[]
  >([]);
  const [statusMessage, setStatusMessage] = useState<string>();
  const [screenError, setScreenError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (activeService === undefined) {
      return;
    }

    let isCurrent = true;

    void activeService
      .list()
      .then((result) => {
        if (!isCurrent) {
          return;
        }

        if (!result.ok) {
          setScreenError(getErrorMessage(result.error));
          return;
        }

        setPersonas(result.data);
        setScreenError(undefined);
      })
      .catch(() => {
        if (isCurrent) {
          setScreenError(getUnexpectedErrorMessage());
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

  function updateDraft<Key extends PersonaField>(
    key: Key,
    value: PersonaDraft[Key],
  ): void {
    setDraft((current) => ({ ...current, [key]: value }));
    setValidationIssues([]);
    setStatusMessage(undefined);
    setScreenError(undefined);
  }

  function startCreating(): void {
    setEditingId(undefined);
    setDraft(emptyDraft);
    setValidationIssues([]);
    setStatusMessage(undefined);
    setScreenError(undefined);
  }

  function startEditing(persona: Persona): void {
    setEditingId(persona.id);
    setDraft(draftFromPersona(persona));
    setValidationIssues([]);
    setStatusMessage(undefined);
    setScreenError(undefined);
  }

  async function reloadPersonas(): Promise<void> {
    if (activeService === undefined) {
      return;
    }

    setIsLoading(true);
    setScreenError(undefined);

    try {
      const result = await activeService.list();
      if (!result.ok) {
        setScreenError(getErrorMessage(result.error));
        return;
      }

      setPersonas(result.data);
    } catch {
      setScreenError(getUnexpectedErrorMessage());
    } finally {
      setIsLoading(false);
    }
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

    try {
      const result =
        editingId === undefined
          ? await activeService.create(draft)
          : await activeService.update({ id: editingId, ...draft });

      if (!result.ok) {
        if (result.error.kind === "validation") {
          setValidationIssues(mapValidationIssues(result.error.issues));
        } else {
          setScreenError(getErrorMessage(result.error));
        }

        return;
      }

      setPersonas((current) => {
        if (current === undefined) {
          return [result.data];
        }

        if (editingId === undefined) {
          return [...current, result.data];
        }

        return current.map((persona) =>
          persona.id === result.data.id ? result.data : persona,
        );
      });
      setDraft(emptyDraft);
      setEditingId(undefined);
      setStatusMessage(
        editingId === undefined ? "Persona created." : "Persona updated.",
      );
    } catch {
      setScreenError(getUnexpectedErrorMessage());
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(persona: Persona): Promise<void> {
    if (
      activeService === undefined ||
      isSubmitting ||
      deletingId !== undefined
    ) {
      return;
    }

    setDeletingId(persona.id);
    setStatusMessage(undefined);
    setScreenError(undefined);

    try {
      const result = await activeService.delete(persona.id);
      if (!result.ok) {
        if (result.error.kind === "validation") {
          setValidationIssues(mapValidationIssues(result.error.issues));
        } else {
          setScreenError(getErrorMessage(result.error));
        }

        return;
      }

      setPersonas((current) =>
        current?.filter((currentPersona) => currentPersona.id !== persona.id),
      );
      if (editingId === persona.id) {
        setEditingId(undefined);
        setDraft(emptyDraft);
        setValidationIssues([]);
      }
      setStatusMessage("Persona deleted.");
    } catch {
      setScreenError("The persona could not be deleted. Try again.");
    } finally {
      setDeletingId(undefined);
    }
  }

  function fieldError(field: PersonaField): string | undefined {
    return validationIssues.find((issue) => issue.field === field)?.message;
  }

  if (personas === undefined) {
    return (
      <main
        className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-10"
        aria-busy="true"
      >
        <div className="mx-auto max-w-5xl rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/40 sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
            Local-first collection
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Personas
          </h1>
          {screenError !== undefined ? (
            <div
              className="mt-6 rounded-xl border border-rose-400/40 bg-rose-950/40 p-4 text-rose-100"
              role="alert"
            >
              <p>{screenError}</p>
              <button
                type="button"
                className={`mt-4 ${secondaryButtonClassName}`}
                onClick={() => void reloadPersonas()}
                disabled={isLoading}
              >
                {isLoading ? "Reloading personas…" : "Reload personas"}
              </button>
            </div>
          ) : (
            <p className="mt-4 text-slate-300" role="status">
              Loading personas…
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-10"
      aria-labelledby="personas-title"
    >
      <div className="mx-auto max-w-5xl">
        <header className="rounded-3xl border border-slate-800 bg-gradient-to-br from-indigo-950 via-slate-900 to-cyan-950 px-6 py-8 shadow-2xl shadow-slate-950/40 sm:px-10 sm:py-11">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
            Conversation identity
          </p>
          <h1
            id="personas-title"
            className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl"
          >
            Personas
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Save the voice you bring into a conversation. Persona details stay
            locally on this device.
          </p>
        </header>

        {screenError !== undefined ? (
          <div
            className="mt-6 rounded-xl border border-rose-400/40 bg-rose-950/40 p-4 text-rose-100 shadow-lg shadow-rose-950/20"
            role="alert"
          >
            <p>{screenError}</p>
            <button
              type="button"
              className={`mt-4 ${secondaryButtonClassName}`}
              onClick={() => void reloadPersonas()}
              disabled={isLoading}
            >
              {isLoading ? "Reloading personas…" : "Reload personas"}
            </button>
          </div>
        ) : null}

        {statusMessage !== undefined ? (
          <p
            className="mt-6 rounded-xl border border-emerald-400/35 bg-emerald-950/45 p-4 text-emerald-100 shadow-lg shadow-emerald-950/20"
            role="status"
            aria-live="polite"
          >
            {statusMessage}
          </p>
        ) : null}

        <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section
            className="rounded-3xl border border-slate-800 bg-slate-900/85 p-5 shadow-xl shadow-slate-950/25 sm:p-8"
            aria-labelledby="persona-form-title"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                  {editingId === undefined ? "New profile" : "Editing profile"}
                </p>
                <h2
                  id="persona-form-title"
                  className="mt-2 text-2xl font-bold tracking-tight text-white"
                >
                  {editingId === undefined
                    ? "Create a persona"
                    : "Edit persona"}
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                  Give your conversation a name and a little context.
                </p>
              </div>
              {editingId !== undefined ? (
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  onClick={startCreating}
                  disabled={isSubmitting || deletingId !== undefined}
                >
                  Start a new persona
                </button>
              ) : null}
            </div>

            {validationIssues.length > 0 ? (
              <div
                className="mt-6 rounded-xl border border-rose-400/40 bg-rose-950/40 p-4 text-rose-100"
                role="alert"
                aria-labelledby="persona-form-errors"
              >
                <h3
                  id="persona-form-errors"
                  className="font-semibold text-rose-100"
                >
                  Please correct the highlighted fields.
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {validationIssues.map((issue) => (
                    <li key={issue.field}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <form className="mt-8 space-y-8" onSubmit={handleSubmit} noValidate>
              <fieldset className="space-y-6">
                <legend className="text-base font-bold text-white">
                  Persona details
                </legend>
                <PersonaFieldControl
                  id="persona-name"
                  label="Name"
                  value={draft.name}
                  error={fieldError("name")}
                  helpText="Use a name you can recognize when starting a chat."
                >
                  {({ id, value, describedBy, invalid }) => (
                    <input
                      id={id}
                      name="name"
                      className={fieldClassName}
                      value={value}
                      onChange={(event) =>
                        updateDraft("name", event.target.value)
                      }
                      aria-describedby={describedBy || undefined}
                      aria-invalid={invalid}
                      aria-required="true"
                    />
                  )}
                </PersonaFieldControl>

                <PersonaFieldControl
                  id="persona-description"
                  label="Description"
                  value={draft.description}
                  error={fieldError("description")}
                  helpText="Add optional context that identifies this persona."
                >
                  {({ id, value, describedBy, invalid }) => (
                    <textarea
                      id={id}
                      name="description"
                      className={`${fieldClassName} min-h-32 resize-y`}
                      value={value}
                      onChange={(event) =>
                        updateDraft("description", event.target.value)
                      }
                      aria-describedby={describedBy || undefined}
                      aria-invalid={invalid}
                    />
                  )}
                </PersonaFieldControl>
              </fieldset>

              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 pt-6">
                <p className="max-w-md text-sm leading-6 text-slate-400">
                  You can edit or remove local personas at any time.
                </p>
                <button
                  type="submit"
                  className="rounded-lg bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-300/15 transition hover:bg-cyan-200 focus:outline-none focus:ring-4 focus:ring-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting || deletingId !== undefined}
                >
                  {isSubmitting
                    ? "Saving…"
                    : editingId === undefined
                      ? "Create persona"
                      : "Save persona changes"}
                </button>
              </div>
            </form>
          </section>

          <section
            className="rounded-3xl border border-slate-800 bg-slate-900/85 p-5 shadow-xl shadow-slate-950/25 sm:p-6 xl:sticky xl:top-8"
            aria-labelledby="saved-personas-title"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                  Your collection
                </p>
                <h2
                  id="saved-personas-title"
                  className="mt-2 text-2xl font-bold tracking-tight text-white"
                >
                  Saved personas
                </h2>
              </div>
              {personas.length > 0 ? (
                <p className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-semibold text-slate-300">
                  {personas.length} saved persona
                  {personas.length === 1 ? "" : "s"}
                </p>
              ) : null}
            </div>

            {personas.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-5">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-300/10 text-lg text-cyan-200"
                  aria-hidden="true"
                >
                  +
                </div>
                <p className="mt-4 font-semibold text-slate-100">
                  Start your collection
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  No personas saved yet. Create your first persona above.
                </p>
              </div>
            ) : (
              <ul className="mt-6 space-y-3">
                {personas.map((persona) => (
                  <li
                    key={persona.id}
                    className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 transition hover:border-slate-600"
                  >
                    <div className="flex h-full flex-col justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-bold text-white">
                          {persona.name}
                        </h3>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-400">
                          {persona.description || "No description provided."}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={secondaryButtonClassName}
                          onClick={() => startEditing(persona)}
                          disabled={isSubmitting || deletingId !== undefined}
                        >
                          Edit {persona.name}
                        </button>
                        <button
                          type="button"
                          className={`${secondaryButtonClassName} border-rose-400/50 text-rose-200 hover:border-rose-300 hover:bg-rose-950/40`}
                          onClick={() => void handleDelete(persona)}
                          disabled={isSubmitting || deletingId !== undefined}
                        >
                          {deletingId === persona.id
                            ? "Deleting…"
                            : `Delete ${persona.name}`}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
