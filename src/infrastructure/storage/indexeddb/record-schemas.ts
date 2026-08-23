import { z } from "zod";

import {
  appSettingsSchema,
  characterSchema,
  conversationSchema,
  messageSchema,
  personaSchema,
  providerConfigurationSchema,
} from "../../../domain/models";

export const SETTINGS_RECORD_ID = "app-settings";

export const isoDateStringSchema = z.string().refine(
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

export const storedCharacterSchema = characterSchema.extend({
  avatar: httpUrlSchema.optional(),
  createdAt: isoDateStringSchema,
  updatedAt: isoDateStringSchema,
});

export const storedPersonaSchema = personaSchema.extend({
  createdAt: isoDateStringSchema,
  updatedAt: isoDateStringSchema,
});

export const storedConversationSchema = conversationSchema.extend({
  createdAt: isoDateStringSchema,
  updatedAt: isoDateStringSchema,
});

export const storedMessageSchema = messageSchema.extend({
  createdAt: isoDateStringSchema,
});

export const storedAppSettingsSchema = appSettingsSchema.extend({
  providers: z.array(
    providerConfigurationSchema.extend({
      baseUrl: httpUrlSchema.optional(),
    }),
  ),
  id: z.literal(SETTINGS_RECORD_ID),
});

export type StoredCharacter = z.infer<typeof storedCharacterSchema>;
export type StoredPersona = z.infer<typeof storedPersonaSchema>;
export type StoredConversation = z.infer<typeof storedConversationSchema>;
export type StoredMessage = z.infer<typeof storedMessageSchema>;
export type StoredAppSettings = z.infer<typeof storedAppSettingsSchema>;
