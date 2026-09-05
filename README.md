# Livoa

Livoa is an open-source, local-first platform for creating and talking with AI characters. It is private by default: the application has no required account or Livoa backend, and your content stays in the browser on the device where you use it.

Bring your own provider credentials (BYOK). Livoa keeps provider selection behind typed ports so it is not tied to one provider; the current UI supports OpenRouter through an OpenAI-compatible adapter and OpenRouter OAuth. Credentials are stored separately from content and are never included in backups.

## Current functionality

- Create, edit, and delete characters with optional avatars, and create personas.
- Configure a provider and model, create local conversations, stream responses, cancel requests, and edit, delete, or regenerate messages.
- Manage Memory v1: create local character memories, optionally request bounded extraction candidates from one conversation, review them before saving, and explicitly opt in to using bounded memories as chat context.
- Import and export SillyTavern Character Cards in supported JSON, PNG, and APNG forms. Imported card fields that Livoa does not use remain inert.
- Export and restore Backup v1 data for characters, personas, conversations, messages, memories, and settings. Backup imports validate data before local changes and disconnect providers; credentials are not exported.

> **Backup v1 limitation:** Character Card records are not included in Backup v1. [Issue #79](https://github.com/mariepop13/livoa/issues/79) tracks the open Backup v2 data-safety correction. It is not shipped.

## Development

Node.js 20.9+ is required.

```bash
npm install
npm run format
npm run lint
npm run typecheck
npm run test
npm run build
```

## Documentation

- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Local-first behavior](docs/local-first.md)
- [AI providers](docs/ai-providers.md)
- [Security model](docs/security.md)
- [Roadmap](docs/roadmap.md) and [backlog](docs/backlog.md)
- [Contributing](CONTRIBUTING.md)

## License

Livoa is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE) (`AGPL-3.0-or-later`).
