# Data model

The domain validates these persisted concepts with Zod:

- **Character** — a UUID-based profile with name, description, personality, system prompt, optional greeting, optional avatar reference, and timestamps.
- **CharacterCard** — a record associated with one Character that retains a supported card format, raw payload, and optional PNG/APNG avatar bytes. It is distinct from the Character profile.
- **Persona** — a UUID-based local identity that can be attached to a conversation.
- **Conversation** — a UUID-based record for one Character with an optional Persona, optional title, and timestamps.
- **Message** — a UUID-based message in one Conversation with a role, content, optional provider/model metadata, and creation time.
- **Memory** — a UUID-based, character-scoped note with a subject (`user`, `character`, or `scenario`), bounded content, and timestamps.
- **ProviderConfiguration** — local provider metadata, including identifier, provider ID, optional base URL, selected model, and enabled state. It never contains a credential.
- **AppSettings** — theme, provider configuration list, and separate `memoryExtractionEnabled` and `memoryContextEnabled` consent flags.

## Validation and transport

IDs are UUIDs where the model requires them. Content, URLs, provider identifiers, collection sizes, card payloads, and card avatar bytes are bounded. External date strings are transformed and checked at the boundary; internal models use `Date` values.

Character Card imports and backup imports are untrusted transport formats. They are parsed and validated before persistence. Backup v1 contains the supported content collections and settings, but not credentials or Character Card records. The missing Character Card coverage is tracked by the open [#79](https://github.com/mariepop13/livoa/issues/79) Backup v2 correction.
