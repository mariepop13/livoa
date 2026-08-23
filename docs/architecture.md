# Architecture

`UI -> Application -> Domain`; infrastructure implements ports for IndexedDB, credentials, and providers. Persisted and import/export date values are explicitly validated and serialized. Memory, World, GroupConversation, and CharacterCard are future concepts only.
