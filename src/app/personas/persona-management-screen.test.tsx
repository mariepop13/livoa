import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  createPersonaApplicationService,
  type PersonaApplicationService,
} from "@/application/personas";
import type { Persona } from "@/domain/models";
import type { PersonaRepository } from "@/domain/ports";

import PersonaManagementScreen from "./persona-management-screen";

const savedPersonaId = "11111111-1111-4111-8111-111111111111";
const createdPersonaId = "22222222-2222-4222-8222-222222222222";
const timestamp = new Date("2026-01-01T00:00:00.000Z");

const savedPersona: Persona = {
  id: savedPersonaId,
  name: "Ada Lovelace",
  description: "A thoughtful pioneer of computing.",
  createdAt: timestamp,
  updatedAt: timestamp,
};

class MemoryPersonaRepository implements PersonaRepository {
  private readonly personas = new Map<string, Persona>();

  public constructor(initialPersonas: readonly Persona[] = []) {
    for (const persona of initialPersonas) {
      this.personas.set(persona.id, persona);
    }
  }

  public async list(): Promise<Persona[]> {
    return [...this.personas.values()];
  }

  public async getById(id: string): Promise<Persona | null> {
    return this.personas.get(id) ?? null;
  }

  public async save(persona: Persona): Promise<void> {
    this.personas.set(persona.id, persona);
  }

  public async delete(id: string): Promise<void> {
    this.personas.delete(id);
  }
}

function createService(
  initialPersonas: readonly Persona[] = [],
): PersonaApplicationService {
  return createPersonaApplicationService(
    new MemoryPersonaRepository(initialPersonas),
    {
      generateId: () => createdPersonaId,
      now: () => timestamp,
    },
  );
}

function fillPersonaForm(name = "Grace Hopper"): void {
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: name },
  });
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "A patient compiler pioneer." },
  });
}

describe("PersonaManagementScreen", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an accessible empty state", async () => {
    render(<PersonaManagementScreen service={createService()} />);

    expect(
      await screen.findByRole("heading", { name: "Saved personas" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "No personas saved yet. Create your first persona above.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Create a persona" }),
    ).toBeVisible();
  });

  it("creates, edits, and deletes a persona through the application service", async () => {
    render(<PersonaManagementScreen service={createService([savedPersona])} />);

    await screen.findByRole("heading", { name: "Ada Lovelace" });
    fireEvent.click(screen.getByRole("button", { name: "Edit Ada Lovelace" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Ada Byron" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save persona changes" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Persona updated.",
    );
    expect(screen.getByRole("heading", { name: "Ada Byron" })).toBeVisible();

    fillPersonaForm();
    fireEvent.click(screen.getByRole("button", { name: "Create persona" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Persona created.",
    );
    expect(screen.getByRole("heading", { name: "Grace Hopper" })).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Delete Grace Hopper" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Persona deleted.",
    );
    expect(
      screen.queryByRole("heading", { name: "Grace Hopper" }),
    ).not.toBeInTheDocument();
  });

  it("renders accessible validation feedback without saving invalid data", async () => {
    render(<PersonaManagementScreen service={createService()} />);

    await screen.findByRole("heading", { name: "Create a persona" });
    fireEvent.click(screen.getByRole("button", { name: "Create persona" }));

    expect(
      await screen.findByRole("alert", {
        name: "Please correct the highlighted fields.",
      }),
    ).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
