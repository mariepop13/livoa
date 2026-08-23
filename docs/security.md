# Security model

BYOK credentials are never committed, logged, placed in errors, or sent to a Livoa backend. Browser storage does not protect against device compromise, malicious extensions, or XSS. Validate all user input, persisted records, imports, provider responses, URLs, and files with Zod. Render Markdown safely and treat HTML, shared content, and prompt injection as untrusted. Keep credentials separate, avoid custom cryptography, update dependencies, and assess supply-chain risk.
