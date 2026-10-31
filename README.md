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
- **Durable review loop:** Supabase is the canonical record, Vercel AI SDK is reserved for bounded model tools, and Inngest runs retried, coalesced Health Review work. The first review is deterministic and does not invoke a model.

## Architecture

```text
apps/web             private file intake and server boundary
apps/mobile          Expo Android experience
packages/health-core shared Personal Health Record contracts
```

More detail is in [docs/architecture.md](docs/architecture.md). The monorepo decision is recorded in [ADR 0001](docs/adr/0001-small-monorepo.md).

## Local development

### Wearable Daily Guidance (development)

Android now opens on **Recent patterns**, with the existing investigation and record-entry screen available separately.
Choose **Read wearable data** to request read-only Health Connect access to steps and recorded sleep. The app reads 21
completed local calendar days in the foreground. It compares the last three days with the preceding available baseline
(at least seven days). Missing records remain missing. Health Connect's native aggregation handles overlapping activity
and sleep sources using the owner's app priorities. Varying contributing apps do not block a comparison of recorded
totals; they produce a visible limitation because source or priority changes can affect the difference. Coverage shows
recent and baseline day counts separately. Recorded sleep is grouped within midnight-to-midnight windows, not
presented as a last-night or recovery score. Thresholds are exploratory display rules, not medical limits.

This requires an Android native development build; **Expo Go cannot load Health Connect**. After dependency installation:

```sh
pnpm --filter @health-coach/mobile android
```

This builds and installs the development app on a connected Android device or emulator. Subsequent `pnpm dev` starts
Metro for that development client. Configure the existing Supabase connection and owner sign-in as described below.
Your wearable's companion app must actually share the desired records with Health Connect; a Google Fit connection alone
does not establish availability. The screen shows measured-day coverage and source origins. No background sync or
notifications are implemented in this slice.

The calculated comparison stays on the phone until **Explain these changes with AI** is selected. The optional question
field lets the owner ask about that comparison or supply context. This is a bounded question, not unrestricted chat:
other health records are not retrieved, and reported context does not update the canonical record.

For server explanations, set `EXPO_PUBLIC_HEALTH_COACH_API_URL` in the ignored mobile environment to the reachable private
Next.js server URL. `pnpm dev:phone` configures a physical phone to use localhost debugging tunnels; an Android emulator
normally uses `http://10.0.2.2:3000`.
Release clients require HTTPS. The endpoint authenticates the Supabase bearer token and checks the configured owner,
independently of the desktop intake's Basic authentication gate.

Apply the new migration only to the intended database through the existing migration workflow. To enable paid generation,
configure these **server-only** variables in the ignored web environment after choosing a model, reviewing provider data
handling and authorizing its cost:

```dotenv
WEARABLE_AI_ENABLED=true
WEARABLE_REVIEW_MODEL=openai/gpt-6.1-terra
AI_GATEWAY_API_KEY=your-private-key
```

No model is selected by default. Without that configuration the endpoint returns the deterministic comparison without a
model call. Generation uses low reasoning effort, a 30-second timeout, a 2,048 output-token limit (including reasoning)
and no retries. Gateway routing requires no prompt training. OpenAI response storage and reasoning summaries are disabled;
this does not enable zero data retention. Standard provider abuse-monitoring retention can still apply (normally up to
30 days for OpenAI, subject to exceptions). Database reservations limit
new attempts to five per rolling 24 hours and reuse identical successful requests; this is a request bound, not a monetary
budget. Pricing depends on the selected model and must be established before live use.

The development helpers separate configuration from a paid readiness check:

```sh
# Public catalog: newest OpenAI models, prices and supported reasoning levels; no key or paid call.
pnpm ai:models

# Optional: create a new key in an explicitly selected Vercel team (Vercel CLI required).
# US$1 total, no renewal, seven-day expiry; writes only apps/web/.env.local and preserves existing keys.
pnpm ai:key:create --team your-vercel-team

# Explicitly authorize one synthetic generation using the configured server model and its real SDK settings.
pnpm ai:smoke --allow-paid
```

Key setup captures CLI output privately; it never prints a credential or enables AI. If creating a key succeeds but
saving it fails, revoke the named **Health Coach local development** key in Vercel before retrying. The smoke check
uses invented totals, does not access health records or write a review, and reports only success, usage and latency.
A working key alone does not prove model/account compatibility; run the explicit smoke check after changing the model
or provider options. It is excluded from `pnpm verify` and CI.

`pnpm verify` includes tooling regression tests and a narrow check for recognizable Gateway/OpenAI credentials and
private-key headers in tracked or unignored source files. This check prints filenames only; it does not scan ignored
private configuration or establish that a file is free of personal health data or every possible credential type.

The private server retains derived daily snapshots, comparisons, the owner's question, model/prompt versions, output,
latency, token counts and optional Useful / Not useful / Concerning feedback. The model receives only calculated
comparisons, coverage, limitations and the question, not the raw stream, full daily snapshot, genome or other records.
SDK telemetry is disabled. Evidence-reference checks reject unavailable signals; they do **not** establish that every
generated claim is correct. Human review must check support, causal overreach, inappropriate advice and usefulness.
Do not enable content-capturing developer tools against private records without an explicit privacy decision.

### Replay evaluation

Keep cases and outputs in an ignored private location. `pnpm eval:wearable:local <path>` reads a JSON array of cases;
each case has `snapshot` (the wearable snapshot contract), `asOf` (the original review timestamp), `expectedStatus`
(`change`, `no-change` or `insufficient-data`), `expectedEvidenceIds` (`steps` and/or `sleepMinutes`), and optionally
`explanation` (a captured structured model response). The snapshot's sync time must be within one hour of `asOf`, and
its days must end before that date in its captured timezone. Replays cannot include future days.

The command makes no model calls and prints aggregate pass counts only. It checks comparison outcomes, evidence
availability and explanation structure/references; it does not grade clinical accuracy or semantic groundedness.
Use the same private cases before/after prompt or model changes, with owner review of factual support, uncertainty,
appropriate abstention and usefulness. No private case content belongs in Git.

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

### Durable Health Reviews

Relevant genetic, laboratory, and source-quality changes write a single coalesced Health Review request to Supabase. An Inngest dispatcher sends only the request UUID to the worker; the worker fetches the bounded evidence server-side, retries failures, and checks freshness before publishing. A changed request is requeued rather than allowed to publish a stale conclusion. The weekly review runs Monday at 9:00am Australia/Sydney.

For local durable-workflow development, start Supabase once, then `pnpm dev`. It starts the web and Android development processes plus the local Inngest Dev Server. The web process sets `INNGEST_DEV=1` automatically; dummy local event credentials are sufficient if the Inngest SDK asks for them.

```sh
pnpm supabase:start
pnpm dev
```

The Inngest Dev Server UI is available at `http://localhost:8288`. Use `pnpm dev:apps` when you only want the web and Android app processes.

Operational Traces contain only lifecycle metadata (run ID, status, version, and a bounded error category), never medical content. Richer evaluation snapshots are held in the access-controlled database, never in this repository or workflow event payloads. In the Android app, the owner can privately rate a surfaced investigation **Useful**, **Not useful**, or **Concerning**. Generate a local aggregate quality report—counts only, no health content—with:

```sh
pnpm quality:health-review:local
```

For the Android app, set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the ignored `apps/mobile/.env.local` file. They are public client configuration; the mobile app signs in as the owner and relies on Supabase row-level security. Service-role keys and production passwords belong only on the server. The optional local-development prefill below uses a throwaway local account.

### Local Android sign-in

The email/password screen is a local-development bridge. It creates one test-only
account, `owner@local.invalid`; it is not the production auth design.

1. Start local Supabase, then set a throwaway password in the ignored
   `apps/web/.env.local` file:

   ```dotenv
   LOCAL_OWNER_PASSWORD=choose-a-local-only-password
   ```

2. Bootstrap (or update) the local owner. The password is never printed:

   ```bash
   pnpm supabase:owner
   ```

3. Configure the ignored `apps/mobile/.env.local` file. For an Android
   emulator, use:

   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321
   EXPO_PUBLIC_SUPABASE_ANON_KEY=the-anon-key-from-apps-web-env-local
   ```

   On a physical Android device, use `pnpm dev:phone` as described below. It configures localhost endpoints and the
   matching public client key. It also copies the throwaway local password to `EXPO_PUBLIC_LOCAL_OWNER_PASSWORD` for
   prefill; that value is bundled into the development client. Prefill is enabled only in development builds pointed
   at localhost or the Android emulator. Production credentials must not be used for this account.

4. Start Expo with a cleared bundle cache, then sign in as
   `owner@local.invalid` with that local-only password:

   ```bash
   pnpm --filter @health-coach/mobile exec expo start --dev-client --clear
   ```

Production authentication will use Google Sign-In, Supabase Auth/RLS, and
platform-secure session storage.

### Physical Android phone: USB or wireless debugging

Install the native development build once with `pnpm --filter @health-coach/mobile android`. For wireless debugging,
connect the phone and computer to the same Wi-Fi, enable **Developer options → Wireless debugging**, and choose
**Pair device with pairing code**. Run `adb pair PHONE_IP:PAIRING_PORT` and enter the code at its prompt. If the paired
phone does not connect automatically, run `adb connect PHONE_IP:CONNECTION_PORT` using the separate connection port
on the main Wireless debugging page. Keep Wireless debugging enabled. USB also works after accepting its debugging prompt.

```sh
pnpm doctor:phone       # Diagnose the device, installed app, tunnels, local config/auth and server reachability.
pnpm dev:phone          # Configure local endpoints, restore tunnels, start missing servers and open the installed app.
pnpm dev:phone:restart  # Restart a stack managed by dev:phone and reopen the app.
# With multiple connected devices, add --device DEVICE_ID to either command.
```

These commands require the existing local Supabase stack and local owner account. They never start/reset/migrate a
database, install an app, change a password, read health records or invoke a model. `dev:phone` verifies local sign-in
before changing mobile configuration. It forwards ports 8081, 54321 and 3000 over the selected debugging connection.
New Metro and web servers listen on loopback only; Metro prefers IPv4 so the forwarded address is reachable.
Existing reachable servers are reused; unrelated applications on the required ports are left untouched.
Restart works when the running supervisor started both web and Metro. It leaves reused or unmanaged servers untouched;
stop their original owner first if a full restart is needed. A restart reopens the app, which signs the owner out.

Keep `dev:phone` running when it starts servers; Ctrl-C stops only those servers it started. Private server output goes
to ignored `.scratch/dev-phone/web.log` and `metro.log`, rather than the chat or repository. Metro reloads the app as
files change, but it does not check types, so a watching `tsc` writes mobile type errors to `typecheck.log` alongside. Existing Metro instances
may require an app reload after environment changes. This remains a development flow requiring the computer and
debugging connection, not a deployed daily-use app. The static `verify:local-dev` check validates task declarations;
`doctor:phone` checks actual runtime readiness.

Next.js agent-file generation is disabled; the repository's root `AGENTS.md` remains the instruction entry point.

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

After each Ancestry or I-Screen import, the app queues the single bounded iron-regulation panel. The panel can surface a confirmation-oriented C282Y homozygous premise, or a lab-led clinician-review prompt when a source-backed ferritin result is above its laboratory reference range alongside one direct-to-consumer C282Y allele. Neither route diagnoses iron overload or recommends treatment; missing or out-of-scope data is not treated as a negative result. To re-run the current local record without importing again:

```sh
pnpm review:iron-regulation:local
```

The importer saves normalized variants and source provenance only; it does not retain the export. To import the same normalized data into the hosted project after reviewing it locally, configure that project's owner UUID in ignored root `.env.local` and run `pnpm import:ancestry:production`.

Before either import, explicitly set `ANCESTRY_GENOME_BUILD` to `GRCh37` or `GRCh38` in that ignored environment file only after validating the export metadata. The importer refuses an unknown build rather than guessing it.

An I-Screen import also queues the bounded iron-regulation Health Review. The review reads only the `rs1800562` call and ferritin/transferrin-saturation results needed by the curated panel; a direct-to-consumer call is contextual only and never establishes a diagnosis or treatment need.

## Deliberate boundaries

- The web app is an intake surface, not a general dashboard.
- The Android app owns the ongoing conversation, evidence, recommendations, Health Follow-ups, blood pressure, and Supplement Regimens.
- Provider interpretations are attributed source material, not verified Health Observations.
- The model gets only bounded retrieval results, never a bulk genome or whole personal profile by default.
- Telegram, Health Connect, Daily Guidance, active Health Experiments, and broad dashboard views are planned later work.
