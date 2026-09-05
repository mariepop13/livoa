# Delivery backlog

GitHub [issues](https://github.com/mariepop13/livoa/issues) and [milestones](https://github.com/mariepop13/livoa/milestones) are authoritative. This file is not a staging list and must not be used to recreate, reorder, or infer issue scope. Use the linked GitHub issue for labels, acceptance criteria, dependencies, testing, and current state.

## Open backlog

| Priority area                     | Authoritative issue                                                                                            | Milestone                                                                 | Status                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------ |
| Licensing and public metadata     | [#78 — Select and add an open-source licence](https://github.com/mariepop13/livoa/issues/78)                   | Unmilestoned                                                              | Current documentation delivery |
| Core data safety                  | [#79 — Complete backup coverage and versioned schema evolution](https://github.com/mariepop13/livoa/issues/79) | Unmilestoned                                                              | Open; Backup v2 is not shipped |
| Conversation branching            | [#76 — Persist conversation branches and active paths](https://github.com/mariepop13/livoa/issues/76)          | [Advanced conversations](https://github.com/mariepop13/livoa/milestone/9) | Open                           |
| Optional synchronization contract | [#29 — Define an optional local-first synchronization contract](https://github.com/mariepop13/livoa/issues/29) | [Platforms & sync](https://github.com/mariepop13/livoa/milestone/8)       | Open                           |
| Local model providers             | [#28 — Local model providers (deferred)](https://github.com/mariepop13/livoa/issues/28)                        | [Provider expansion](https://github.com/mariepop13/livoa/milestone/16)    | Open, deferred                 |

## Completed baseline

The local-first foundation, character and persona flows, provider configuration and chat, backup v1, accessibility and offline validation, and security review are completed tracker work. Memory v1 and SillyTavern Character Card import/export are also shipped. Do not represent either as backlog or future work.

Backup v1 has an identified Character Card coverage gap. The correction belongs exclusively to open [#79](https://github.com/mariepop13/livoa/issues/79); this documentation does not claim that Backup v2 exists.
