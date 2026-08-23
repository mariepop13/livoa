# Livoa contributor instructions

Keep dependencies flowing `UI -> Application -> Domain`; infrastructure implements typed ports. Domain imports no React, Next.js, Dexie, IndexedDB, or provider SDK. Validate external input with Zod, never log credentials, and never put business logic in components. Use English artifacts, strict TypeScript without `any`, small cohesive modules, and explicit failures. Before a PR run lint, typecheck, tests, and build. Use reviewed branches; never push directly to `main`.
