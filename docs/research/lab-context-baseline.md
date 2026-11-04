# Integrated lab context baseline

4 November 2026. Implementation evidence for [RAY-238](https://linear.app/cashmore/issue/RAY-238).
Linear owns the design, proposed evaluation cases and remaining execution decisions.

## What works locally

The experiment joins a selected structured lab panel, a dated activity snapshot
and full-text Markdown retrieval into one evidence packet, then invokes one
injected AI SDK model. The candidate for a later real run is
`openai/gpt-6.1-terra` with medium reasoning; it remains configurable. The local
verification uses a fake model and never sends a request to AI Gateway or Langfuse.

Run from the repository root with Docker running:

```sh
pnpm lab-context:verify
```

This creates its own disposable `postgres:17-alpine` container, bound to a random
loopback port, with an in-memory database filesystem. It installs only the
experiment schema, uses a non-superuser role, and removes its container and
temporary Markdown inputs in `finally`. It does not connect to the existing
Supabase stack, read environment credentials, or reset a database. The command
may download the public Docker image if absent. If forcibly terminated before
cleanup, remove only the container identified by its `hc-context-` name and
`health-coach.synthetic=lab-context` label.

An inspectable local report is written to the gitignored
`private-data/lab-context-synthetic/report.json`. It contains the invented evidence,
fake answers, draft-label scores and recording-exporter spans. This is contract
verification, not an approved owner evaluation dataset or a retrieval-quality
comparison. Keep future representative reports in authorized private storage.

Six integrated cases passed: complete context, missing activity, undated notes,
conflicting notes, corrected evidence and paraphrased wording. Checks also covered
failed/stale publication, explicit removal, tombstones, anonymous denial,
cross-owner database isolation and old-revision invalidation. Unit tests cover
input overflow, uncertain panel identity, duplicate activity dates, unavailable
citations, a revision changed during generation and recording failure without
repeating the model call.

## How it is bounded

- Panel selection requires a known collection date and an unambiguous latest
  panel. It retains at most ten analytes and reports omissions. It does not infer
  panel membership from independent latest observations or promote an import
  timestamp into a collection date.
- Activity uses fourteen complete local-calendar days before collection and
  before request, showing separate step/sleep coverage. Missing days remain
  missing. The snapshot is frozen input; there is no new wearable sync.
- Local Markdown authoring stays canonical. `prepareContextPublication` reuses
  the existing path-constrained Markdown parser, content hashes and document
  identity. Dates are explicitly supplied; frontmatter is not verified chronology.
  SQL publication atomically replaces a complete projection under a revision
  check. Disappearing documents require explicit removal. Source bodies are
  removed from the active projection; tombstones retain document identities.
- Postgres uses a generated English `tsvector`, GIN and parameterized ranked
  search. Deterministic terms come from the question and selected analyte names
  and aliases. Owner, revision and date scope apply before generation. Undated
  matches are identified separately; at most five sections enter packing.
- Whole sections are packed deterministically. UTF-8 bytes conservatively bound
  byte-level tokenizer tokens; schema/instruction/framing reserve also counts
  toward the 12,000 input limit. Notes have a 6,000-byte conservative allowance.
  Mandatory overflow fails before generation; omitted notes remain visible.
- Generation caps billable output at 6,000 tokens including reasoning, disables
  SDK telemetry and retries, requests structured findings and rejects unknown
  evidence IDs. Revision freshness is checked before and after generation.
  Findings remain `needs-human-review`: valid citations do not establish support,
  correct interpretation, absence of forbidden claims or usefulness.

The schema in `scripts/lab-context/schema.sql` is a local experiment, **not a
production migration**. Its session owner is assigned by the trusted local
runner. A hosted endpoint must establish authenticated identity before using a
store; this session setting does not authenticate an untrusted caller.

## Tracing and evaluation

`operationalRecorder` builds spans from a validated field allowlist using a
dedicated OpenTelemetry provider that is never registered globally. It receives
no model prompt, answer, note, lab value, source name, real source ID or raw error.
Model, reasoning, contract version, opaque case/publication IDs, counts, durations,
usage and a labelled Standard-rate cost estimate can be recorded. Costs for
unknown models remain unknown; fake usage is not priced as Terra usage.

`langfuseRecorder` supplies the Langfuse 6.1.1 processor and client for later
authorized export. It requires an explicit HTTPS origin and keys. It uses current
OTLP tracing and numeric score APIs, not legacy trace ingestion. Numeric score
names and ranges are allowlisted. The dedicated provider limits collection
before masking would be needed; it does not attempt to redact health text after
collecting it. Recording failure is visible and never causes another model call.

Retrieval recall and irrelevant-section counts are distinct from citation
validity. Empty required-evidence labels produce an unknown recall value, not a
perfect score. Claim support, conflicts/gaps, comprehension and usefulness need
human review. Live datasets, evaluator labels and expected answers are still
proposals in Linear; none was created in Langfuse.

The first authorized live transport check below fetched the actual observations
and scores. Export flush alone still does not prove server acceptance; keep the
read-back audit when changing instrumentation. Prompts, answers and reasoning
content intentionally remain local under the metadata-only policy.

## What remains unproved

Representative private usefulness, broader Terra answer quality, hosted
authentication, Android/Mac-off operation and clinical validity remain unproved.
The live check below establishes only bounded synthetic generation and trace
transport. No vectors were added. The later vector experiment must keep
structured snapshots, corpus, chunks, cases, model, reasoning and prompt fixed,
then report misses and regressions as well as improvements.

The local runner accepts explicit structured fixtures. It does not yet select
and authorize actual provider records or read Health Connect itself. Real source
adapters require the agreed panel/date mapping and exact private subset; private
uploads and paid runs require their own destination and spending authority.

The important engineering result is that one integrated path can test source
lifecycle, bounds and trace privacy without making a model call. It does not
answer whether the generated result helps the owner understand their labs.

References: [AI SDK generation](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text),
[Terra model](https://developers.openai.com/api/docs/models/gpt-6.1-terra),
[Langfuse current ingestion](https://langfuse.com/integrations/native/opentelemetry/migration-to-v4),
[Langfuse scores](https://langfuse.com/docs/evaluation/evaluation-methods/scores-via-sdk).

## First live transport check

4 November 2026. The owner selected a Langfuse US project and a US$5 total model
allowance. Exact destination identity, keys and trace receipts remain in private
local storage; no account identifiers or credentials are recorded here. Project
identity was verified through the Langfuse CLI before export.

One integrated synthetic case used real GPT-6.1 Terra at medium reasoning through
AI Gateway, with Standard OpenAI routing and no retries. A new durable local ledger
reserved US$0.10 before dispatch against the US$5 cap. It retains reservations on
all outcomes and blocks further calls after an uncertain outcome. Two budget
regressions verify pre-dispatch reservation/exhaustion and uncertain-call blocking.
An independent engineering review supported execution after cleanup was hardened
so exporter failure cannot skip database/container cleanup.

The call returned a structured, cited answer with 738 input and 473 total output
tokens, including any reasoning. The published Standard-rate estimate is
US$0.003103, before cache/provider billing adjustments; this is not an invoice.
The ledger retains US$0.10. No additional model call was needed.

The Langfuse read-back audit found four observations with the expected hierarchy:
CHAIN root, TOOL structured read, RETRIEVER full-text search, and GENERATION with
Terra, medium reasoning, token usage and labelled estimated cost. Three numeric
scores arrived: required-passage recall 1, irrelevant sections 0, citation validity

1. They describe this toy case, not claim support or owner usefulness. No dataset
   was created.

A second inspection caught an SDK default outside the application allowlist:
OpenTelemetry's default service name included a local executable path. We set an
explicit generic service resource, added a resource-name regression, requested deletion of the
affected trace and its scores, and re-exported the saved operational metadata.
The replacement preserves the original execution end time and is labelled
metadata-replay. This made no model call. A fresh CLI read verified the replacement has the generic service name, all four
observations, all three scores, and no input/output or source content. The
original deletion completed asynchronously; a final modern-API read returned no
original observations or scores and no continuation cursor.
See [Langfuse deletion timing](https://langfuse.com/docs/administration/data-deletion).

Lesson: a field allowlist is not sufficient if the telemetry SDK adds identifying
resource metadata. Audit the received trace, including SDK resource attributes.
Fresh Langfuse best-practice guidance informed the audit; omitted content and
reasoning text are deliberate privacy boundaries rather than accidental gaps.

The model also distinguished the fixture's collection/note dates from its newer
publication time. Historical replay would need a publication available as of the
question, not merely old authored dates. This toy transport check does not prove
that historical availability contract or private usefulness.
