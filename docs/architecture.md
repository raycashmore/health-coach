# First-release architecture

The project is a small pnpm workspace. It deliberately has two thin clients and one shared language for the Personal Health Record.

```text
apps/web       private laptop-originated intake
apps/mobile    Android Health Insights and owner-entered data
       \       /
packages/health-core
       |
Supabase Postgres (canonical record and review ledger)
       |
Inngest Health Review workflow (bounded, durable, deterministic first panel)
```

`apps/web` will perform private file intake. It is not the general health dashboard. `apps/mobile` is the primary ongoing product surface. Neither client owns the health domain model: `packages/health-core` contains the validation contracts they share.

Until owner sign-in is introduced with the persistence layer, the web intake fails closed in production unless its local `INTAKE_ACCESS_TOKEN` is configured. This is a deliberately small access gate for a data-free foundation, not the final authentication design.

Supabase is the canonical Personal Health Record and also holds coalesced review requests, run records, safe Operational Traces, and access-controlled evaluation snapshots. Relevant source changes queue a review; an Inngest worker receives only the opaque request ID, loads its bounded context server-side, retries failure, and checks freshness before a result is published. The current iron-regulation review is deterministic. Vercel AI SDK is reserved for a later bounded-model tool layer, where any model will receive relevant tool results rather than a full genotype export or profile.

No source PDF, CSV, credential, personal fixture, evaluation snapshot, or Operational Trace belongs in this repository. Files are transient during import; the product retains normalised data and Source Metadata only.
