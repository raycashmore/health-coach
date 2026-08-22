# First-release architecture

The project is a small pnpm workspace. It deliberately has two thin clients and one shared language for the Personal Health Record.

```text
apps/web       private laptop-originated intake
apps/mobile    Android Health Insights and owner-entered data
       \       /
packages/health-core
       |
Supabase Postgres (introduced with persistence)
       |
Health Review and Health Investigation workflows (introduced later)
```

`apps/web` will perform private file intake. It is not the general health dashboard. `apps/mobile` is the primary ongoing product surface. Neither client owns the health domain model: `packages/health-core` contains the validation contracts they share.

Until owner sign-in is introduced with the persistence layer, the web intake fails closed in production unless its local `INTAKE_ACCESS_TOKEN` is configured. This is a deliberately small access gate for a data-free foundation, not the final authentication design.

The first release will add Supabase for the canonical Personal Health Record, Vercel AI SDK tools and Inngest workflows to the web/server boundary. The model will receive bounded, relevant tool results rather than a full genotype export or profile.

No source PDF, CSV, credential, personal fixture, evaluation snapshot, or Operational Trace belongs in this repository. Files are transient during import; the product retains normalised data and Source Metadata only.
