# Local-first behavior

Livoa stores characters, Character Card records, personas, conversations, messages, memories, provider configuration, and app settings in the browser on the current device. The application requires no account and no Livoa backend. Local storage is not a substitute for protection against device compromise, malicious extensions, or XSS; see the [security model](security.md).

## Providers and connectivity

Livoa is designed around provider-agnostic ports and uses bring-your-own-key (BYOK) credentials. Credentials are stored separately from content and provider configuration, are never logged or exported, and must be entered again after a backup restore. The current OpenRouter integration and any remote provider call require connectivity. Creating and managing local data works offline; a future local provider is not currently shipped.

## Memory and imports

Memory v1 keeps manual notes locally. Memory extraction is off until the user enables it; requesting candidates sends a bounded selection of one conversation to the configured provider. Candidates must be reviewed before saving. Memory context is separately opt-in, bounded, and treated as untrusted reference data.

Character Card and backup imports are untrusted local files. Livoa validates supported records before persistence. Character Card import/export supports the documented SillyTavern JSON, PNG, and APNG forms; fields that Livoa does not use remain inert.

## Backup v1

Backup v1 exports and restores characters, personas, conversations, messages, memories, and settings as local JSON. Credentials are excluded. A valid import replaces the supported local content only after validation and disconnects configured providers.

Backup v1 does **not** include persisted Character Card records. [#79](https://github.com/mariepop13/livoa/issues/79) is the open, unshipped Backup v2 data-safety correction for complete supported-collection coverage and versioned schema evolution. Livoa does not currently provide cloud backup or synchronization.
