# Health Coach

A privacy-first advisory health agent that finds meaningful, non-obvious connections across longitudinal health data—genetics, labs, blood pressure, supplements, and eventually wearable signals—and turns them into explainable, risk-calibrated recommendations.

This project explores the product and engineering challenges of building useful AI assistance for a sensitive, high-stakes domain: provenance-aware personal records, bounded model access, durable agent workflows, and recommendations that show both supporting evidence and uncertainty. The agent advises; it never performs a health action. Genetics are hypotheses, not deterministic conclusions.

## What it is building

- Import laptop-originated genetic and provider data into a normalised Personal Health Record while retaining source provenance—not raw source files.
- Surface risk-tiered health insights with evidence, uncertainty, freshness, and counter-signals.
- Give the owner a focused Android experience for recommendations, follow-ups, blood pressure, and supplement regimens.
- Support bounded Health Investigations and Health Reviews, so the model works from relevant retrieval results rather than a bulk genome or entire profile.
- Extend to wearable signals, Health Connect, Telegram, daily guidance, and active health experiments as the product matures.

## Technical approach

- **Privacy by design:** raw imports are transient; the product retains normalised records and source metadata. The model receives narrow, relevant tool results by default.
- **Shared domain language:** a typed, Zod-validated Personal Health Record lives in a shared package, keeping web and mobile clients aligned.
- **Focused surfaces:** Next.js handles private file intake and server-side boundaries; Expo/React Native provides the Android product experience.
- **Production path:** Supabase will become the canonical record, Vercel AI SDK will power bounded model tools, and Inngest will run durable Health Review and Investigation workflows.

## Architecture

```text
apps/web             private file intake and server boundary
apps/mobile          Expo Android experience
packages/health-core shared Personal Health Record contracts
```

More detail is in [docs/architecture.md](docs/architecture.md). The monorepo decision is recorded in [ADR 0001](docs/adr/0001-small-monorepo.md). Supabase, Vercel AI SDK, and Inngest are the planned production integrations; they are intentionally not connected in this foundation commit.

## Local development

Prerequisites: Node 22+ and pnpm.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @health-coach/web dev
pnpm --filter @health-coach/mobile android
```

## Deliberate boundaries

- The web app is an intake surface, not a general dashboard.
- The Android app owns the ongoing conversation, evidence, recommendations, Health Follow-ups, blood pressure, and Supplement Regimens.
- Provider interpretations are attributed source material, not verified Health Observations.
- The model gets only bounded retrieval results, never a bulk genome or whole personal profile by default.
- Telegram, Health Connect, Daily Guidance, active Health Experiments, and broad dashboard views are planned later work.
