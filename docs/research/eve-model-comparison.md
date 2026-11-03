# Two models in the same synthetic agent

Claude Sonnet 5.5 at low effort performed better than GPT-4.1 mini in this
five-case run. It found the paraphrased quiet-room fact and preserved exact
citations. This is a useful learning example, not a reliability benchmark or a
production model selection. Strict grounding still failed for one Claude answer
because an additional factual explanation lacked a citation.

## The clearest example

Question: “Where can I concentrate without people talking?”

GPT searched almost the same wording, found nothing and stopped. It offered to
try different terms, although it still had permission and tool allowance to do
that itself. Its answer wrongly suggested the notes had no specific mention.

Claude added “quiet” to its search. The same keyword tool then found the upstairs
blue room, reserved for silent work. Claude answered with the exact note version
and line range. The retrieval engine did not change: the model's choice of search
words changed which evidence it received. This demonstrates query reformulation,
one useful agent capability. It does not demonstrate a multi-step recovery:
Claude succeeded on its first search.

For ribbon and price, both found R7 and acknowledged the missing price. Claude's
first two searches were issued together; its later R7-price search was adaptive
but supplied no new fact. GPT attempted two reads with incomplete handles, both
explicitly unavailable, and then answered from the initial search excerpts.
Neither used follow_reference. The short notes fit entirely in search excerpts,
so this sample is weak evidence for deeper investigation.

## Method and quality verdicts

Executed once on 3 November 2026 at prepared commit fb3a79f after the owner
approved a separate US$5 envelope. Five unchanged invented questions per model,
agent only; no repeat of the fixed-workflow arm. Same corpus, instructions,
three tools, citation contract and evidence limits. Each answer allowed six
tool calls and seven generation attempts; requests allowed 40,000 input and
2,000 total output tokens. Claude thinking shared the output allowance.

The coordinator recorded A/B quality verdicts before opening the model mapping
or usage ledgers. This was model-assisted rubric review, not independent human
grading or a calibrated automated judge. A subsequent deterministic check
matched every bracketed citation to a returned exact handle and line range.
Semantic claim support and missing citation coverage were assessed separately.

| Case                  | GPT-4.1 mini                                                                              | Claude Sonnet 5.5 low                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Ribbon and spares     | Both facts correct; two redundant parallel searches; malformed citations                  | Both facts correct in one search; both citations resolve                                                     |
| Quiet-room paraphrase | Empty search; misses available fact; premature absence statement                          | Adds quiet; finds room; exact citation                                                                       |
| Ribbon and price      | R7 correct, price missing; two invalid reads; malformed citation                          | R7 correct, price missing; relevant but redundant price follow-up; exact citation                            |
| Cabinet code          | No code invented; malformed citation; overbroad absence wording                           | No code invented; valid battery citation; supported archive explanation uncited; extra read adds no evidence |
| Bus route             | No route invented; malformed citations; unsupported transport characterization of archive | No route invented; exact citations and honest one-query limitation; unnecessary unrelated detail             |

The blind review preferred Claude in each pair. GPT had nine malformed citations
across four citation-bearing answers; Claude's eight citations all resolved.
Citation resolution alone does not establish full grounding: Claude's cabinet
answer still lacked a citation for its archive explanation. No requested price,
code or route was invented. All ten answers stopped normally within limits.
Neither model's follow-up produced an additional requested fact.

## Observed efficiency

Elapsed time spans retrieval through answer capture, excluding CLI startup.
GPT ran all five cases first, then Claude. Claude times include its mandatory
free counting preflight. Provider-native SDK/context overhead and tokenizers
differ; this compares constrained configurations, not isolated model speed.

| Case              | GPT requests | Claude requests | GPT / Claude seconds | GPT / Claude cost (USD) |
| ----------------- | -----------: | --------------: | -------------------: | ----------------------: |
| Ribbon and spares |            2 |               2 |        2.910 / 7.262 |    0.0006700 / 0.007198 |
| Quiet room        |            2 |               2 |        1.996 / 3.883 |    0.0003644 / 0.005858 |
| Ribbon and price  |            4 |               3 |        5.785 / 6.752 |    0.0015716 / 0.013440 |
| Cabinet code      |            2 |               3 |       2.206 / 15.293 |    0.0006968 / 0.013754 |
| Bus route         |            2 |               2 |        2.524 / 6.871 |    0.0007628 / 0.009696 |
| Total             |           12 |              12 |      15.421 / 40.061 |    0.0040656 / 0.049946 |

GPT used 7,292 input / 718 output tokens; Claude used 18,178 / 1,359. Maximum
request input/output was 1,089/191 for GPT and 2,381/315 for Claude. Twelve
Claude count preflights succeeded and matched observed input exactly. No cache
usage, failed request, blocked run, retry or extra generation was observed.

GPT cost is Gateway-reported and matches rate calculation. Claude cost is an
estimate from measured usage at US$2/million input and US$10/million output;
the native response exposed no Gateway billing or routing metadata. Do not
present it as an independently verified charge or provider route. The adapter
sent an Anthropic-only routing restriction; GPT metadata confirms OpenAI-only
12 provider attempts. Combined reported/estimated model cost is US$0.0540116,
well below the US$4.872 reservation / US$5 grant. The batch's exclusive manifest
prevents automatic repetition. The grant is finished for this batch.

## Disposition

Keep this as a local learning reference. Model choice changed query formulation
and citation compliance without changing tools. Exact claim-level evidence
validation remains necessary, and longer investigation is unproven. One trial
per authored case, model-assisted assessment, different provider adapters and
fixed execution order limit inference. No private, clinical, Android or hosted
usefulness is established. Original fixed-versus-agent results remain separately
at [the original report](eve-spike-results.md); their failures are not replaced.

Independent product, design and engineering milestone reviews accept this as
completed comparison evidence and advise stopping here. Their strongest
objection is treating better synthetic output as owner acceptance or production
readiness. Disposition: no model adoption or additional experiment; use the
quiet-room example to explain the behavior, and leave owner comprehension and
usefulness unverified until the owner responds. One review round; no material
disagreement or workflow change. Citation totals were corrected mechanically
before final reporting and communicated to all roles.

Raw synthetic replies, provider identifiers, blinded verdicts and ledgers remain
ignored under scripts/eve-spike/.eve/model-comparison-v1. Only sanitized findings
are recorded here. No code changed during execution; existing preparation checks
remain applicable. Report formatting and repository verification run at closeout.

## Final learning acceptance

The owner confirmed this experiment was useful for learning and requested closure.
The bounded slice is complete. Grounding failures and experimental limitations
remain findings; no production model or framework was selected. No further
model run is authorized by the completed grants.
