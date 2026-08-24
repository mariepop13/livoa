"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";

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
  avatar: string;
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
  avatar: "",
};

const validationMessages: Record<CharacterValidationField, string> = {
  name: "Enter a character name between 1 and 120 characters.",
  description: "Enter a description of 2,000 characters or fewer.",
  personality: "Enter a personality description of 10,000 characters or fewer.",
  systemPrompt: "Enter a system prompt of 20,000 characters or fewer.",
  greeting: "Enter a greeting of 4,000 characters or fewer, or leave it blank.",
  avatar:
    "Enter an HTTP or HTTPS image URL without credentials, or leave it blank.",
  form: "Check the highlighted character fields.",
};

const avatarReferenceSchema = z
  .string()
  .trim()
  .max(2_048)
  .refine((value) => {
    if (value.length === 0) {
      return true;
    }

    const parsedUrl = z.url().safeParse(value);

    if (!parsedUrl.success) {
      return false;
    }

    const url = new URL(value);

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === ""
    );
  });

const fieldClassName =
  "mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-slate-100 shadow-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/15 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/15";

const secondaryButtonClassName =
  "rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm font-semibold text-slate-100 shadow-sm transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-60";

function draftFromCharacter(character: Character): CharacterDraft {
  return {
    name: character.name,
    description: character.description,
    personality: character.personality,
    systemPrompt: character.systemPrompt,
    greeting: character.greeting ?? "",
    avatar: getSafeAvatarReference(character.avatar) ?? "",
  };
}

function getSafeAvatarReference(value: unknown): string | undefined {
  const parsedAvatar = avatarReferenceSchema.safeParse(value ?? "");

  return parsedAvatar.success && parsedAvatar.data.length > 0
    ? parsedAvatar.data
    : undefined;
}

function CharacterAvatar({ character }: Readonly<{ character: Character }>) {
  const avatarReference = getSafeAvatarReference(character.avatar);

  if (avatarReference === undefined) {
    return (
      <div
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/10 text-xl font-bold text-cyan-200"
        aria-hidden="true"
      >
        {character.name.slice(0, 1).toUpperCase()}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Avatar hosts are user-provided and cannot be configured as static Next image sources.
    <img
      src={avatarReference}
      alt={`${character.name} avatar`}
      className="h-16 w-16 shrink-0 rounded-2xl object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}

function isCharacterField(value: unknown): value is CharacterField {
  return (
    value === "name" ||
    value === "description" ||
    value === "personality" ||
    value === "systemPrompt" ||
    value === "greeting" ||
    value === "avatar"
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
  const [isLoading, setIsLoading] = useState(true);

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
      const parsedAvatar = avatarReferenceSchema.safeParse(draft.avatar);

      if (!parsedAvatar.success) {
        setValidationIssues([
          { field: "avatar", message: validationMessages.avatar },
        ]);
        return;
      }

      const characterInput = {
        ...draft,
        avatar: parsedAvatar.data.length > 0 ? parsedAvatar.data : undefined,
      };
      const result =
        editingId === undefined
          ? await activeService.create(characterInput)
          : await activeService.update({ id: editingId, ...characterInput });

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

  useEffect(() => {
    const firstInvalidField = validationIssues.find(
      (issue) => issue.field !== "form",
    )?.field;

    if (firstInvalidField === undefined) {
      return;
    }

    const fieldId = `character-${firstInvalidField.replace("systemPrompt", "system-prompt")}`;
    document.getElementById(fieldId)?.focus();
  }, [validationIssues]);

  if (characters === undefined) {
    return (
      <main
        className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-10"
        aria-labelledby="characters-loading-title"
        aria-busy={isLoading}
      >
        <div className="mx-auto max-w-6xl rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/40 sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
            Character studio
          </p>
          <h1
            id="characters-loading-title"
            className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Characters
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
                onClick={() => void reloadCharacters()}
                disabled={isLoading}
              >
                {isLoading ? "Reloading characters…" : "Reload characters"}
              </button>
            </div>
          ) : (
            <p className="mt-4 text-slate-300" role="status" aria-live="polite">
              Loading characters…
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-10"
      aria-labelledby="characters-title"
    >
      <div className="mx-auto max-w-6xl">
        <header className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-indigo-950 via-slate-900 to-cyan-950 px-6 py-8 shadow-2xl shadow-slate-950/40 sm:px-10 sm:py-11">
          <div
            className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-indigo-400/10 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
              Local-first collection
            </p>
            <h1
              id="characters-title"
              className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl"
            >
              Build your cast.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
              Shape distinct voices for the conversations you want to have, all
              stored locally on this device.
            </p>
          </div>
        </header>

        {screenError !== undefined ? (
          <div
            className="mt-6 rounded-xl border border-rose-400/40 bg-rose-950/40 p-4 text-rose-100 shadow-lg shadow-rose-950/20"
            role="alert"
            aria-live="assertive"
          >
            <p>{screenError}</p>
            <button
              type="button"
              className={`mt-4 ${secondaryButtonClassName}`}
              onClick={() => void reloadCharacters()}
              disabled={isLoading}
            >
              {isLoading ? "Reloading characters…" : "Reload characters"}
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
            className="min-w-0 rounded-3xl border border-slate-800 bg-slate-900/85 p-5 shadow-xl shadow-slate-950/25 sm:p-8"
            aria-labelledby="character-form-title"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                  {editingId === undefined ? "New profile" : "Editing profile"}
                </p>
                <h2
                  id="character-form-title"
                  className="mt-2 text-2xl font-bold tracking-tight text-white"
                >
                  {editingId === undefined
                    ? "Create a character"
                    : "Edit character"}
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                  Give this character a recognizable identity and a clear voice.
                </p>
              </div>
              {editingId !== undefined ? (
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  onClick={startCreating}
                >
                  Start a new character
                </button>
              ) : null}
            </div>

            {validationIssues.length > 0 ? (
              <div
                className="mt-6 rounded-xl border border-rose-400/40 bg-rose-950/40 p-4 text-rose-100"
                role="alert"
                aria-live="assertive"
                aria-labelledby="character-form-errors"
              >
                <h3
                  id="character-form-errors"
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

            <form
              className="mt-8 space-y-8"
              onSubmit={handleSubmit}
              noValidate
              aria-describedby={
                validationIssues.length > 0
                  ? "character-form-errors"
                  : undefined
              }
            >
              <fieldset className="space-y-6">
                <legend className="text-base font-bold text-white">
                  Character details
                </legend>

                <div className="grid gap-6 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
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
                        className={`${fieldClassName} min-h-28 resize-y`}
                        value={value}
                        onChange={(event) =>
                          updateDraft("description", event.target.value)
                        }
                        aria-describedby={describedBy || undefined}
                        aria-invalid={invalid}
                      />
                    )}
                  </CharacterFieldControl>
                </div>
              </fieldset>

              <fieldset className="space-y-6 border-t border-slate-800 pt-8">
                <legend className="text-base font-bold text-white">
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
                      className={`${fieldClassName} min-h-32 resize-y`}
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
                      className={`${fieldClassName} min-h-40 resize-y`}
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
                      className={`${fieldClassName} min-h-24 resize-y`}
                      value={value}
                      onChange={(event) =>
                        updateDraft("greeting", event.target.value)
                      }
                      aria-describedby={describedBy || undefined}
                      aria-invalid={invalid}
                    />
                  )}
                </CharacterFieldControl>

                <CharacterFieldControl
                  id="character-avatar"
                  label="Avatar URL (optional)"
                  value={draft.avatar}
                  error={fieldError("avatar")}
                  helpText="Use an HTTP or HTTPS image URL without embedded credentials."
                >
                  {({ id, value, describedBy, invalid }) => (
                    <input
                      id={id}
                      name="avatar"
                      type="url"
                      className={fieldClassName}
                      value={value}
                      placeholder="https://example.com/avatar.png"
                      onChange={(event) =>
                        updateDraft("avatar", event.target.value)
                      }
                      aria-describedby={describedBy || undefined}
                      aria-invalid={invalid}
                    />
                  )}
                </CharacterFieldControl>
              </fieldset>

              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 pt-6">
                <p className="max-w-md text-sm leading-6 text-slate-400">
                  Your character data stays in this browser. You can refine it
                  any time from your collection.
                </p>
                <button
                  type="submit"
                  className="rounded-lg bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-300/15 transition hover:bg-cyan-200 focus:outline-none focus:ring-4 focus:ring-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? "Saving…"
                    : editingId === undefined
                      ? "Create character"
                      : "Save character changes"}
                </button>
              </div>
            </form>
          </section>

          <section
            className="min-w-0 rounded-3xl border border-slate-800 bg-slate-900/85 p-5 shadow-xl shadow-slate-950/25 sm:p-6 xl:sticky xl:top-8"
            aria-labelledby="saved-characters-title"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                  Your collection
                </p>
                <h2
                  id="saved-characters-title"
                  className="mt-2 text-2xl font-bold tracking-tight text-white"
                >
                  Saved characters
                </h2>
              </div>
              {characters.length > 0 ? (
                <p className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-semibold text-slate-300">
                  {characters.length} saved character
                  {characters.length === 1 ? "" : "s"}
                </p>
              ) : null}
            </div>

            {characters.length === 0 ? (
              <div
                className="mt-6 rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-5"
                aria-live="polite"
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-300/10 text-lg text-cyan-200"
                  aria-hidden="true"
                >
                  +
                </div>
                <p className="mt-4 font-semibold text-slate-100">
                  Start your cast
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  No characters saved yet. Create your first character above.
                </p>
              </div>
            ) : (
              <ul className="mt-6 space-y-3" aria-label="Saved characters list">
                {characters.map((character) => (
                  <li
                    key={character.id}
                    className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 transition hover:border-slate-600"
                  >
                    <div className="flex h-full flex-col justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <CharacterAvatar character={character} />
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold text-white">
                            {character.name}
                          </h3>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-400">
                            {character.description}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`${secondaryButtonClassName} self-start`}
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
        </div>
      </div>
    </main>
  );
}
