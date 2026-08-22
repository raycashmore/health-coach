# Health Coach

A private, single-owner Advisory Health Agent. Its purpose is to find meaningful, non-obvious connections across longitudinal health data—especially genetics, labs, blood pressure, supplements, and later wearable signals—and turn them into explainable recommendations.

It is a learning project for becoming an AI Product Builder as much as it is a useful personal product. The software can be public; personal health data, credentials, private evaluations, and operational traces cannot.

## First release

The first end-to-end path is deliberately narrow:

1. Import real genetic and provider data from a laptop.
2. Normalise it into a Personal Health Record with provenance; discard original files.
3. Run one bounded Health Investigation chosen from actual data.
4. Show a risk-tiered result in Android with evidence, uncertainty, and counter-signals.
5. Track one Health Follow-up from due rationale to completion or supersession.

The agent recommends but never performs a health action. Genetics are hypotheses, not deterministic conclusions. A visible insight needs source evidence, freshness, counter-signals, and a risk-calibrated explanation.

## Architecture

```text
apps/web             private file intake and server boundary
apps/mobile          Expo Android experience
packages/health-core shared Personal Health Record contracts
```

More detail is in [docs/architecture.md](docs/architecture.md). The monorepo decision is recorded in [ADR 0001](docs/adr/0001-small-monorepo.md).

The planned production services are Supabase for the canonical record, Vercel AI SDK for bounded model tools, and Inngest for durable Health Reviews and Health Investigations. They are intentionally not connected in this foundation commit.

## Local development

Prerequisites: Node 22+ and pnpm.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @health-coach/web dev
pnpm --filter @health-coach/mobile android
```

Copy `.env.example` to `.env.local` only when an integration requires it. In production, configure `INTAKE_ACCESS_TOKEN` to protect the web intake with HTTP Basic authentication (`owner` is the username). Never commit that file, raw DNA exports, reports, blood-pressure records, screenshots, or actual evaluation content.

## Product boundaries

- The web app is an intake surface, not a general dashboard.
- The Android app owns the ongoing conversation, evidence, recommendations, Health Follow-ups, blood pressure, and Supplement Regimens.
- Provider interpretations are attributed source material, not verified Health Observations.
- The model gets only bounded retrieval results, never a bulk genome or whole personal profile by default.
- Telegram, Health Connect, Daily Guidance, active Health Experiments, and broad dashboard views are later work.
