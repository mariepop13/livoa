import { describe, expect, it } from "vitest";

import type { Persona } from "../../domain/models";
import type { PersonaRepository } from "../../domain/ports";
import {
  createPersona,
  createPersonaApplicationService,
  deletePersona,
  listPersonas,
  updatePersona,
} from "./service";

const personaId = "11111111-1111-4111-8111-111111111111";
const secondPersonaId = "22222222-2222-4222-8222-222222222222";
const timestamp = new Date("2026-01-01T12:00:00.000Z");

const persona: Persona = {
  id: personaId,
  name: "Astra",
  description: "A patient guide.",
  createdAt: timestamp,
  updatedAt: timestamp,
};

class MemoryPersonaRepository implements PersonaRepository {
  private readonly personas = new Map<string, Persona>();

  public saveCalls = 0;
  public deleteCalls = 0;
  public listFailure: unknown = null;
  public saveFailure: unknown = null;
  public deleteFailure: unknown = null;

  public constructor(initialPersonas: readonly Persona[] = []) {
    for (const initialPersona of initialPersonas) {
      this.personas.set(initialPersona.id, initialPersona);
    }
  }

  public async list(): Promise<Persona[]> {
    if (this.listFailure !== null) {
      throw this.listFailure;
    }
    return [...this.personas.values()];
  }

  public async getById(id: string): Promise<Persona | null> {
    return this.personas.get(id) ?? null;
  }

  public async save(entity: Persona): Promise<void> {
    this.saveCalls += 1;
    if (this.saveFailure !== null) {
      throw this.saveFailure;
    }
    this.personas.set(entity.id, entity);
  }

  public async delete(id: string): Promise<void> {
    this.deleteCalls += 1;
    if (this.deleteFailure !== null) {
      throw this.deleteFailure;
    }
    this.personas.delete(id);
  }
}

const createInput = {
  name: "  Nova  ",
  description: "A new guide.",
};

describe("persona application service", () => {
  it("creates, lists, updates, and deletes personas through the repository port", async () => {
    const repository = new MemoryPersonaRepository();
    const service = createPersonaApplicationService(repository, {
      generateId: () => secondPersonaId,
      now: () => timestamp,
    });

    await expect(service.create(createInput)).resolves.toEqual({
      ok: true,
      data: {
        ...createInput,
        name: "Nova",
        id: secondPersonaId,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    await expect(service.list()).resolves.toEqual({
      ok: true,
      data: [
        {
          ...createInput,
          name: "Nova",
          id: secondPersonaId,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    });

    await expect(
      service.update({
        ...createInput,
        id: secondPersonaId,
        name: "Nova Prime",
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        ...createInput,
        name: "Nova Prime",
        id: secondPersonaId,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    await expect(service.delete(secondPersonaId)).resolves.toEqual({
      ok: true,
      data: undefined,
    });
    await expect(service.list()).resolves.toEqual({ ok: true, data: [] });
    expect(repository.saveCalls).toBe(2);
    expect(repository.deleteCalls).toBe(1);
  });

  it("rejects invalid inputs without touching storage", async () => {
    const repository = new MemoryPersonaRepository([persona]);

    const invalidCreate = await createPersona(repository, {
      ...createInput,
      name: "",
    });
    const invalidUpdate = await updatePersona(repository, {
      ...createInput,
      id: "not-a-uuid",
    });
    const invalidDelete = await deletePersona(repository, "not-a-uuid");

    expect(invalidCreate).toMatchObject({
      ok: false,
      error: { kind: "validation", code: "VALIDATION_ERROR" },
    });
    expect(invalidUpdate).toMatchObject({
      ok: false,
      error: { kind: "validation", code: "VALIDATION_ERROR" },
    });
    expect(invalidDelete).toMatchObject({
      ok: false,
      error: { kind: "validation", code: "VALIDATION_ERROR" },
    });
    expect(repository.saveCalls).toBe(0);
    expect(repository.deleteCalls).toBe(0);
  });

  it("returns explicit not-found and safe storage failures", async () => {
    const repository = new MemoryPersonaRepository([persona]);

    await expect(
      updatePersona(repository, {
        ...persona,
        id: secondPersonaId,
        name: "Missing",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { kind: "not_found", code: "NOT_FOUND", id: secondPersonaId },
    });
    await expect(deletePersona(repository, personaId)).resolves.toEqual({
      ok: true,
      data: undefined,
    });

    const failingRepository = new MemoryPersonaRepository([persona]);
    const storageDetail = "opaque-storage-detail";
    failingRepository.saveFailure = new Error(storageDetail);
    await expect(
      createPersona(failingRepository, createInput, {
        generateId: () => secondPersonaId,
        now: () => timestamp,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "STORAGE_ERROR",
        error: { message: "Local data could not be saved." },
      },
    });
    failingRepository.listFailure = new Error(storageDetail);
    await expect(listPersonas(failingRepository)).resolves.toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "STORAGE_ERROR",
        error: { message: "Local data could not be read." },
      },
    });
    expect(JSON.stringify(await listPersonas(failingRepository))).not.toContain(
      storageDetail,
    );
  });
});
