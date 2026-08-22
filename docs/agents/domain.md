# Domain docs

This repository uses a single domain context.

## Before exploring, read these

- `CONTEXT.md` at the repository root.
- Relevant ADRs under `docs/adr/`, when that directory exists.

If an expected document does not exist, proceed silently. The domain-modeling workflow creates glossary entries and ADRs lazily when terms or durable decisions are actually resolved.

## Use the glossary's vocabulary

Use canonical terms from `CONTEXT.md` in issue titles, prototypes, specifications, code, and tests. Avoid synonyms explicitly listed under `_Avoid_`.

When a new domain term becomes clear, update `CONTEXT.md` immediately through the domain-modeling workflow. Keep implementation detail out of the glossary.

## Architectural decisions

Create an ADR only when a decision is hard to reverse, surprising without context, and the result of a genuine trade-off. If proposed work conflicts with an existing ADR, surface the conflict rather than silently overriding it.
