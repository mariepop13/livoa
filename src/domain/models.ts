import { z } from "zod";
const dateFields = { createdAt: z.date(), updatedAt: z.date() };
export const characterSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120), description: z.string().max(2000), personality: z.string().max(10000), systemPrompt: z.string().max(20000), greeting: z.string().max(4000).optional(), avatar: z.url().optional(), ...dateFields });
export const personaSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120), description: z.string().max(2000), ...dateFields });
export const conversationSchema = z.object({ id: z.string().uuid(), characterId: z.string().uuid(), personaId: z.string().uuid().optional(), title: z.string().max(200).optional(), ...dateFields });
export const messageSchema = z.object({ id: z.string().uuid(), conversationId: z.string().uuid(), role: z.enum(["user", "assistant", "system"]), content: z.string(), model: z.string().max(200).optional(), provider: z.string().max(100).optional(), createdAt: z.date() });
export const providerConfigurationSchema = z.object({ id: z.string().min(1), providerId: z.string().min(1), baseUrl: z.url().optional(), selectedModelId: z.string().optional(), enabled: z.boolean() });
export const appSettingsSchema = z.object({ theme: z.enum(["system", "light", "dark"]), providers: z.array(providerConfigurationSchema) });
export type Character = z.infer<typeof characterSchema>; export type Persona = z.infer<typeof personaSchema>; export type Conversation = z.infer<typeof conversationSchema>; export type Message = z.infer<typeof messageSchema>; export type ProviderConfiguration = z.infer<typeof providerConfigurationSchema>; export type AppSettings = z.infer<typeof appSettingsSchema>;
