"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import type {
  MemoryUseCaseError,
  MemoryValidationIssue,
} from "@/application/memories";
import type { Character, Memory } from "@/domain/models";

import {
  createBrowserMemoryServices,
  type BrowserMemoryServices,
} from "./browser-memory-service";

type MemoryDraft = { characterId: string; content: string };
type MemoryField = keyof MemoryDraft;
type MemoryFieldIssue = Readonly<{ field: MemoryField; message: string }>;
type MemoryManagementScreenProps = Readonly<{
  services?: BrowserMemoryServices;
}>;

const emptyDraft: MemoryDraft = { characterId: "", content: "" };
const fieldClassName =
  "mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-slate-100 shadow-sm outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/15 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/15";
const secondaryButtonClassName =
  "rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm font-semibold text-slate-100 shadow-sm transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-60";

function getFieldIssueMessage(field: MemoryField): string {
  if (field === "characterId") {
    return "Choose an existing character for this memory.";
  }

  return "Enter a memory between 1 and 2,000 characters.";
}

function isMemoryField(value: unknown): value is MemoryField {
  return value === "characterId" || value === "content";
}

function mapValidationIssues(
  issues: readonly MemoryValidationIssue[],
): readonly MemoryFieldIssue[] {
  const mappedIssues = new Map<MemoryField, MemoryFieldIssue>();

  for (const issue of issues) {
    if (isMemoryField(issue.path[0])) {
      mappedIssues.set(issue.path[0], {
        field: issue.path[0],
        message: getFieldIssueMessage(issue.path[0]),
      });
    }
  }

  return [...mappedIssues.values()];
}

function getErrorMessage(error: MemoryUseCaseError): string {
  switch (error.kind) {
    case "validation":
      return "The memory could not be processed. Check the form and try again.";
    case "not_found":
      return error.resource === "character"
        ? "The selected character no longer exists. Reload the character list and try again."
        : "This memory no longer exists. Reload the memory list and try again.";
    case "application":
      return error.error.message;
  }
}

function getUnexpectedErrorMessage(): string {
  return "Memories could not be loaded or saved. Try again.";
}

function characterName(
  characters: readonly Character[],
  characterId: string,
): string {
  return (
    characters.find((character) => character.id === characterId)?.name ??
    "Deleted character"
  );
}

function FieldError({
  id,
  message,
}: Readonly<{ id: string; message: string | undefined }>) {
  return message === undefined ? null : (
    <p id={id} className="mt-2 text-sm font-medium text-rose-300">
      {message}
    </p>
  );
}

export default function MemoryManagementScreen({
  services,
}: MemoryManagementScreenProps) {
  const [activeServices] = useState<BrowserMemoryServices | undefined>(() => {
    if (services !== undefined || typeof window === "undefined") {
      return services;
    }

    return createBrowserMemoryServices();
  });
  const [characters, setCharacters] = useState<readonly Character[]>();
  const [memories, setMemories] = useState<readonly Memory[]>();
  const [draft, setDraft] = useState<MemoryDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string>();
  const [fieldIssues, setFieldIssues] = useState<readonly MemoryFieldIssue[]>(
    [],
  );
  const [screenError, setScreenError] = useState<string>();
  const [statusMessage, setStatusMessage] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string>();
  const reloadVersionRef = useRef(0);

  const reload = useCallback(async (): Promise<void> => {
    if (activeServices === undefined) {
      return;
    }

    const reloadVersion = reloadVersionRef.current;
    setIsLoading(true);
    setScreenError(undefined);
    try {
      const [characterResult, memoryResult] = await Promise.all([
        activeServices.characters.list(),
        activeServices.memories.list(),
      ]);
      if (reloadVersion !== reloadVersionRef.current) {
        return;
      }
      if (!characterResult.ok) {
        setScreenError("Characters could not be loaded. Try again.");
        return;
      }
      if (!memoryResult.ok) {
        setScreenError(getErrorMessage(memoryResult.error));
        return;
      }
      setCharacters(characterResult.data);
      setMemories(memoryResult.data);
    } catch {
      if (reloadVersion === reloadVersionRef.current) {
        setScreenError(getUnexpectedErrorMessage());
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeServices]);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  useEffect(() => {
    const field = fieldIssues[0]?.field;
    if (field !== undefined) {
      document.getElementById(`memory-${field}`)?.focus();
    }
  }, [fieldIssues]);

  function updateDraft<Key extends MemoryField>(
    key: Key,
    value: MemoryDraft[Key],
  ): void {
    setDraft((current) => ({ ...current, [key]: value }));
    setFieldIssues([]);
    setScreenError(undefined);
    setStatusMessage(undefined);
  }

  function startCreating(): void {
    setDraft(emptyDraft);
    setEditingId(undefined);
    setFieldIssues([]);
    setScreenError(undefined);
    setStatusMessage(undefined);
  }

  function startEditing(memory: Memory): void {
    setDraft({ characterId: memory.characterId, content: memory.content });
    setEditingId(memory.id);
    setFieldIssues([]);
    setScreenError(undefined);
    setStatusMessage(undefined);
  }

  function fieldIssue(field: MemoryField): string | undefined {
    return fieldIssues.find((issue) => issue.field === field)?.message;
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (activeServices === undefined) {
      return;
    }

    setIsSubmitting(true);
    setFieldIssues([]);
    setScreenError(undefined);
    setStatusMessage(undefined);
    try {
      const result =
        editingId === undefined
          ? await activeServices.memories.create(draft)
          : await activeServices.memories.update({ id: editingId, ...draft });
      if (!result.ok) {
        if (result.error.kind === "validation") {
          setFieldIssues(mapValidationIssues(result.error.issues));
        } else if (
          result.error.kind === "not_found" &&
          result.error.resource === "character"
        ) {
          setFieldIssues([
            {
              field: "characterId",
              message: getFieldIssueMessage("characterId"),
            },
          ]);
        } else {
          setScreenError(getErrorMessage(result.error));
        }
        return;
      }
      reloadVersionRef.current += 1;

      setMemories((current) => {
        if (current === undefined) {
          return [result.data];
        }
        return editingId === undefined
          ? [...current, result.data]
          : current.map((memory) =>
              memory.id === result.data.id ? result.data : memory,
            );
      });
      setDraft(emptyDraft);
      setEditingId(undefined);
      setStatusMessage(
        editingId === undefined ? "Memory created." : "Memory updated.",
      );
    } catch {
      setScreenError(getUnexpectedErrorMessage());
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(memory: Memory): Promise<void> {
    if (
      activeServices === undefined ||
      isSubmitting ||
      deletingId !== undefined ||
      !window.confirm("Delete this memory? This cannot be undone.")
    ) {
      return;
    }

    setDeletingId(memory.id);
    setScreenError(undefined);
    setStatusMessage(undefined);
    try {
      const result = await activeServices.memories.delete(memory.id);
      if (!result.ok) {
        setScreenError(getErrorMessage(result.error));
        return;
      }
      reloadVersionRef.current += 1;
      setMemories((current) =>
        current?.filter((currentMemory) => currentMemory.id !== memory.id),
      );
      if (editingId === memory.id) {
        startCreating();
      }
      setStatusMessage("Memory deleted.");
    } catch {
      setScreenError("The memory could not be deleted. Try again.");
    } finally {
      setDeletingId(undefined);
    }
  }

  if (characters === undefined || memories === undefined) {
    return (
      <main
        className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-10"
        aria-labelledby="memories-loading-title"
        aria-busy={isLoading}
      >
        <div className="mx-auto max-w-5xl rounded-3xl border border-slate-800 bg-slate-900/70 p-6 sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
            Local-first collection
          </p>
          <h1
            id="memories-loading-title"
            className="mt-3 text-3xl font-bold tracking-tight"
          >
            Memories
          </h1>
          {screenError === undefined ? (
            <p className="mt-4 text-slate-300" role="status" aria-live="polite">
              Loading memories…
            </p>
          ) : (
            <div
              className="mt-6 rounded-xl border border-rose-400/40 bg-rose-950/40 p-4 text-rose-100"
              role="alert"
              aria-live="assertive"
            >
              <p>{screenError}</p>
              <button
                type="button"
                className={`mt-4 ${secondaryButtonClassName}`}
                onClick={() => void reload()}
                disabled={isLoading}
              >
                {isLoading ? "Reloading memories…" : "Reload memories"}
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-10"
      aria-labelledby="memories-title"
    >
      <div className="mx-auto max-w-5xl">
        <header className="rounded-3xl border border-slate-800 bg-gradient-to-br from-indigo-950 via-slate-900 to-cyan-950 px-6 py-8 sm:px-10 sm:py-11">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
            Character context
          </p>
          <h1
            id="memories-title"
            className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl"
          >
            Memories
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Save explicit notes for a character. Memories stay locally on this
            device.
          </p>
        </header>

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
              onClick={() => void reload()}
              disabled={isLoading}
            >
              {isLoading ? "Reloading memories…" : "Reload memories"}
            </button>
          </div>
        ) : null}
        {statusMessage !== undefined ? (
          <p
            className="mt-6 rounded-xl border border-emerald-400/35 bg-emerald-950/45 p-4 text-emerald-100"
            role="status"
            aria-live="polite"
          >
            {statusMessage}
          </p>
        ) : null}

        <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section
            className="rounded-3xl border border-slate-800 bg-slate-900/85 p-5 sm:p-8"
            aria-labelledby="memory-form-title"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                  {editingId === undefined ? "New note" : "Editing note"}
                </p>
                <h2
                  id="memory-form-title"
                  className="mt-2 text-2xl font-bold tracking-tight text-white"
                >
                  {editingId === undefined ? "Create a memory" : "Edit memory"}
                </h2>
              </div>
              {editingId !== undefined ? (
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  onClick={startCreating}
                  disabled={isSubmitting || deletingId !== undefined}
                >
                  Start a new memory
                </button>
              ) : null}
            </div>
            {fieldIssues.length > 0 ? (
              <div
                className="mt-6 rounded-xl border border-rose-400/40 bg-rose-950/40 p-4 text-rose-100"
                role="alert"
                aria-live="assertive"
                aria-labelledby="memory-form-errors"
              >
                <h3
                  id="memory-form-errors"
                  className="font-semibold text-rose-100"
                >
                  Please correct the highlighted fields.
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {fieldIssues.map((issue) => (
                    <li key={issue.field}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {characters.length === 0 ? (
              <div
                className="mt-6 rounded-xl border border-amber-300/40 bg-amber-950/30 p-4 text-amber-100"
                role="status"
              >
                Create a character before adding a memory.
              </div>
            ) : null}
            <form
              className="mt-8 space-y-6"
              onSubmit={(event) => void handleSubmit(event)}
              noValidate
              aria-describedby={
                fieldIssues.length > 0 ? "memory-form-errors" : undefined
              }
            >
              <div>
                <label
                  className="block text-sm font-semibold text-slate-100"
                  htmlFor="memory-characterId"
                >
                  Character
                </label>
                <p
                  id="memory-characterId-help"
                  className="mt-2 text-sm leading-6 text-slate-400"
                >
                  Choose the character this memory belongs to.
                </p>
                <select
                  id="memory-characterId"
                  name="characterId"
                  className={fieldClassName}
                  value={draft.characterId}
                  onChange={(event) =>
                    updateDraft("characterId", event.target.value)
                  }
                  aria-describedby={
                    [
                      "memory-characterId-help",
                      fieldIssue("characterId") === undefined
                        ? undefined
                        : "memory-characterId-error",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  aria-invalid={fieldIssue("characterId") !== undefined}
                  aria-required="true"
                  disabled={isSubmitting || characters.length === 0}
                >
                  <option value="">Choose a character</option>
                  {characters.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.name}
                    </option>
                  ))}
                </select>
                <FieldError
                  id="memory-characterId-error"
                  message={fieldIssue("characterId")}
                />
              </div>
              <div>
                <label
                  className="block text-sm font-semibold text-slate-100"
                  htmlFor="memory-content"
                >
                  Memory
                </label>
                <p
                  id="memory-content-help"
                  className="mt-2 text-sm leading-6 text-slate-400"
                >
                  Keep a concise local note of up to 2,000 characters.
                </p>
                <textarea
                  id="memory-content"
                  name="content"
                  className={`${fieldClassName} min-h-40 resize-y`}
                  value={draft.content}
                  onChange={(event) =>
                    updateDraft("content", event.target.value)
                  }
                  aria-describedby={
                    [
                      "memory-content-help",
                      fieldIssue("content") === undefined
                        ? undefined
                        : "memory-content-error",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  aria-invalid={fieldIssue("content") !== undefined}
                  aria-required="true"
                  disabled={isSubmitting}
                />
                <FieldError
                  id="memory-content-error"
                  message={fieldIssue("content")}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 pt-6">
                <p className="max-w-md text-sm leading-6 text-slate-400">
                  Each note belongs to one saved character.
                </p>
                <button
                  type="submit"
                  className="rounded-lg bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg transition hover:bg-cyan-200 focus:outline-none focus:ring-4 focus:ring-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting || characters.length === 0}
                >
                  {isSubmitting
                    ? "Saving…"
                    : editingId === undefined
                      ? "Create memory"
                      : "Save memory changes"}
                </button>
              </div>
            </form>
          </section>

          <section
            className="rounded-3xl border border-slate-800 bg-slate-900/85 p-5 sm:p-6 xl:sticky xl:top-8"
            aria-labelledby="saved-memories-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                  Your notes
                </p>
                <h2
                  id="saved-memories-title"
                  className="mt-2 text-2xl font-bold tracking-tight text-white"
                >
                  Saved memories
                </h2>
              </div>
              {memories.length > 0 ? (
                <p className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-semibold text-slate-300">
                  {memories.length} saved{" "}
                  {memories.length === 1 ? "memory" : "memories"}
                </p>
              ) : null}
            </div>
            {memories.length === 0 ? (
              <div
                className="mt-6 rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-5"
                aria-live="polite"
              >
                <p className="font-semibold text-slate-100">
                  No memories saved yet
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Add a local note for one of your characters.
                </p>
              </div>
            ) : (
              <ul className="mt-6 space-y-3" aria-label="Saved memories list">
                {memories.map((memory, index) => (
                  <li
                    key={memory.id}
                    className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
                  >
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">
                      {characterName(characters, memory.characterId)}
                    </p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">
                      {memory.content}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        className={secondaryButtonClassName}
                        onClick={() => startEditing(memory)}
                        disabled={isSubmitting || deletingId !== undefined}
                        aria-label={`Edit memory ${index + 1}: ${memory.content}`}
                      >
                        Edit memory
                      </button>
                      <button
                        type="button"
                        className={secondaryButtonClassName}
                        onClick={() => void handleDelete(memory)}
                        disabled={isSubmitting || deletingId !== undefined}
                        aria-label={`${deletingId === memory.id ? "Deleting" : "Delete"} memory ${index + 1}: ${memory.content}`}
                      >
                        {deletingId === memory.id
                          ? "Deleting…"
                          : "Delete memory"}
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
