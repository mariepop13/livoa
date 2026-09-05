# Architecture

Livoa keeps dependencies flowing in one direction:

```text
UI -> Application -> Domain
             ^
      Infrastructure implements typed ports
```

- **UI** contains Next.js routes and client interaction. Components present state and call application services; they do not contain business rules.
- **Application** implements use cases, coordinates domain models through typed ports, and maps expected failures without exposing credentials.
- **Domain** owns Zod schemas, types, invariants, and repository/provider contracts. It imports no React, Next.js, Dexie, IndexedDB, or provider SDK.
- **Infrastructure** implements ports for IndexedDB/Dexie persistence, browser credential storage, and provider integrations. It may depend on platform or provider libraries but must not reverse the dependency direction.

## Boundaries and privacy

Persisted records, imported files, provider responses, URLs, Markdown, and date values are untrusted at the boundary and are validated before use. Date values are explicitly serialized for storage and backup transport. Provider credentials are held separately from provider configuration and local content; they are not logged or exported.

The provider contract is provider-agnostic. The current OpenRouter configuration uses an OpenAI-compatible adapter, but application and domain code do not depend on that provider.

## Current concepts

The domain currently includes character profiles, personas, conversations, messages, provider configuration, app settings, memories, and Character Card records. Memory v1 supports manual local notes and explicit consent for extraction and chat-context use. Character Cards preserve supported import/export payloads separately from character profiles so unused imported fields stay inert.

Backup v1 serializes the supported content collections and settings through an application service, validates an import before writing, and excludes credentials. It does not include Character Card records; [#79](https://github.com/mariepop13/livoa/issues/79) is the open Backup v2 data-safety correction. No Backup v2 behavior is implied by this documentation.
