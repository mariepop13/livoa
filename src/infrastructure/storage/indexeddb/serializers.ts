import {
  appSettingsSchema,
  characterSchema,
  conversationSchema,
  memorySchema,
  messageSchema,
  personaSchema,
  type AppSettings,
  type Character,
  type Conversation,
  type Memory,
  type Message,
  type Persona,
} from "../../../domain/models";
import {
  isoDateStringSchema,
  SETTINGS_RECORD_ID,
  storedAppSettingsSchema,
  storedCharacterSchema,
  storedConversationSchema,
  storedMemorySchema,
  storedMessageSchema,
  storedPersonaSchema,
  type StoredAppSettings,
  type StoredCharacter,
  type StoredConversation,
  type StoredMemory,
  type StoredMessage,
  type StoredPersona,
} from "./record-schemas";

function serializeDate(date: Date): string {
  return date.toISOString();
}

function deserializeDate(value: string): Date {
  return new Date(isoDateStringSchema.parse(value));
}

export function serializeCharacter(entity: Character): StoredCharacter {
  const validated = characterSchema.parse(entity);

  return {
    ...validated,
    createdAt: serializeDate(validated.createdAt),
    updatedAt: serializeDate(validated.updatedAt),
  };
}

export function deserializeCharacter(record: unknown): Character {
  const stored = storedCharacterSchema.parse(record);

  return characterSchema.parse({
    ...stored,
    createdAt: deserializeDate(stored.createdAt),
    updatedAt: deserializeDate(stored.updatedAt),
  });
}

export function serializePersona(entity: Persona): StoredPersona {
  const validated = personaSchema.parse(entity);

  return {
    ...validated,
    createdAt: serializeDate(validated.createdAt),
    updatedAt: serializeDate(validated.updatedAt),
  };
}

export function deserializePersona(record: unknown): Persona {
  const stored = storedPersonaSchema.parse(record);

  return personaSchema.parse({
    ...stored,
    createdAt: deserializeDate(stored.createdAt),
    updatedAt: deserializeDate(stored.updatedAt),
  });
}

export function serializeConversation(
  entity: Conversation,
): StoredConversation {
  const validated = conversationSchema.parse(entity);

  return {
    ...validated,
    createdAt: serializeDate(validated.createdAt),
    updatedAt: serializeDate(validated.updatedAt),
  };
}

export function deserializeConversation(record: unknown): Conversation {
  const stored = storedConversationSchema.parse(record);

  return conversationSchema.parse({
    ...stored,
    createdAt: deserializeDate(stored.createdAt),
    updatedAt: deserializeDate(stored.updatedAt),
  });
}

export function serializeMessage(entity: Message): StoredMessage {
  const validated = messageSchema.parse(entity);

  return {
    ...validated,
    createdAt: serializeDate(validated.createdAt),
  };
}

export function deserializeMessage(record: unknown): Message {
  const stored = storedMessageSchema.parse(record);

  return messageSchema.parse({
    ...stored,
    createdAt: deserializeDate(stored.createdAt),
  });
}

export function serializeMemory(entity: Memory): StoredMemory {
  const validated = memorySchema.parse(entity);

  return {
    ...validated,
    createdAt: serializeDate(validated.createdAt),
    updatedAt: serializeDate(validated.updatedAt),
  };
}

export function deserializeMemory(record: unknown): Memory {
  const stored = storedMemorySchema.parse(record);

  return memorySchema.parse({
    ...stored,
    createdAt: deserializeDate(stored.createdAt),
    updatedAt: deserializeDate(stored.updatedAt),
  });
}

export function serializeAppSettings(settings: AppSettings): StoredAppSettings {
  const validated = appSettingsSchema.parse(settings);

  return storedAppSettingsSchema.parse({
    id: SETTINGS_RECORD_ID,
    ...validated,
  });
}

export function deserializeAppSettings(record: unknown): AppSettings {
  const stored = storedAppSettingsSchema.parse(record);
  return appSettingsSchema.parse(stored);
}
