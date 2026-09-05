# Changelog

## Unreleased

### Added

- Local-first character, persona, conversation, message, and provider configuration flows with BYOK credentials kept separate from exported data.
- OpenRouter configuration, OAuth connection, model discovery, streaming responses, cancellation, normalized failures, and local conversation/message management.
- Memory v1: manual memory management, opt-in extraction candidates with review, bounded context use, and explicit privacy controls.
- SillyTavern Character Card preview, import, inert-field preservation, and export for supported JSON, PNG, and APNG cards.
- Backup v1 export and validated restore for supported non-secret collections; imports replace local content and require provider credentials to be entered again.

### Known limitation

- Backup v1 does not include persisted Character Card records. [#79](https://github.com/mariepop13/livoa/issues/79) tracks the unshipped Backup v2 data-safety correction, including versioned schema evolution and complete supported-collection coverage.
