# TypeScript and React conventions

## TypeScript

- Prefer `type` aliases over `interface`.
- Avoid `any`.
- Prefer string-literal unions over `enum`.
- Use `satisfies` for configuration objects.
- Use `import type` for type-only imports.
- Use named exports unless a framework requires a default export.
- Do not create barrel files.

## React

- Prefer one focused component per file.
- Prefer `export function ComponentName()`.
