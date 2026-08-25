import { z } from "zod";

import {
  appSettingsSchema,
  characterSchema,
  conversationSchema,
  messageSchema,
  personaSchema,
  providerConfigurationSchema,
} from "@/domain/models";

export const BACKUP_FORMAT = "livoa-local-backup";
export const BACKUP_VERSION = 1;

const isoDateStringSchema = z.string().refine(
  (value) => {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toISOString() === value;
  },
  { message: "Expected a canonical ISO UTC date string" },
);

const httpUrlSchema = z.url().refine(
  (value) => {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === ""
    );
  },
  { message: "Expected an HTTP or HTTPS URL without embedded credentials" },
);

const backupCharacterSchema = characterSchema
  .extend({
    avatar: httpUrlSchema.optional(),
    createdAt: isoDateStringSchema,
    updatedAt: isoDateStringSchema,
  })
  .strict();

const backupPersonaSchema = personaSchema
  .extend({
    createdAt: isoDateStringSchema,
    updatedAt: isoDateStringSchema,
  })
  .strict();

const backupConversationSchema = conversationSchema
  .extend({
    createdAt: isoDateStringSchema,
    updatedAt: isoDateStringSchema,
  })
  .strict();

const backupMessageSchema = messageSchema
  .extend({ createdAt: isoDateStringSchema })
  .strict();

const backupProviderConfigurationSchema = providerConfigurationSchema
  .extend({ baseUrl: httpUrlSchema.optional() })
  .strict();

const backupSettingsSchema = appSettingsSchema
  .extend({ providers: z.array(backupProviderConfigurationSchema) })
  .strict();

const backupDataShape = z.object({
  characters: z.array(backupCharacterSchema),
  personas: z.array(backupPersonaSchema),
  conversations: z.array(backupConversationSchema),
  messages: z.array(backupMessageSchema),
  settings: backupSettingsSchema.nullable(),
});

function addDuplicateIdIssues(
  records: readonly { id: string }[],
  collection: "characters" | "personas" | "conversations" | "messages",
  context: z.RefinementCtx,
): void {
  const seenIds = new Set<string>();

  records.forEach((record, index) => {
    if (seenIds.has(record.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate ${collection} ID`,
        path: [collection, index, "id"],
      });
    }

    seenIds.add(record.id);
  });
}

export const backupDataSchema = backupDataShape
  .strict()
  .superRefine((data, context) => {
    addDuplicateIdIssues(data.characters, "characters", context);
    addDuplicateIdIssues(data.personas, "personas", context);
    addDuplicateIdIssues(data.conversations, "conversations", context);
    addDuplicateIdIssues(data.messages, "messages", context);
  });

export const backupSnapshotSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    version: z.literal(BACKUP_VERSION),
    exportedAt: isoDateStringSchema,
    data: backupDataSchema,
  })
  .strict();

export type BackupData = z.infer<typeof backupDataSchema>;
export type BackupSnapshot = z.infer<typeof backupSnapshotSchema>;
