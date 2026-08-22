# Repository instructions

## Public repository privacy

- Treat every tracked file and every reachable Git commit as public.
- Do not commit real names, email addresses, usernames, account IDs, personal health data, credentials, tokens, source reports, screenshots, or other identifying details.
- Use generic labels and placeholder values in database schemas, documentation, README files, tests, fixtures, screenshots, examples, and every other tracked artefact.
- Keep real data only in local ignored files. Before a public push, inspect both tracked content and commit author metadata for identifying details.

## Engineering approach

- Optimise for correct outcomes, not process ceremony.
- Prioritise SOLID principles.
- Apply YAGNI: do not implement functionality until it is needed.
- Understand the problem and architecture before implementing.
- Prefer targeted verification while working, then one broader verification pass.

## Verification and testing

- Do not use strict TDD unless explicitly requested.
- Add regression tests for behaviour that could realistically break.
- Prefer behavioural tests over implementation-detail tests.

## TypeScript and React

- Prefer `type` aliases over `interface`, avoid `any`, and use string-literal unions instead of `enum`.
- Use `satisfies` for configuration objects.
- Use `import type` for type-only imports, named exports unless a framework requires a default export, and no barrel files.
- Prefer one focused React component per file and `export function ComponentName()`.
