import type { Repository } from "../../../domain/ports";

export interface IndexedDbTable<Record extends { id: string }> {
  toArray(): Promise<Record[]>;
  get(id: string): Promise<Record | undefined>;
  put(record: Record): Promise<unknown>;
  delete(id: string): Promise<void>;
}

interface Schema<T> {
  parse(value: unknown): T;
}

export class IndexedDbRepository<
  Entity,
  StoredRecord extends { id: string },
> implements Repository<Entity> {
  public constructor(
    private readonly table: IndexedDbTable<StoredRecord>,
    private readonly entitySchema: Schema<Entity>,
    private readonly storedSchema: Schema<StoredRecord>,
    private readonly serialize: (entity: Entity) => StoredRecord,
    private readonly deserialize: (record: StoredRecord) => Entity,
  ) {}

  public async list(): Promise<Entity[]> {
    const records = await this.table.toArray();
    return records.map((record) => this.deserializePersistedRecord(record));
  }

  public async getById(id: string): Promise<Entity | null> {
    const record = await this.table.get(id);
    return record === undefined
      ? null
      : this.deserializePersistedRecord(record);
  }

  public async save(entity: Entity): Promise<void> {
    const validated = this.entitySchema.parse(entity);
    const serialized = this.storedSchema.parse(this.serialize(validated));
    await this.table.put(serialized);
  }

  public async delete(id: string): Promise<void> {
    await this.table.delete(id);
  }

  private deserializePersistedRecord(record: unknown): Entity {
    const validated = this.storedSchema.parse(record);
    return this.entitySchema.parse(this.deserialize(validated));
  }
}
