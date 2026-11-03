# Eve synthetic investigation: comparison result

The bounded experiment demonstrated real model-chosen tool use, but no clear
answer-quality improvement over fixed retrieval in these five demonstrations.
Exact citation acceptance failed for both approaches. One case was also confused
by a run label in its prompt, so this comparison cannot settle retrieval or
framework superiority. Stop this experiment here; retain Eve as a local learning
reference, with the production framework decision open.

## What happened in plain language

The model received a question and three functions: search notes, read a section,
and follow a reference. Eve ran the chosen function and returned its result to
the model, which could choose another function or answer. The sequence was not
scripted for the live agent. The fixed control's sequence was scripted: search
once, read all returned sections, then ask the same model for an answer.

For the invented LP-42 printer's ribbon and price, the agent searched and saw R7
but no price. It requested a note with an invalid reference, received unavailable,
corrected the reference and read the note. It then searched specifically for R7
price. The final answer gave R7 and acknowledged the missing price. Those were
observable tool choices; no internal reasoning transcript was inspected.

The fixed control reached the same answer more directly. Both failed to provide
an exact machine-resolvable citation. A citation works like a book edition and
page reference: the note version and lines must identify the evidence without
guessing. Correct text alone did not establish reliable traceability.

The owner asked for this walkthrough before giving a learning verdict. A fuller
chat explanation was supplied; comprehension and usefulness remain unverified.

## Execution and limits

Executed once on 3 November 2026, using local code at `e2f9083`, after the owner
approved the US$1 generation envelope. Both approaches used AI Gateway
`openai/gpt-4.1-mini`, OpenAI only, the same invented workshop corpus and frozen
questions, common answer instructions, source/citation contract and bounds.
There were ten answers across five pairs; the first agent case was also the
initial trace, with no extra smoke run.

All ten reached a model stop without a provider error. Gateway metadata reports
18 requests and 18 provider attempts, all OpenAI with no fallbacks. Usage was
14,398 input tokens and 1,201 output tokens. Gateway-reported model cost was
**US$0.0076808**, matching the uncached rate calculation. No request had unknown
cost. Maximum per-request usage was 1,935 input / 253 output tokens, below the
40,000 / 1,000 limits. The US$0.704 full-envelope reservation and US$1 grant were
not exceeded. There is no automatic paid repeat; the existing ledger prevents a
second invocation.

Raw replies, provider identifiers, traces and the ledger remain ignored under
`scripts/eve-spike/.eve/approved-comparison/`. This report contains only invented
examples and sanitized capability findings. No private health data was used.

The CLI's “5 passed” means its five tool-count gates passed. It does **not** mean
answer quality, grounding or owner acceptance passed. Those verdicts follow.

## Manual rubric: all five pairs

| Case                | Requested facts and missing evidence                   | Agent behavior                                                                                                                            | Fixed control                                                                                | Grounding/citation verdict                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reference           | R7 ribbon; spares in drawer seven beside packing bench | Returned both facts from search excerpts; issued two overlapping searches together, without following a reference                         | Returned the same two facts after one search and reading both returned sections              | Facts supported by printer note, but both answers failed exact handle/revision/line citation syntax. Packing reference alone does not substantiate the facts.                                       |
| Paraphrase          | The upstairs blue room permits silent work             | Searched using the internal case label, then asked for clarification instead of finding the note                                          | One lexical search found no hits; abstained                                                  | Both missed the available fact. Agent behavior is confounded by the harness label. Fixed answer also invented a citation to a search line range that was never supplied as a source.                |
| Partial             | R7 is known; price is absent                           | Searched, tried an unavailable short source ID, corrected it to the full handle, then searched for R7 price and acknowledged missing cost | Returned R7 and acknowledged missing cost from the initial retrieval                         | No price invented. Agent also volunteered the supported spare location. Exact citation syntax failed in both.                                                                                       |
| Misleading neighbor | Cabinet access code absent                             | Retrieved related battery/storage material, but did not invent a code                                                                     | Read all five returned hits; acknowledged missing code and added storage/archive explanation | Correctly rejected the requested unsupported value. Agent abstention needs no factual source citation. Fixed explanatory citations were malformed; its archival wording was looser than the source. |
| Missing             | Bus route absent                                       | Searched and reported no relevant evidence                                                                                                | Read all five hits; abstained and described unrelated entry/archive material                 | No bus route invented. Agent abstention is appropriate; fixed answer's added source descriptions had malformed citations. Search failure is not a general proof of corpus absence.                  |

No answer contained a verified exact citation in the stipulated
`[document:revision:ordinal:Lstart-end]` form. Seven answers contained citation-like
brackets; all seven had malformed or unresolvable references. The other three
agent replies supplied no requested factual value. Supported facts and exact
citation resolution are separate: correct R7 text did not pass the grounding
contract merely because a human could guess its intended source.

The partial case supplied a relevant follow-up decision based on the first
result: search specifically for the missing price. It found no added fact and
did not improve the answer over fixed retrieval. The invalid short-handle read
was unnecessary, while recovery to the exact handle showed why unavailable
sources must remain explicit. No agent used `follow_reference` in this live run;
only the earlier deterministic fixture established that tool's boundary.

All runs stopped normally before exhausting tool, evidence or model limits.
Agent tool calls were 2, 1, 4, 1 and 1 respectively, never above six. Fixed
retrieval used one search and read every returned hit, never above six calls.
Relevant follow-up, unnecessary calls, support/missing facts, invented values,
citation resolution and stopping were manually assessed above; no model grader
was used.

## Latency, tokens and cost

Times measure each answer from before retrieval to result capture, excluding CLI
build/startup. Every agent answer ran before its paired fixed answer. These are
one-pass observations with framework and ordering effects, not latency benchmarks.

| Case                | Agent requests | Fixed requests | Agent input / output tokens | Fixed input / output tokens | Agent / fixed elapsed seconds | Agent / fixed cost (USD) |
| ------------------- | -------------: | -------------: | --------------------------: | --------------------------: | ----------------------------: | -----------------------: |
| Reference           |              2 |              1 |                 1,307 / 175 |                    873 / 40 |                 4.123 / 1.044 |    0.0008028 / 0.0004132 |
| Paraphrase          |              2 |              1 |                    705 / 63 |                    171 / 38 |                 2.136 / 0.928 |    0.0003828 / 0.0001292 |
| Partial             |              5 |              1 |                 3,767 / 305 |                    863 / 79 |                 6.380 / 1.271 |    0.0019948 / 0.0004716 |
| Misleading neighbor |              2 |              1 |                  1,430 / 46 |                 1,935 / 144 |                 2.332 / 1.931 |    0.0006456 / 0.0010044 |
| Missing             |              2 |              1 |                  1,425 / 58 |                 1,922 / 253 |                 2.166 / 2.372 |    0.0006628 / 0.0011736 |
| Total               |             13 |              5 |                 8,634 / 647 |                 5,764 / 554 |                17.137 / 7.546 |    0.0044888 / 0.0031920 |

Fixed retrieval was not selectively weakened: it read every hit from the stronger
lexical baseline and could answer the reference case directly. Agent searches
returned excerpts containing complete short notes, allowing answers without an
explicit read. Eve adds framework context; the fixed control receives retrieved
context upfront. Those context/call differences are disclosed rather than
presented as an isolated causal test. Questions and authored labels were reused
from the workshop examples; they are not an independent held-out or clinical set.

## Findings that transfer

Eve made file-based tools, per-session state, mocked runtime checks and observable
sessions straightforward. It also required Node 24 isolation, an SDK transport
wrapper and a persistent HTTP reservation ledger for this experiment's spend
contract. Framework success and model output quality remained separate checks.
The larger framework features—memory, scheduling and delegation—were unnecessary
for this question-answer experiment and were disabled.

The next agent design should preserve explicit unavailable sources, source-aware
bounded reads, request-level reservation and a fixed retrieval control. It must
keep orchestration metadata out of model-visible questions and validate citation
structure/resolution before showing factual answers. Prompt instructions alone
did not enforce source handles or citation syntax. None of this selects a
production framework or proves private/mobile usefulness.

A smaller AI SDK tool loop remains a credible alternative for one interactive
investigation. This run gives no evidence that Eve improves answer quality or
that durable orchestration is needed for that path. Keep the existing local Eve
reference for learning, and use these findings when the ranked agent-design item
is selected; do not expand the framework based on this result.

## Defect correction and acceptance

The run label `SPIKE_RUN agent paraphrase` was an execution identifier, but the
model treated it as part of the owner's question. It is now removed before the
provider request; a local header binds the journal and is removed before HTTP.
Regression tests assert that neither label nor internal header reaches the
transport. A full fake-transport comparison verifies the corrected pipeline.
**No paid rerun validates that correction's effect on answer quality.** The
original results above remain attached to `e2f9083`; they are not silently replaced.

Implementation and deterministic boundaries pass their scoped checks. Useful
adaptive improvement is not demonstrated; exact grounding acceptance fails;
comparison/report is complete with the stated confound. Owner comprehension is
pending the owner's verdict on the shown ribbon example. Product progress is a
clearer design constraint and an honest negative comparison, not a new health
capability. The canonical issue/handoff retains the actual acceptance state.

## Independent outcome review

Product, design and engineering reviewed the same short evidence packet. They
agreed that no further implementation or paid rerun is needed to make the
negative result useful. Product and design recommend keeping the owner-learning
outcome pending until the owner confirms the trace is understandable/useful;
engineering considers the bounded engineering experiment complete, with owner
comprehension separately unverified. The disposition is to stop execution and
retain RAY-266 as In Progress for that one owner verdict. Grounding remains
failed regardless of the owner's learning verdict.

The strongest objection to closure is assuming the central owner benefit from
technical execution. The existing ribbon example and fixed-control result are
the smallest resolving check. No new infrastructure, paid run or private data is
needed. One independent outcome round produced this acceptance boundary; no
additional review challenge or workflow change was warranted.
