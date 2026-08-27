"use client";

import Link from "next/link";
import { useState, type ChangeEvent } from "react";

import {
  MAX_BACKUP_IMPORT_SIZE,
  type BackupApplicationService,
  type BackupFile,
  type BackupPreview,
} from "@/application/backup";

import { createBrowserBackupService } from "./browser-backup-service";

type PendingImport = Readonly<{
  fileName: string;
  contents: string;
  preview: BackupPreview;
}>;

type BackupScreenProps = Readonly<{
  service?: BackupApplicationService;
  download?: (file: BackupFile) => void;
}>;

const primaryButtonClassName =
  "min-h-11 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-300/15 transition hover:bg-cyan-200 focus:outline-none focus:ring-4 focus:ring-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-60";

const secondaryButtonClassName =
  "min-h-11 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-100 shadow-sm transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-60";

function downloadInBrowser(file: BackupFile): void {
  const blob = new Blob([file.contents], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = file.fileName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function importFailureMessage(): string {
  return "Backup could not be imported. Your current data was not changed.";
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export default function BackupScreen({
  service,
  download = downloadInBrowser,
}: BackupScreenProps) {
  const [activeService] = useState<BackupApplicationService | undefined>(() => {
    if (service !== undefined || typeof window === "undefined") {
      return service;
    }

    return createBrowserBackupService();
  });
  const [pendingImport, setPendingImport] = useState<PendingImport>();
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [fileInputKey, setFileInputKey] = useState(0);

  async function handleExport(): Promise<void> {
    if (activeService === undefined) {
      return;
    }

    setIsExporting(true);
    setStatusMessage(undefined);
    setErrorMessage(undefined);

    try {
      const file = await activeService.createExport();
      download(file);
      setStatusMessage("Backup downloaded. Credentials were not included.");
    } catch {
      setErrorMessage("Backup could not be exported. Try again.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0];
    setPendingImport(undefined);
    setIsConfirmed(false);
    setStatusMessage(undefined);
    setErrorMessage(undefined);

    if (file === undefined || activeService === undefined) {
      return;
    }

    if (file.size > MAX_BACKUP_IMPORT_SIZE) {
      setErrorMessage("This backup file is too large. Choose a smaller file.");
      return;
    }

    try {
      const contents = await file.text();
      const result = activeService.inspectImport(contents);

      if (!result.ok) {
        setErrorMessage(result.error.message);
        return;
      }

      setPendingImport({ fileName: file.name, contents, preview: result.data });
    } catch {
      setErrorMessage(importFailureMessage());
    }
  }

  async function handleImport(): Promise<void> {
    if (
      activeService === undefined ||
      pendingImport === undefined ||
      !isConfirmed
    ) {
      return;
    }

    setIsImporting(true);
    setStatusMessage(undefined);
    setErrorMessage(undefined);

    try {
      const result = await activeService.importBackup(pendingImport.contents);

      if (!result.ok) {
        setErrorMessage(result.error.message);
        return;
      }

      setPendingImport(undefined);
      setIsConfirmed(false);
      setFileInputKey((current) => current + 1);
      setStatusMessage(
        "Backup imported. Your local Livoa data was replaced. Providers were disconnected; enter credentials again before using them.",
      );
    } catch {
      setErrorMessage(importFailureMessage());
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <main
      className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-10"
      aria-labelledby="backup-title"
      aria-busy={isExporting || isImporting}
    >
      <div className="mx-auto max-w-5xl">
        <header className="rounded-3xl border border-slate-800 bg-gradient-to-br from-indigo-950 via-slate-900 to-cyan-950 px-6 py-8 shadow-2xl shadow-slate-950/40 sm:px-10 sm:py-11">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
            Local data safety
          </p>
          <h1
            id="backup-title"
            className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl"
          >
            Back up and restore Livoa.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Download your characters, personas, conversations, messages, and
            settings as one local file, or restore them on this device.
            Credentials are never included. Importing a backup disconnects
            providers, so credentials must be entered again.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex text-sm font-semibold text-cyan-200 underline decoration-cyan-300/50 underline-offset-4 hover:text-cyan-100"
          >
            Back to Livoa home
          </Link>
        </header>

        {errorMessage !== undefined ? (
          <p
            className="mt-6 rounded-xl border border-rose-400/40 bg-rose-950/40 p-4 text-rose-100"
            role="alert"
            aria-live="assertive"
          >
            {errorMessage}
          </p>
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

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
          <section
            className="rounded-3xl border border-slate-800 bg-slate-900/85 p-6 shadow-xl shadow-slate-950/25 sm:p-8"
            aria-labelledby="export-title"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
              Save a copy
            </p>
            <h2
              id="export-title"
              className="mt-2 text-2xl font-bold tracking-tight text-white"
            >
              Export local data
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              The JSON file contains your Livoa content and provider settings.
              Stored BYOK credentials stay on this device.
            </p>
            <button
              type="button"
              className={`mt-6 ${primaryButtonClassName}`}
              onClick={() => void handleExport()}
              disabled={isExporting}
            >
              {isExporting ? "Preparing backup…" : "Download backup"}
            </button>
          </section>

          <section
            className="rounded-3xl border border-slate-800 bg-slate-900/85 p-6 shadow-xl shadow-slate-950/25 sm:p-8"
            aria-labelledby="import-title"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
              Replace local data
            </p>
            <h2
              id="import-title"
              className="mt-2 text-2xl font-bold tracking-tight text-white"
            >
              Import a backup
            </h2>
            <p
              id="backup-file-help"
              className="mt-3 text-sm leading-6 text-slate-400"
            >
              Choose a Livoa JSON backup. The file is fully validated before any
              local data is changed. Importing disconnects providers and removes
              saved credentials, so enter credentials again afterward.
            </p>
            <label
              htmlFor="backup-file"
              className="mt-6 block text-sm font-semibold text-slate-100"
            >
              Backup file
            </label>
            <input
              key={fileInputKey}
              id="backup-file"
              name="backup-file"
              type="file"
              accept="application/json,.json"
              className="mt-2 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-200 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-300 file:px-3 file:py-2 file:font-semibold file:text-slate-950"
              aria-describedby="backup-file-help"
              onChange={(event) => void handleFileChange(event)}
              disabled={isImporting}
            />

            {pendingImport !== undefined ? (
              <div
                className="mt-6 rounded-2xl border border-amber-300/35 bg-amber-950/25 p-5"
                aria-labelledby="import-confirmation-title"
              >
                <h3
                  id="import-confirmation-title"
                  className="text-lg font-bold text-amber-100"
                >
                  Confirm replacement
                </h3>
                <p className="mt-2 break-all text-sm text-slate-300">
                  Valid backup: {pendingImport.fileName}
                </p>
                <ul className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-300">
                  <li>
                    {formatCount(pendingImport.preview.characters, "character")}
                  </li>
                  <li>
                    {formatCount(pendingImport.preview.personas, "persona")}
                  </li>
                  <li>
                    {formatCount(
                      pendingImport.preview.conversations,
                      "conversation",
                    )}
                  </li>
                  <li>
                    {formatCount(pendingImport.preview.messages, "message")}
                  </li>
                  <li className="col-span-2">
                    Settings:{" "}
                    {pendingImport.preview.hasSettings ? "included" : "empty"}
                  </li>
                </ul>
                <div className="mt-5 flex items-start gap-3">
                  <input
                    id="confirm-backup-import"
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-cyan-300"
                    checked={isConfirmed}
                    onChange={(event) => setIsConfirmed(event.target.checked)}
                  />
                  <label
                    htmlFor="confirm-backup-import"
                    className="text-sm leading-6 text-slate-200"
                  >
                    I understand this replaces all current Livoa content and
                    settings, disconnects providers, and removes saved
                    credentials. I will need to enter credentials again.
                  </label>
                </div>
                <button
                  type="button"
                  className={`mt-5 ${secondaryButtonClassName} border-amber-300/50 text-amber-100 hover:border-amber-200 hover:bg-amber-950/40`}
                  onClick={() => void handleImport()}
                  disabled={!isConfirmed || isImporting}
                >
                  {isImporting
                    ? "Importing backup…"
                    : "Import and replace local data"}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
