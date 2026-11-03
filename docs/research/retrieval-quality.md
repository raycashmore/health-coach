# Retrieval quality experiment

RAY-265 extends the frozen `workshop-v1` corpus and original twelve questions
without changing them. The historical cloud results remain in
[retrieval-synthetic-results.md](retrieval-synthetic-results.md). This is synthetic
learning evidence, not private relevance, health validation or an app capability.

## Reproduce and inspect

Run `node scripts/inspect-retrieval-quality.mjs` for the no-spend local increment.
Inspect `private-data/retrieval-quality/local.json`: each question appears beside
at most five complete source excerpts, section/document identity, SHA-256 active
revision, heading path and line range. Output is JSON for local inspection.
No viewer, service or answer generator is needed.

Run `pnpm retrieval:experiment --cloud --quality` with the existing verified
project selection and ignored credentials to compare all three hosted methods.
This uses the existing cumulative embedding ledger without resetting it. The
quality result is saved separately as `private-data/retrieval-cloud/quality-results.json`;
the historical `results.json` is preserved. Existing cloud isolation, citation,
replacement, deletion and cleanup checks still run. See the
[cloud experiment procedure](retrieval-experiment.md) for authority and recovery.

## Frozen rubric and boundaries

`scripts/retrieval/quality.mjs` defines the rubric and labels before execution.
The original questions retain their development/holdout split. Four added cases
include misleading neighbors and partial support in both splits. Original
identifier and multi-section holdouts remain. These are authored judgments;
required document labels measure retrieval coverage, not entailment or factual
correctness. Partial cases label the available source and the missing requested
fact remains unsupported.

The new keyword formulation lowercases alphanumeric terms, preserves hyphenated
identifiers, removes a fixed list of question words and ORs the remaining terms.
The local check ranks exact token overlap. Hosted keyword search uses the same
OR formulation with existing English Postgres stemming/ranking. These local and
hosted rankings are different baselines, explicitly labeled in output. Semantic
embeddings still use the original question. Hybrid fuses original-question
semantic ranking with the stronger lexical formulation. No model rewriting,
threshold fitting, reranking or holdout tuning occurs.

No defensible automatic support classifier is claimed: empty retrieval produces
`no-support-found`; nonempty retrieval produces `review-needed`. Corpus absence
cannot be inferred from empty retrieval. Candidate evidence and partial support
are reference labels for inspection, never automatic conclusions from a score.
Zero unsupported acceptance follows from accepting nothing automatically; it is
not evidence of a good classifier. Review workload and false abstention must be
read beside it. No answers are generated.

Each split reports required/found passages, returned/irrelevant context,
unsupported cases/acceptances, answerable cases/false abstentions, automatic
acceptances and review-needed counts. False abstention here means an empty result
for a fully answerable question; unresolved nonempty results are review-needed,
not successful answer decisions. Timing retains first-pass/warm distinction,
embedding/search/database/fetch/total stages and sample counts; first pass is not
necessarily cold. Usage and cumulative budget remain in the ignored cloud output.

## Result

Completed 3 November 2026 from the development Mac against the previously
verified hosted synthetic destination. Six passes, 16 questions, 96 samples per
method (16 first-pass, 80 warm). No tuning or second held-out run.

| Method           | Development recall | Holdout recall | Development irrelevant/returned | Holdout irrelevant/returned | Development false abstentions | Holdout false abstentions | Development review-needed | Holdout review-needed |
| ---------------- | ------------------ | -------------- | ------------------------------- | --------------------------- | ----------------------------- | ------------------------- | ------------------------- | --------------------- |
| Stronger keyword | 5/6                | 7/7            | 6/11                            | 20/27                       | 1/5                           | 0/5                       | 6/7                       | 8/9                   |
| Exact semantic   | 6/6                | 7/7            | 29/35                           | 38/45                       | 0/5                           | 0/5                       | 7/7                       | 9/9                   |
| Hybrid           | 6/6                | 7/7            | 29/35                           | 38/45                       | 0/5                           | 0/5                       | 7/7                       | 9/9                   |

All methods accept 0/2 unsupported development cases and 0/4 unsupported holdout
cases automatically, because there are **zero automatic acceptances**. These are
policy/workload measurements, not successful support discrimination.
The stronger keyword baseline retrieves 10/11 original required passages versus
the historical literal-AND baseline's 2/11. Across all cases it retrieves 12/13.
Semantic/hybrid recover the development paraphrase miss, but add no held-out
required passage over the stronger keyword method. This tiny holdout cannot
establish equivalence; hybrid complexity has no demonstrated recall benefit here.

Examples to inspect in each method's `inspection` array:

- q03: the fully answerable quiet-work paraphrase is empty under keyword, but
  semantic/hybrid retrieve the quiet-work source; it still requires review.
- q15: the charging-cabinet source describes storage, not an access code. All
  methods retrieve related text and correctly leave the outcome review-needed.
- q16: the delivery source supports the entrance, but no delivery charge. A fee
  passage is a membership fee, not delivery pricing. These remain partial labels
  and review-needed results, never inferred answers.
- q05/q07: identifier and two-source delivery/closing requirements resolve to
  their active source revisions and ranges.

Warm latency in milliseconds (p50/p95):

| Method   | Embedding   | Search round trip | Database (within search) | Context fetch | Total       |
| -------- | ----------- | ----------------- | ------------------------ | ------------- | ----------- |
| Keyword  | 0/0         | 35.6/48.5         | 1.2/4.9                  | 34.8/45.5     | 71.1/90.3   |
| Semantic | 677.9/798.0 | 43.0/56.2         | 3.1/3.3                  | 36.5/58.1     | 756.5/887.3 |
| Hybrid   | 674.7/868.5 | 44.7/70.2         | 4.0/7.5                  | 38.2/51.1     | 764.6/946.3 |

First-pass rows remain separately available in ignored output, without claiming
cold caches. Embedding usage: 4,724 tokens, estimated US$0.00009448 at the harness
rate. Cumulative reserved budget after this run: US$0.00207824 of the existing
US$1 grant. Reservations include conservative margin and differ from measured
cost; no ledger was reset. Original baseline output was preserved.

Anonymous denial, owner isolation, citation revision resolution, idempotent
replacement, edit and deletion checks passed. Final cleanup has zero remaining
synthetic users; the recovery journal is empty. No app deployment or private
upload occurred.

## Verdict and review

Implementation: local inspection, frozen cases, stronger keyword cloud mode and
regression checks complete. `pnpm verify` passed; targeted checks passed after
small reporting refinements. Independent Standards and Spec reviews of the
pinned implementation found no material defects. Reviewer ambiguity about a
separate plain-absent development case is bounded: misleading-neighbor cases
are labeled absent in both splits; plain missing questions remain held out.
No fixture changes were made after execution began.

Acceptance: the bounded synthetic comparison passes, including lifecycle and
cleanup. Automatic support discrimination is **inconclusive** and deliberately
retains review-needed. Product, design and engineering reviewers agree that the
learning milestone can be accepted with that limitation and recorded hosted
proof. Their strongest alternative was to stop at local inspection; the hosted
comparison adds evidence that the improved keyword baseline narrows the recall
gap and that hybrid adds no demonstrated recall benefit on these cases.

Product progress: inspectable evidence and a fairer baseline now support the
next storage/access decision. No app retrieval, owner/private usefulness,
clinical validity or installed Android/Mac-off capability is demonstrated.
No production architecture is selected. Stop this experiment here and return to
the ranking; adding a classifier or grader requires a separate decision.

Review retrospective: one Standards/Spec round and one three-role acceptance
round, with no owner interruption. Reviews kept zero acceptance from being
misreported as successful support detection. No workflow change warranted.
