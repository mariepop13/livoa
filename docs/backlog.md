# Delivery backlog

This file is a local staging record until a GitHub repository is connected. Create each item as an issue with its stated labels and dependencies.

## Milestone 0: Foundation

### Set up project foundation

Labels: `type: architecture`, `priority: high`

Context: establish the local-first application baseline. Goal: provide a runnable Next.js skeleton. Scope: App Router, Tailwind, scripts, and project metadata. Out of scope: product flows. Acceptance criteria: the application starts and shows the Livoa foundation page. Technical notes: Node 20.9+. Dependencies: none. Testing: lint, typecheck, build.

### Configure TypeScript and code quality

Labels: `type: architecture`, `type: testing`, `priority: high`

Context: prevent unsafe boundaries. Goal: strict automated checks. Scope: TypeScript, ESLint, Prettier scripts. Out of scope: broad style migration. Acceptance criteria: `lint`, `typecheck`, and `format` are documented and passing. Dependencies: Set up project foundation. Testing: run each command.

### Configure Vitest

Labels: `type: testing`, `priority: high`

Goal: make unit and component testing available. Scope: Vitest, jsdom, Testing Library setup. Out of scope: feature test suites. Acceptance criteria: `npm run test` executes deterministic tests. Dependencies: Set up project foundation. Testing: add one representative test.

### Configure Playwright

Labels: `type: testing`, `priority: medium`

Goal: add browser smoke coverage. Scope: Playwright configuration and landing-page smoke test. Out of scope: full E2E coverage. Acceptance criteria: `npm run test:e2e` runs after browser installation. Dependencies: Set up project foundation. Testing: home-page scenario.

### Set up GitHub Actions CI

Labels: `type: testing`, `priority: high`

Goal: enforce quality in pull requests. Scope: Node 20 install, lint, typecheck, test, build. Out of scope: deployment. Acceptance criteria: workflow runs on push and PR. Dependencies: quality and test configuration. Testing: inspect workflow.

### Define application architecture

Labels: `type: architecture`, `type: documentation`, `priority: high`

Goal: preserve `UI -> Application -> Domain` dependency direction. Scope: architecture documentation and contributor rules. Out of scope: feature implementations. Acceptance criteria: domain has no framework or provider imports. Dependencies: foundation. Testing: import-boundary review.

### Define domain models and repository interfaces

Labels: `type: architecture`, `area: storage`, `priority: high`

Goal: validate Character, Persona, Conversation, Message, ProviderConfiguration, and AppSettings. Scope: Zod schemas and typed ports. Out of scope: CRUD UI. Acceptance criteria: UUID and date validation is explicit. Dependencies: architecture. Testing: schema unit tests. Security: treat persisted and imported data as untrusted.

### Implement IndexedDB foundation

Labels: `type: architecture`, `area: storage`, `priority: high`

Goal: establish local storage infrastructure. Scope: Dexie schema and repository adapters. Out of scope: cloud sync. Acceptance criteria: records round-trip with explicit date serialization. Dependencies: domain ports. Testing: IndexedDB adapter tests.

### Add application error model

Labels: `type: architecture`, `priority: medium`

Goal: make expected failures explicit. Scope: typed application error mapping. Out of scope: UI error screens. Acceptance criteria: provider and storage errors are normalized without credentials. Dependencies: architecture. Testing: error mapping tests. Security: never expose keys.

### Create security baseline and document local-first architecture

Labels: `type: security`, `type: documentation`, `area: security`, `priority: high`

Goal: document BYOK and local threat boundaries. Scope: SECURITY policy and security/local-first docs. Out of scope: cryptography or backend. Acceptance criteria: browser-storage, XSS, prompt-injection, imports, Markdown, supply-chain, logs, and credential separation are covered. Dependencies: architecture. Testing: documentation review.

### Add AGENTS.md

Labels: `type: documentation`, `priority: medium`

Goal: record contributor constraints. Scope: architectural, testing, security, and workflow rules. Acceptance criteria: contributors can identify checks and forbidden imports. Dependencies: architecture. Testing: review against repository configuration.

## Milestones 1-5 and future

Create independent issues in this order: Character CRUD and avatars (`area: characters`); provider configuration and credential storage (`area: providers`, `area: security`); OpenAI-compatible provider; OpenRouter configuration; model listing, streaming, cancellation, and normalized errors; conversation/message persistence and context assembly (`area: chat`, `area: storage`); Persona CRUD and attachment (`area: personas`); responsive, accessible empty/loading/error states (`area: ui`); local backup import/export (`area: import-export`, security review); offline validation; E2E happy path; security review; MVP README. Each must include Context, Goal, Scope, Out of scope, Acceptance criteria, Technical notes, Dependencies, Testing, and security considerations when applicable.

Future Memory issues, in dependency order: Memory model/repository, memory management UI, manual creation, opt-in extraction with validation, retrieval/context budgets, privacy/quality/prompt-injection assessment. Other future areas: Character Cards, local models, worlds, group chats, voice, sync, self-hosting, desktop, mobile, sharing.
