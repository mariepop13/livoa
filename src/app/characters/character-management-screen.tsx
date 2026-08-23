"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import {
  type CharacterApplicationService,
  type CharacterUseCaseError,
} from "@/application/characters";
import type { CharacterValidationIssue } from "@/application/characters/contracts";
import type { Character } from "@/domain/models";

import { createBrowserCharacterService } from "./browser-character-service";

type CharacterDraft = {
  name: string;
  description: string;
  personality: string;
  systemPrompt: string;
  greeting: string;
};

type CharacterManagementScreenProps = Readonly<{
  service?: CharacterApplicationService;
}>;

type CharacterField = keyof CharacterDraft;
type CharacterValidationField = CharacterField | "form";

type CharacterFieldIssue = Readonly<{
  field: CharacterValidationField;
  message: string;
}>;

const emptyDraft: CharacterDraft = {
  name: "",
  description: "",
  personality: "",
  systemPrompt: "",
  greeting: "",
};

const validationMessages: Record<CharacterValidationField, string> = {
  name: "Enter a character name between 1 and 120 characters.",
  description: "Enter a description of 2,000 characters or fewer.",
  personality: "Enter a personality description of 10,000 characters or fewer.",
  systemPrompt: "Enter a system prompt of 20,000 characters or fewer.",
  greeting: "Enter a greeting of 4,000 characters or fewer, or leave it blank.",
  form: "Check the highlighted character fields.",
};

function draftFromCharacter(character: Character): CharacterDraft {
  return {
    name: character.name,
    description: character.description,
    personality: character.personality,
    systemPrompt: character.systemPrompt,
    greeting: character.greeting ?? "",
  };
}

function isCharacterField(value: unknown): value is CharacterField {
  return (
    value === "name" ||
    value === "description" ||
    value === "personality" ||
    value === "systemPrompt" ||
    value === "greeting"
  );
}

function mapValidationIssue(
  issue: CharacterValidationIssue,
): CharacterFieldIssue {
  const field = isCharacterField(issue.path[0]) ? issue.path[0] : "form";

  return { field, message: validationMessages[field] };
}

function mapValidationIssues(
  issues: readonly CharacterValidationIssue[],
): readonly CharacterFieldIssue[] {
  const mappedIssues = issues.map(mapValidationIssue);
  const uniqueIssues = new Map<CharacterValidationField, CharacterFieldIssue>();

  for (const issue of mappedIssues) {
    uniqueIssues.set(issue.field, issue);
  }

  return [...uniqueIssues.values()];
}

function getErrorMessage(error: CharacterUseCaseError): string {
  switch (error.kind) {
    case "validation":
      return "The character data could not be processed. Check the form and try again.";
    case "not_found":
      return "This character no longer exists. Reload the character list and try again.";
    case "application":
      return error.error.message;
  }
}

function getUnexpectedErrorMessage(): string {
  return "Characters could not be loaded or saved. Try again.";
}

function CharacterFieldControl({
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
    <div>
      <label className="block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      {helpText !== undefined ? (
        <p id={helpId} className="mt-1 text-sm text-slate-600">
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
        <p id={errorId} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function CharacterManagementScreen({
  service,
}: CharacterManagementScreenProps) {
  const [activeService] = useState<CharacterApplicationService | undefined>(
    () => {
      if (service !== undefined || typeof window === "undefined") {
        return service;
      }

      return createBrowserCharacterService();
    },
  );
  const [characters, setCharacters] = useState<readonly Character[]>();
  const [draft, setDraft] = useState<CharacterDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string>();
  const [validationIssues, setValidationIssues] = useState<
    readonly CharacterFieldIssue[]
  >([]);
  const [statusMessage, setStatusMessage] = useState<string>();
  const [screenError, setScreenError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
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
          setIsLoading(false);
          return;
        }

        setCharacters(result.data);
        setScreenError(undefined);
        setIsLoading(false);
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }

        setScreenError(getUnexpectedErrorMessage());
        setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [activeService]);

  function updateDraft<Key extends CharacterField>(
    key: Key,
    value: CharacterDraft[Key],
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

  function startEditing(character: Character): void {
    setEditingId(character.id);
    setDraft(draftFromCharacter(character));
    setValidationIssues([]);
    setStatusMessage(undefined);
    setScreenError(undefined);
  }

  async function reloadCharacters(): Promise<void> {
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

      setCharacters(result.data);
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

      setCharacters((current) => {
        if (current === undefined) {
          return [result.data];
        }

        if (editingId === undefined) {
          return [...current, result.data];
        }

        return current.map((character) =>
          character.id === result.data.id ? result.data : character,
        );
      });
      setDraft(emptyDraft);
      setEditingId(undefined);
      setStatusMessage(
        editingId === undefined ? "Character created." : "Character updated.",
      );
    } catch {
      setScreenError(getUnexpectedErrorMessage());
    } finally {
      setIsSubmitting(false);
    }
  }

  function fieldError(field: CharacterField): string | undefined {
    return validationIssues.find((issue) => issue.field === field)?.message;
  }

  if (characters === undefined) {
    return (
      <main className="mx-auto w-full max-w-5xl p-6 sm:p-10" aria-busy="true">
        <h1 className="text-3xl font-semibold tracking-tight">Characters</h1>
        {screenError !== undefined ? (
          <div
            className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-red-900"
            role="alert"
          >
            <p>{screenError}</p>
            <button
              type="button"
              className="mt-3 rounded-md border border-red-500 px-3 py-2 text-sm font-medium hover:bg-red-100"
              onClick={() => void reloadCharacters()}
              disabled={isLoading}
            >
              {isLoading ? "Reloading characters…" : "Reload characters"}
            </button>
          </div>
        ) : (
          <p className="mt-4" role="status">
            Loading characters…
          </p>
        )}
      </main>
    );
  }

  return (
    <main
      className="mx-auto w-full max-w-5xl p-6 sm:p-10"
      aria-labelledby="characters-title"
    >
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-600">
          Local-first collection
        </p>
        <h1
          id="characters-title"
          className="mt-2 text-3xl font-semibold tracking-tight"
        >
          Characters
        </h1>
        <p className="mt-3 max-w-2xl text-slate-700">
          Create and refine the characters you want to bring into future local
          conversations.
        </p>
      </header>

      {screenError !== undefined ? (
        <div
          className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-red-900"
          role="alert"
        >
          <p>{screenError}</p>
          <button
            type="button"
            className="mt-3 rounded-md border border-red-500 px-3 py-2 text-sm font-medium hover:bg-red-100"
            onClick={() => void reloadCharacters()}
            disabled={isLoading}
          >
            {isLoading ? "Reloading characters…" : "Reload characters"}
          </button>
        </div>
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
        aria-labelledby="character-form-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="character-form-title" className="text-xl font-semibold">
            {editingId === undefined ? "Create a character" : "Edit character"}
          </h2>
          {editingId !== undefined ? (
            <button
              type="button"
              className="rounded-md border border-slate-400 px-3 py-2 text-sm font-medium hover:bg-slate-50"
              onClick={startCreating}
            >
              Start a new character
            </button>
          ) : null}
        </div>

        {validationIssues.length > 0 ? (
          <div
            className="mt-5 rounded-md border border-red-300 bg-red-50 p-4 text-red-900"
            role="alert"
            aria-labelledby="character-form-errors"
          >
            <h3 id="character-form-errors" className="font-semibold">
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
              Character details
            </legend>

            <CharacterFieldControl
              id="character-name"
              label="Name"
              value={draft.name}
              error={fieldError("name")}
              helpText="Use a clear name players can recognize."
            >
              {({ id, value, describedBy, invalid }) => (
                <input
                  id={id}
                  name="name"
                  className="mt-2 w-full rounded-md border border-slate-400 px-3 py-2"
                  value={value}
                  onChange={(event) => updateDraft("name", event.target.value)}
                  aria-describedby={describedBy || undefined}
                  aria-invalid={invalid}
                  aria-required="true"
                />
              )}
            </CharacterFieldControl>

            <CharacterFieldControl
              id="character-description"
              label="Description"
              value={draft.description}
              error={fieldError("description")}
              helpText="Summarize who this character is and what makes them distinct."
            >
              {({ id, value, describedBy, invalid }) => (
                <textarea
                  id={id}
                  name="description"
                  className="mt-2 min-h-24 w-full rounded-md border border-slate-400 px-3 py-2"
                  value={value}
                  onChange={(event) =>
                    updateDraft("description", event.target.value)
                  }
                  aria-describedby={describedBy || undefined}
                  aria-invalid={invalid}
                />
              )}
            </CharacterFieldControl>
          </fieldset>

          <fieldset className="space-y-5 border-t border-slate-200 pt-6">
            <legend className="text-base font-semibold">
              Conversation behavior
            </legend>

            <CharacterFieldControl
              id="character-personality"
              label="Personality"
              value={draft.personality}
              error={fieldError("personality")}
              helpText="Describe the traits, tone, and boundaries that should guide replies."
            >
              {({ id, value, describedBy, invalid }) => (
                <textarea
                  id={id}
                  name="personality"
                  className="mt-2 min-h-32 w-full rounded-md border border-slate-400 px-3 py-2"
                  value={value}
                  onChange={(event) =>
                    updateDraft("personality", event.target.value)
                  }
                  aria-describedby={describedBy || undefined}
                  aria-invalid={invalid}
                />
              )}
            </CharacterFieldControl>

            <CharacterFieldControl
              id="character-system-prompt"
              label="System prompt"
              value={draft.systemPrompt}
              error={fieldError("systemPrompt")}
              helpText="Set the instructions that establish this character's role."
            >
              {({ id, value, describedBy, invalid }) => (
                <textarea
                  id={id}
                  name="systemPrompt"
                  className="mt-2 min-h-40 w-full rounded-md border border-slate-400 px-3 py-2"
                  value={value}
                  onChange={(event) =>
                    updateDraft("systemPrompt", event.target.value)
                  }
                  aria-describedby={describedBy || undefined}
                  aria-invalid={invalid}
                />
              )}
            </CharacterFieldControl>

            <CharacterFieldControl
              id="character-greeting"
              label="Greeting (optional)"
              value={draft.greeting}
              error={fieldError("greeting")}
              helpText="Give new conversations an opening line, or leave this blank."
            >
              {({ id, value, describedBy, invalid }) => (
                <textarea
                  id={id}
                  name="greeting"
                  className="mt-2 min-h-24 w-full rounded-md border border-slate-400 px-3 py-2"
                  value={value}
                  onChange={(event) =>
                    updateDraft("greeting", event.target.value)
                  }
                  aria-describedby={describedBy || undefined}
                  aria-invalid={invalid}
                />
              )}
            </CharacterFieldControl>
          </fieldset>

          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? "Saving…"
              : editingId === undefined
                ? "Create character"
                : "Save character changes"}
          </button>
        </form>
      </section>

      <section className="mt-8" aria-labelledby="saved-characters-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-600">
              Your collection
            </p>
            <h2
              id="saved-characters-title"
              className="mt-1 text-xl font-semibold"
            >
              Saved characters
            </h2>
          </div>
          {characters.length > 0 ? (
            <p className="text-sm text-slate-600">
              {characters.length} saved character
              {characters.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>

        {characters.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-slate-300 p-5 text-slate-700">
            No characters saved yet. Create your first character above.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {characters.map((character) => (
              <li
                key={character.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex h-full flex-col justify-between gap-5">
                  <div>
                    <h3 className="text-lg font-semibold">{character.name}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                      {character.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="self-start rounded-md border border-slate-400 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                    onClick={() => startEditing(character)}
                  >
                    Edit {character.name}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
