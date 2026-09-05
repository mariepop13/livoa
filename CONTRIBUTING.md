# Contributing to Livoa

Thank you for contributing. Keep pull requests focused, explain the user-visible or architectural effect, and preserve existing local data unless the change explicitly addresses migration or restoration.

## Project rules

Read [`AGENTS.md`](AGENTS.md) before making changes. In particular:

- Keep dependencies flowing `UI -> Application -> Domain`. Domain code must not import React, Next.js, Dexie, IndexedDB, or provider SDKs.
- Use strict TypeScript, validate external and persisted input with Zod, and keep business logic out of components.
- Treat imported files, provider responses, Markdown, URLs, and persisted data as untrusted.
- Never commit, log, expose in errors, or export provider credentials.
- Preserve local-first behavior, BYOK, provider-agnostic ports, and privacy boundaries.

## Before review

Run the repository checks before requesting review:

```bash
npm run format
npm run lint
npm run typecheck
npm run test
npm run build
```

Exercise the affected user flow in a real browser when a change affects the web UI. For data, backup, import, provider, or security changes, describe the manual verification and any remaining risk in the pull request.

## License

Livoa is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE) (`AGPL-3.0-or-later`). By submitting a contribution, you agree that it may be distributed under that licence. No contributor licence agreement is required.
