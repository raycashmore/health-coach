# ADR 0001: Use a small pnpm monorepo

## Status

Accepted

## Context

The first release has two user-facing clients: private web intake on a laptop and an Android application for the ongoing Health Insights experience. Both need to agree on the Personal Health Record vocabulary and validation rules.

## Decision

Use one pnpm workspace with `apps/web`, `apps/mobile`, and one `packages/health-core` package. Keep server-side agent tools and durable workflows in the web boundary until a real need for another deployable service appears.

## Consequences

The domain language and validation behaviour are shared without a separately versioned library or duplicated contracts. Web and mobile remain independently deployable. The repository avoids premature packages for UI, APIs, agent infrastructure, or database access.
