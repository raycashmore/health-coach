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

Prerequisites: Node 22.13+, pnpm, and Docker Desktop for local Supabase development.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @health-coach/web dev
pnpm --filter @health-coach/mobile android
```

To run the local Supabase stack, start Docker Desktop, then run:

```bash
pnpm supabase:start
pnpm supabase:stop
```

`pnpm supabase:start` starts the local Docker services and writes their credentials to the ignored `apps/web/.env.local`. Vercel CLI may maintain hosted deployment credentials in the ignored root `.env.local`; do not copy either file into version control.

For the Android app, set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in an ignored mobile environment file. They are public client configuration only; the mobile app signs in as the owner and relies on Supabase row-level security. Never add `SUPABASE_SERVICE_ROLE_KEY` or an owner password to the app environment.

### Database migrations

Schema changes are committed as ordered SQL migrations under `supabase/migrations`.

```sh
# Create and then edit a new migration.
pnpm supabase:migration:new add_health_follow_ups

# Apply pending migrations to a running local database without resetting its data.
pnpm supabase:migrate:local

# Rebuild a disposable local database from every migration and verify that the chain is reproducible.
pnpm supabase:reset
```

`pnpm supabase:verify` starts Supabase and resets the local database; CI runs it on every pull request and `main` push. It is intentionally destructive, so use it only against local synthetic or disposable data—not the private Personal Health Record.

Production migrations run only through the manual **Deploy Supabase migrations** GitHub Actions workflow. Before its first use, create a protected `production` GitHub environment and set its `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` secrets. The workflow requires typing `deploy`, previews the pending migration set, and then runs `supabase db push`; it never resets the production database.

### Private Ancestry import

Create the generic local-only owner, then keep an Ancestry export only in the ignored `sources/AncestryDNA.txt` path and run:

```sh
pnpm supabase:owner
pnpm import:ancestry:local
```

The importer saves normalized variants and source provenance only; it does not retain the export. To import the same normalized data into the hosted project after reviewing it locally, configure that project's owner UUID in ignored root `.env.local` and run `pnpm import:ancestry:production`.

Before either import, explicitly set `ANCESTRY_GENOME_BUILD` to `GRCh37` or `GRCh38` in that ignored environment file only after validating the export metadata. The importer refuses an unknown build rather than guessing it.

An I-Screen import also starts the bounded iron-regulation Health Review. The review reads only the `rs1800562` call needed by the curated panel; a direct-to-consumer call can produce only a confirmation-oriented result, never a diagnosis or treatment advice. To rerun it after importing Ancestry data, make an authenticated `POST` request to `/api/health-reviews/iron-regulation`.

## Deliberate boundaries

- The web app is an intake surface, not a general dashboard.
- The Android app owns the ongoing conversation, evidence, recommendations, Health Follow-ups, blood pressure, and Supplement Regimens.
- Provider interpretations are attributed source material, not verified Health Observations.
- The model gets only bounded retrieval results, never a bulk genome or whole personal profile by default.
- Telegram, Health Connect, Daily Guidance, active Health Experiments, and broad dashboard views are planned later work.
