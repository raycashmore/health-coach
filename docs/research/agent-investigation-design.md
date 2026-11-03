# Agent investigation design: "Is my lower sleep real?"

RAY-237 designs one bounded Health Coach investigation for the RAY-245
experiment. It is a design, not an implementation, a production framework
choice or evidence that an agent helps. All data below is invented. Linear
RAY-237 owns scope, acceptance and the current handoff.

## Summary

The owner asks one question about a change the daily wearable review already
detects. A model gets four read-only tools, a small budget and one job: decide
which explanation the evidence supports. The options are a recording-source
change, something the owner wrote down, or nothing it can find. Every factual
claim in its answer must cite evidence it received in that run, and a
deterministic validator checks this before anything is shown. When the evidence
is missing, the answer says what it searched for and found nothing, rather than
guessing a cause.

The comparison is against a scripted control that runs the same tools in a
fixed order with one built-in rule. If the control is as good, keep the
control: that is a valid result.

This is a deliberately narrow Health Investigation. It uses personal records
only, gathers no outside evidence and makes no health recommendation.

## The judgement task

**Owner question:** "My recorded sleep looks lower this week. Is that real, and
is there anything in my notes that explains it?"

**Owner decision it informs:** whether to treat the drop as a recording problem
to fix (for example, which app Health Connect prioritises), as explained by
something the owner already knows, or as an unexplained change worth watching.
It never recommends changing sleep, activity or treatment.

**Why this is judgement rather than rephrasing:** the existing comparison only
says recorded sleep fell and, separately, that sources varied. Several
explanations compete. Choosing between them requires:

1. deciding whether the source change lines up with the drop, which needs a
   second, day-level lookup only when sources varied;
2. choosing note search terms that match the owner's own words, which rarely
   repeat the question's words; the RAY-266 quiet-room case showed this
   reformulation is where models differ;
3. rejecting notes that mention sleep but fall outside the comparison window;
4. saying "not found" honestly when nothing relevant turns up.

The stop condition ("no credible judgement task") is not triggered, but the
honest risk is clear: items 1 and 3 can be coded as rules. The agent's claimed
value rests mainly on item 2 and on combining evidence. The case set below
tests exactly that.

## Dates and window

The examples use the current calculation (version 3), which groups sleep by the
local day each session ends (the wake day). Sleep dates below are wake days,
matching the comparison's `recentStart`, `baselineStart` and `endDate`.

- **Recent window:** `recentStart` to `endDate` for sleep (three wake days).
- **Note window:** seven days before `recentStart` to `endDate`. A note can
  explain the change only if its date falls in the note window.

## Tools

All tools are read-only, synthetic-only in RAY-245, and return evidence
handles. A handle identifies one record version, like an edition and page
number, so a citation resolves without guessing. Claims carry handles in a
structured field rather than inline citation syntax, which RAY-266 models
frequently malformed.

| Tool                      | Input                                                 | Returns                                                                                                                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_wearable_comparison` | none                                                  | The existing `buildWearableReview` output, with source names replaced by aliases. One handle per metric, `wearable:<calculationVersion>:<metric>:<endDate>`, covering that metric's evidence and coverage fields, including `notable` and `originsChanged`. |
| `get_daily_values`        | `metric`, `start`, `end` (inside the 21-day snapshot) | Per-day value or `null` (sleep by wake day), plus contributing sources as stable aliases (`source-1`, `source-2`). One handle per day, `day:<metric>:<date>`.                                                                                               |
| `search_notes`            | `query`, optional `from`/`to` dates                   | Up to five note sections with note date, heading, excerpt and handle `note:<document>:<revision>:<ordinal>:L<start>-<end>`, using the RAY-265 stronger keyword baseline. Every call also returns a handle `search:<n>` recording its query and dates.       |
| `read_note_section`       | a `note:` handle from a search result in this run     | The exact section text, heading, note date and line range, or `unavailable` for unknown or stale handles.                                                                                                                                                   |

Source names are untrusted text, so the model sees aliases only; the owner's
display maps aliases back to app names. The existing explanation path already
withholds source names from the model for the same reason.

Labs, genetics and past conclusions are deliberately excluded. A three-day
sleep difference does not call for them, and offering them invites a spurious
genetic or laboratory explanation. Add a tool only when a case needs it.

## Answer contract

The model finishes by returning one schema-validated object. The owner sees
only text rendered from it: the claims in order, then the context question.

- `conclusion`: one of `recording-source-change`, `explained-by-owner-note`,
  `unexplained-change`, `no-meaningful-change`.
- `claims`: each has `text`, `kind` and `evidence` handles. Kinds:
  - `measured`: cites `wearable` or `day` handles.
  - `owner-note`: cites a `note:` handle the run actually read with
    `read_note_section`, not only a search excerpt.
  - `inference`: hedged wording; cites at least one `measured` or `owner-note`
    handle it rests on.
  - `not-found`: cites `search:` handles that returned no in-window note.
  - `data-check`: a check of how data is recorded, such as source priority.
    Never a health, sleep or activity action. Cites the handles it follows from.
- `contextQuestion`: one neutral question for the owner, or `null`.

**Number matching:** every number in a `measured` or `inference` claim must
equal a numeric field of a cited record after rounding that field to the
claim's precision. Sign may be expressed in words ("below", "above"). For
example, "about 92 minutes below" matches a `difference` of -91.7. Dates in a
claim must equal a cited date field, such as `recentStart`, `endDate` or a
day handle's date.

## Validation

**Validator checks** (deterministic, before anything is shown):

1. Every handle was returned in this run and is still current.
2. Each claim's handle types match its kind; numbers match as defined above.
3. `recording-source-change` requires a `measured` claim citing at least one
   recent-window `day` handle and one earlier `day` handle whose source alias
   sets differ.
4. `explained-by-owner-note` requires at least one `owner-note` claim citing a
   note dated in the note window. Other `owner-note` claims may cite older
   notes only as context.
5. `unexplained-change` requires at least one `not-found` claim, and every
   cited `search:` handle must have returned no note dated in the note window.
6. `no-meaningful-change` is required when sleep's `notable` is false, and
   forbidden when it is true. Steps do not affect this.

**Rubric checks** (manual, in RAY-245): wording of "not found" as "no note
matched", never "there is no note"; no out-of-window note used inside an
`inference` claim as a cause; at least two differently worded in-window
searches before `unexplained-change`; no invented cause.

On a validator failure the model gets the errors once and may correct its
answer. This is necessary because RAY-266 showed prompt instructions alone did
not produce valid citations. A second failure shows the deterministic
comparison with "The investigation could not produce a supported answer." No
partial or unvalidated answer is shown.

## Loop, budgets and stopping rules

- **Before the model:** compute the comparison. If sleep coverage is not
  `comparable` (which includes status `insufficient-data`), stop without a
  model call and show the existing coverage limitation. Keep orchestration labels out of the model-visible question.
- **Loop:** the model chooses tool calls; their results return to it; it
  answers when it judges the evidence sufficient.
- **Per run:** at most 6 tool calls, 6 model requests (including the one
  repair), 60 seconds. Per request: 8,000 input and 1,000 output tokens; this
  token cap binds. Evidence: 6,000 bytes per tool result and 16,000 bytes in
  total, set to fit under the input cap with the instructions and question.
- **Repeats:** an identical tool call returns the earlier result marked
  `duplicate` and still counts.
- **Hard stop:** reaching any limit before a valid answer ends the run as
  incomplete. Show the deterministic comparison and "The investigation stopped
  at its limit before reaching a supported answer."
- **Cost:** before each request, reserve its worst case (8,000 input and 1,000
  output tokens: US$0.026 at the RAY-266 Claude estimate of US$2 per million
  input and US$10 per million output tokens) against measured spend so far.
  The run limit is US$0.16, six worst-case requests. Measured RAY-266 answers
  cost about US$0.01. RAY-245 needs its own owner spend approval; none is
  granted here.

## Memory

Run-scoped state only: the evidence ledger and budget counters. Nothing
persists between runs, and the owner's reply to `contextQuestion` is not
stored. This settles the issue's open questions for this experiment: no agenda
of open questions, and the agent asks the owner only through `contextQuestion`
in its final answer.

Add durable conclusions and a read-only `get_prior_conclusions` tool only when
the experiment adds a reassessment case: new evidence that should keep or
supersede an earlier conclusion.

## Worked example A: a recording-source change

Invented snapshot: 21 completed days ending 21 October 2026, read on
22 October. Sleep wake days 2–19 October (baseline) average 442.0 minutes from
`source-1` only. Wake days 20–22 October (recent) are 352, 338 and 361 minutes,
from `source-1` and `source-2`. Steps average 8,100 for the baseline and 7,800
recently. Note window: 13–22 October. Notes include:

- 19 October, "Trying things": "Installed a phone app to track nights alongside
  the band."
- 12 September, "Launch week": "Sleep was short all week with late finishes."

| Step | Model choice                                            | Result                                                                                                                          | Why it is justified                                                                      |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1    | `get_wearable_comparison`                               | Status `change`. Sleep 350.3 recent against 442.0 baseline, difference -91.7, notable; sources varied. Steps -300, not notable. | Establishes what changed.                                                                |
| 2    | `get_daily_values` sleep, 16–22 October                 | `source-2` appears first on 20 October, the first recent day; 16–19 October are `source-1` only.                                | The first result named two explanations; only day-level data shows whether they line up. |
| 3    | `search_notes` "phone app tracking band", 13–22 October | One hit: the 19 October note.                                                                                                   | A new source suggests a new app; the owner's words are unlikely to say "source-2".       |
| 4    | `read_note_section` on that hit                         | Exact section and lines.                                                                                                        | Owner-note claims must cite a read section.                                              |
| 5    | Answer                                                  | `recording-source-change`; validated.                                                                                           | Evidence is sufficient; stop with two tool calls left.                                   |

Shown to the owner, one line per claim:

> _(measured)_ Your recorded sleep averaged 350 minutes over 20–22 October,
> about 92 minutes below your 18-day average of 442.
>
> _(measured)_ The drop starts on the first night a second sleep source
> contributed.
>
> _(owner note)_ Your 19 October note says you installed a phone app to track
> nights.
>
> _(inference)_ This looks more like a change in how sleep is recorded than a
> change in your sleep.
>
> _(data check)_ Worth checking: which app Health Connect uses first for sleep.
>
> Did the phone app record any of these nights on its own?

The September launch-week note matches "sleep" but falls outside the note
window, so it cannot be the explanation.

## Worked example B: missing evidence

Same comparison, except every day comes from `source-1` and the 19 October note
does not exist. The September note remains.

| Step | Model choice                                                 | Result                                   | Why it is justified                                                                                         |
| ---- | ------------------------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1    | `get_wearable_comparison`                                    | Sleep -91.7, notable; sources unchanged. | Establishes the change and rules out the source explanation.                                                |
| 2    | `search_notes` "sleep late night tired", 13–22 October       | No hits; `search:1` recorded.            | The owner asked about notes; the date range keeps old notes out.                                            |
| 3    | `search_notes` "trip flight hotel deadline work", same dates | No hits; `search:2` recorded.            | The owner may have described a cause without mentioning sleep.                                              |
| 4    | Answer                                                       | `unexplained-change`; validated.         | Two differently worded searches found nothing; three calls remain, but more guessing has diminishing value. |

Shown to the owner:

> _(measured)_ Your recorded sleep averaged 350 minutes over 20–22 October,
> about 92 minutes below your 18-day average of 442, from the same source
> throughout.
>
> _(not found)_ No note from 13–22 October matched searches about sleep, late
> nights, travel or work deadlines.
>
> Was anything different about these three nights?

A model that cites the September note as the reason fails the validator; one
that says "your notes don't mention anything" fails the rubric.

## Comparison for RAY-245

**Control:** scripted follow-up using the same tools, answer contract,
validator and single repair. Always get the comparison; if sources varied, get
sleep daily values for the last seven days; search notes in the note window
using the question's words; read every hit; answer. This is the issue's
smaller alternative and is deliberately strong.

**Cases (synthetic, authored labels fixed before the run):**

| Case              | Setup                                                                                     | Expected conclusion       | What it tests                          |
| ----------------- | ----------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------- |
| A Source change   | Example A                                                                                 | `recording-source-change` | Aligning two evidence types            |
| B Missing         | Example B                                                                                 | `unexplained-change`      | Honest abstention, rejecting old notes |
| C Different words | No source change; 19 October note: "Red-eye flight tonight, then three nights in a hotel" | `explained-by-owner-note` | Query reformulation                    |
| D No change       | Sleep and steps both within their thresholds; owner asks the same question                | `no-meaningful-change`    | Restraint                              |

Insufficient data is covered by the existing deterministic path and is not
compared. Case C is the one the control is expected to miss, because the
question's words do not appear in the note. If the agent also misses it, the
agent has shown no added value.

**Criteria per answer:** correct conclusion against the authored label;
validation passed first time, after repair, or failed; rubric checks; tool
calls, unnecessary calls and stop reason; tokens, cost and latency.

**Owner criteria:** for each shown answer, a Useful, Not useful or Concerning
rating, and whether the owner can say in their own words why it concluded
that.

**Decision rule:** prefer the agent only if it reaches more correct
conclusions, has no more validation failures, receives no Concerning
rating, and none of its answers is rated less understandable than the
control's answer to the same case. Otherwise keep the control, because it
is cheaper and predictable. One run per case gives learning evidence, not
reliability.

## Runtime

RAY-245 chooses the runtime and model. The design needs only a tool loop with
per-request limits, which both the AI SDK already in the web app and the
RAY-266 Eve reference provide; Eve's scheduling, memory and delegation are
unused. Reuse the RAY-266 patterns: explicit unavailable sources,
request-level spend reservation, orchestration labels removed before the
provider request, and a fixed-control arm. RAY-266 favoured Claude Sonnet 5.5
at low effort for query reformulation and citations; that is learning
evidence, not a selection. Nothing here changes the production review path.

## Out of scope

Implementation, paid runs, private data, labs or genetics tools, durable
memory, unattended runs, Android display and production framework or model
adoption.
