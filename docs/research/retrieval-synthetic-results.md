# Synthetic cloud retrieval results

Run: 2026-11-02T23:40:56.614Z. Code: dea912f, branch experiment/markdown-retrieval.

Semantic retrieval recovered the labeled evidence in this small synthetic test.
Hybrid produced identical rankings and no additional evidence. Most elapsed time
was spent obtaining the query embedding, rather than executing Postgres search.
This is a useful architecture demonstration, not a final retrieval selection.

## Conditions

- 76 invented workshop notes, one attributed section each; 60 notes are similar archive distractors. No health data.
- 12 questions: 10 answerable, requiring 11 passages; 2 deliberately unanswerable. Authored labels fixed before the run, with development/holdout labels and no tuning.
- Hosted Supabase in Sydney (ap-southeast-2), authenticated PostgREST requests from the development Mac. This is not installed Android or Mac-off proof.
- OpenAI text-embedding-3-small, 1,536 dimensions, through Vercel AI Gateway. Exact cosine vector search; no HNSW, answer generation or reranking.
- Keyword: English full-text websearch_to_tsquery applied directly to each full question. Its remaining terms generally require AND matches. Hybrid: reciprocal-rank fusion, constant 60.
- Six passes with rotating method order. Each method has 72 samples: 12 first-pass plus 60 warm samples. Query embeddings are uncached. Top-five quality is evaluated by truncating the measured top-ten ranking; latency includes fetching up to ten results.

## Results

Times below are milliseconds. Recall counts required passages across the ten
answerable questions. The two missing-evidence questions are assessed separately.

| Method   | Found at top 5 | Found at top 10 | Total warm p50 | Total warm p95 | Embedding warm p95 | Database warm p95 |
| -------- | -------------- | --------------- | -------------- | -------------- | ------------------ | ----------------- |
| keyword  | 2/11           | 2/11            | 35.6           | 74.2           | 0.0                | 2.51              |
| semantic | 11/11          | 11/11           | 750.3          | 961.4          | 877.4              | 4.41              |
| hybrid   | 11/11          | 11/11           | 750.7          | 874.8          | 789.5              | 5.91              |

Semantic and hybrid recovered 11/11 required passages (100%); the literal
keyword baseline recovered 2/11 (18.2%). All required evidence was already in
the first five results. Adding hybrid fusion changed none of the returned
rankings in this run. The latency difference between semantic and hybrid p95 is
not evidence of a speed advantage: their medians were both about 751 ms, with
separate embedding requests and only one small run.

Keyword's short latency is partly a consequence of returning no results for
most questions, so there was usually no context fetch. This is a weak literal
keyword baseline, not a finding that keyword search in general is ineffective.
Query normalization, OR matching or identifier-aware queries could change it;
they were not tested.

Search round-trip p95 was 53.2 ms for semantic and 63.1 ms
for hybrid. Context-fetch p95 was 49.7 ms and 53.1 ms respectively.
Embedding timing includes Gateway routing and local budget-ledger work. Database
time is inside search round-trip time; their difference includes networking,
authentication, serialization and API overhead. Stage percentiles do not add up
to the percentile of their sum.

First-pass totals (12 samples each, not guaranteed cold):

| Method   | p50 ms | p95 ms |
| -------- | ------ | ------ |
| keyword  | 35.9   | 71.0   |
| semantic | 754.3  | 932.4  |
| hybrid   | 768.2  | 946.5  |

## Missing evidence and context quality

Both semantic and hybrid returned ten unrelated neighbors for each of the two
unanswerable questions. Keyword returned none. No abstention rule was tested.
A model must not turn those neighbors into a supported answer.

For the ten answerable questions, semantic/hybrid returned 100 passages at top
ten, of which 11 were labeled required. At top five, 11 of 50 were required.
Recall alone therefore hides substantial irrelevant context. These are authored
required-passage labels, not a comprehensive human relevance grading. The test
does not establish clinical correctness or whether a generated answer would
respect corrected values.

| Question                      | Required evidence     | Keyword found at 5 | Semantic found at 5 | Hybrid found at 5 |
| ----------------------------- | --------------------- | ------------------ | ------------------- | ----------------- |
| q01: explicit (development)   | access                | 1                  | 1                   | 1                 |
| q02: explicit (development)   | hours                 | 0                  | 1                   | 1                 |
| q03: paraphrase (development) | quiet                 | 0                  | 1                   | 1                 |
| q04: explicit (development)   | repairs               | 1                  | 1                   | 1                 |
| q05: identifier (holdout)     | printer               | 0                  | 1                   | 1                 |
| q06: paraphrase (holdout)     | ventilation           | 0                  | 1                   | 1                 |
| q07: multi-section (holdout)  | delivery, cleanup     | 0                  | 2                   | 2                 |
| q08: explicit (development)   | training              | 0                  | 1                   | 1                 |
| q09: correction (holdout)     | fees                  | 0                  | 1                   | 1                 |
| q10: table (holdout)          | table                 | 0                  | 1                   | 1                 |
| q11: missing (holdout)        | No supporting passage | 0                  | 0                   | 0                 |
| q12: missing (holdout)        | No supporting passage | 0                  | 0                   | 0                 |

The paraphrase “Where can I concentrate without people talking?” retrieved the
quiet-room note first with semantic/hybrid. The multi-section delivery/closing
question retrieved both required notes. The missing Wi-Fi-password question
returned the access note first despite that note containing no password. These
examples illustrate both the benefit and the unsupported-answer risk.

## Lifecycle, isolation and cost

- Hosted checks passed: anonymous access denied; owner-isolated reads and search; fetched citation revisions; idempotent publication; updated text with checked heading/source ranges; old revision removed; deletion left no retrievable evidence. No cache layer exists in this experiment.
- Temporary synthetic rows and both synthetic sign-in users were removed; cleanup reported zero remaining accounts. Experiment table/functions remain installed. Existing application tables were not modified.
- Initial embedding plus publication: 3977.1 ms; publication alone: 1009.6 ms. Combined no-op/update/delete lifecycle check: 2667.9 ms. This combined figure does not isolate incremental stages.
- Allocated table/index storage before deletion: 835584 bytes (816 KiB). It is allocation, not a linear storage-per-document model.
- 146 embedding calls: one corpus batch, 144 uncached question calls and one edited-section call. API-reported total: 4244 tokens. Token-based estimated embedding charge: US$0.00008488 at US$0.02/million. Conservative ledger reservation: US$0.00097768; well below the US$1 cap. This is not a billing reconciliation or Supabase plan-cost estimate.

Raw timings, budget ledger and cleanup evidence remain in ignored local
private-data/retrieval-cloud files. Public results omit project identifiers,
credentials, account IDs and source paths.

## What the result supports

Exact Postgres vector retrieval is a viable baseline to evaluate further. At
this size, optimizing a few milliseconds of database work has little effect
on the roughly 0.75-second median complete semantic request. HNSW has no measured
justification here. This does not predict behavior at a much larger corpus or
under concurrency. Hybrid has not earned adoption over semantic search in this
test. A stronger keyword baseline and explicit missing-evidence handling remain
valuable comparisons before choosing a production design.

The provisional 80% required-passage target passed for semantic/hybrid and failed
for the literal keyword baseline. Their warm p95 totals were below the provisional
2-second retrieval target on the tested Mac-to-cloud path. Hosted isolation and
lifecycle checks passed. Private vault relevance, full Markdown/table preparation,
concurrent load, mobile performance, Mac-off use and answer support remain
unverified. No app integration or production retrieval choice is implied.
