import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_BACKUP_IMPORT_SIZE,
  type BackupApplicationService,
} from "@/application/backup";

import BackupScreen from "./backup-screen";

const service: BackupApplicationService = {
  async createExport() {
    return { fileName: "backup.json", contents: "{}" };
  },
  inspectImport() {
    return {
      ok: true,
      data: {
        characters: 0,
        personas: 0,
        conversations: 0,
        messages: 0,
        memories: 0,
        hasSettings: false,
      },
    };
  },
  async importBackup() {
    return {
      ok: true,
      data: {
        characters: 0,
        personas: 0,
        conversations: 0,
        messages: 0,
        memories: 0,
        hasSettings: false,
      },
    };
  },
};

describe("BackupScreen", () => {
  afterEach(() => {
    cleanup();
  });

  it("rejects oversized files before reading their contents", async () => {
    const inspectImport = vi.spyOn(service, "inspectImport");
    const file = new File(["{}"], "oversized.json", {
      type: "application/json",
    });
    const text = vi.fn<() => Promise<string>>();
    Object.defineProperty(file, "size", { value: MAX_BACKUP_IMPORT_SIZE + 1 });
    Object.defineProperty(file, "text", { value: text });

    render(<BackupScreen service={service} />);
    fireEvent.change(screen.getByLabelText("Backup file"), {
      target: { files: [file] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This backup file is too large. Choose a smaller file.",
    );
    expect(text).not.toHaveBeenCalled();
    expect(inspectImport).not.toHaveBeenCalled();
    inspectImport.mockRestore();
  });

  it("discloses that importing removes saved provider credentials", () => {
    render(<BackupScreen service={service} />);

    expect(
      screen.getByText(
        /Importing a backup disconnects providers, so credentials must be entered again\./,
      ),
    ).toBeVisible();
  });

  it("discloses memory records before import", async () => {
    const file = new File(["{}"], "backup.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", { value: async () => "{}" });

    render(<BackupScreen service={service} />);
    fireEvent.change(screen.getByLabelText("Backup file"), {
      target: { files: [file] },
    });

    expect(await screen.findByText("0 memories")).toBeVisible();
  });
});
