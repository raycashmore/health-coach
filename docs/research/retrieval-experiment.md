# Local retrieval preparation experiment

The experiment brief and decisions live in Linear RAY-238. This command tests
local preparation only; it does not publish, embed or search documents.

```sh
pnpm retrieval:prepare /absolute/path/to/synthetic-notes note.md folder/other.md
```

Each run supplies the **complete desired selection**. Omitted documents disappear
from the active snapshot. Pass `ROOT --empty` to remove the final document. Output is private, ignored
`private-data/retrieval/prepared.json`, including source paths and source text.
Do not copy this file into a tracked document or attach it to an issue. Logs show
counts only. A failed read leaves the prior snapshot intact. Use one publisher
process at a time; concurrent runs are unsupported.

The snapshot contains opaque document IDs, content revisions, section IDs,
heading paths, inclusive source line ranges and unverified-wiki provenance.
Unchanged documents retain IDs and revisions. A unique unchanged-content rename
retains identity; ambiguous renames become deletion/addition. Changed text gets a
new revision and new citation IDs. A revision hashes content plus preparation version and budget, so changing chunk
boundaries also invalidates citations. The separate content hash tracks source
changes; neither hash is a medical date. Frontmatter is preserved verbatim, without interpreting its fields.

Preparation uses a 4,000-byte bound, not a provider-specific token estimate.
Ordinary long sections subdivide at line boundaries, which can separate a claim
from qualifications. Inspect retrieval context before relying on the chunks.
Tables and fenced blocks remain atomic to preserve headers, units and syntax.
Oversized blocks are retained with a warning and block indexing. This deliberately
stops short of the brief's proposed table subdivision: a later step must repeat
headers with accurate source mappings before those tables can be indexed.
Unresolved links are flagged; their targets and attachments are not ingested.
Only ATX headings and pipe tables are recognized; other Markdown remains raw
text. This is a bounded experiment parser, not a full Markdown implementation.

This manifest is local preparation state, **not** a successful cloud publication
record. Cloud publication must separately provide authenticated owner isolation,
atomic activation, revision validation and deletion of cached/embedded evidence.
It must refuse a snapshot whose `readyForIndexing` flag is false.

Run the synthetic behavior checks with:

```sh
node --test scripts/retrieval-preparation.test.mjs
```

They exercise no-op, edit, rename, deletion, source reconstruction, tables, fences,
oversized evidence and path isolation. These checks do not measure retrieval
quality or establish hosted latency. Next: settle the corpus, provider, spending
limit and destination, then compare keyword, exact vector and hybrid retrieval on
the same judged questions, timing each stage separately.

## Synthetic cloud comparison harness

The owner approved a synthetic dataset in the existing Supabase project and
OpenAI embeddings with a US$1 total embedding budget. The harness accepts only
its checked-in workshop fixtures, never a vault path or prepared private snapshot.
It uses `text-embedding-3-small` (1,536 dimensions) and a persisted conservative
budget reservation before every call. Reservations survive uncertain failures;
measured API tokens are recorded separately. Do not delete/reset the budget
ledger between runs. Concurrent embedding writers fail closed.

```sh
HC_RETRIEVAL_PROJECT_REF=verified-project-reference \
HC_SUPABASE_TOKEN_FILE=/private/path/to/management-token \
HC_OPENAI_KEY_FILE=/private/path/to/openai-key \
pnpm retrieval:experiment --cloud
```

Credential files come from secure secret entry, never tracked files or chat.
The command verifies the active project, installs only the namespaced experiment
SQL in `scripts/retrieval/experiment.sql`, creates two temporary synthetic sign-in
accounts and tests authenticated PostgREST retrieval. It does not apply the app's
migration history, reset a database, deploy an app or read health tables. The
experiment table and RPC definitions remain installed; rows and temporary users
are removed in a `finally` block. An ignored recovery journal blocks a new run
when an earlier run still needs cleanup. Process termination can require manual
cleanup using that journal; do not assume cleanup succeeded after a crash.

The fixed corpus has 76 workshop notes and 12 authored questions, including
paraphrase, identifier, multi-section, correction, table and absent evidence.
These labels are synthetic checks to inspect, not owner-grounded relevance
judgments. No parameters are tuned on the held-out questions. The three methods
use the same sections, English Postgres full-text search, exact cosine distance
and reciprocal-rank fusion (constant 60). There is no vector similarity cutoff;
semantic and hybrid methods return neighbors even for absent evidence. Record
that failure mode rather than interpreting returned neighbors as answer support.

Six passes yield 60 warm samples per method plus 12 first-pass samples. The first
pass is not guaranteed cold. Method order rotates. Query embeddings are uncached
and timed for each semantic/hybrid request. Timings separate API embedding,
PostgREST search round trip, in-function database execution, context fetch and
total retrieval. Database time is inside search time; the difference also includes
API serialization/overhead and is not a pure network measurement. Context is
bounded to 6,000 bytes, conservatively below the proposed token budget. Table size
includes indexes and allocation; a small corpus says little about scale.

Results, sample timings, usage and cleanup state go to ignored
`private-data/retrieval-cloud/`. Budget is based on the verified [$0.02 per million
input tokens](https://developers.openai.com/api/docs/models/text-embedding-3-small),
with UTF-8 bytes plus overhead as a conservative token bound and a twofold price
margin. This guard covers this harness's calls, not other callers on the key.
[Embedding API reference](https://developers.openai.com/api/reference/resources/embeddings/methods/create).

A hosted comparison from the Mac establishes cloud retrieval behavior. It does
not establish an installed mobile flow or operation with the Mac switched off.
Those acceptance checks remain separate. HNSW is intentionally deferred until
exact search on the measured corpus shows a reason to trade recall for speed.

Local SQL verification is separate from the cloud benchmark. In a disposable
Supabase Postgres container, apply `scripts/retrieval/experiment.sql`, then
`scripts/retrieval/verify-experiment.sql` with `psql -v ON_ERROR_STOP=1`. The
behavioral SQL check rolls its data back and verifies all three methods,
owner RLS, anonymous denial, limits, failed-publication atomicity and deletion.
Do not run this against the owner's health database. The runner also takes an
exclusive run lock and atomically journals intended synthetic accounts before
creation, so timeouts retain enough information for cleanup.
