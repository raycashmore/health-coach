# RAY-245 local investigation replay

This is offline preparation for the bounded synthetic comparison in
[the accepted design](agent-investigation-design.md). RAY-245 in Linear owns
the build brief, authority, external gates and acceptance. Deferred product
integration is RAY-271. No production path is changed.

## Run the software checks

```sh
node --import tsx --test scripts/investigation.test.mjs
node --import tsx scripts/run-investigation-replay.mjs
```

The second command prints eight **hand-authored offline replays**, four cases
across two arms. They test the runner and evidence contracts. They are not model
answers or evidence that an agent outperforms the control. The replay command makes no provider request and uses no credentials, private
data, database or filesystem note reader.
The fixture's expected labels are used only after each run to inspect its result;
the request callback receives the question, instructions, evidence trace, answer
schema, note window and repair errors. It receives no case ID or expected label.

## Local responsibilities

- `fixtures.mjs` builds invented 21-day snapshots with the existing version-3
  wearable calculation, stable source aliases and fixed notes. Sleep is indexed
  by wake day in tool results, matching the calculated comparison.
- `evidence.mjs` offers four schema-checked tools, reuses the stronger lexical
  search, issues run-local handles, allows reads only for returned notes and
  bounds each result and cumulative evidence. Duplicate calls count.
- `answer.mjs` checks the structured answer, handle kinds, note reads, numeric
  and date support, source-change evidence, note-window support, abstention
  searches and sleep-specific restraint. It renders only validated answers.
- `run.mjs` runs either tool-selected requests or the fixed evidence planner,
  with one repair, request/tool/evidence/deadline limits and deterministic fallback.
- `replay.mjs` supplies authored callback responses for software verification.
  Its semantic query is deliberately written by a human; it demonstrates the
  seam where a model might add evidence, not model query-reformulation skill.

Owner clarification: both arms need two differently worded full-window searches
before concluding unexplained. The fixed arm searches the question words then
“sleep late night tired”; it does not receive the semantic query from replay.
It reads every distinct hit, within the same six-tool budget.

## Evidence limits

The local runner enforces six requests, six tool calls, a 60-second deadline,
6,000 bytes per result and 16,000 cumulative evidence bytes. Its conservative
offline request-envelope and response-byte checks fit inside the design's
8k/1k token caps for these ASCII replay fixtures. Paid requests and responses use the Gateway
adapter's exact token preflight and actual output-token check instead of either
offline byte approximation.
The offline checks are **not provider token accounting**.
The runner delegates paid requests and usage accounting to the separate Gateway
adapter below.
`costUsd: 0` means offline execution; elapsed time is local replay time, not
provider latency. A callback is trusted test code, not a sandbox for arbitrary
code; abort is signalled, but arbitrary callback side effects cannot be undone.

Deterministic validation checks structural evidence support. Dates in measured/inference claims must use
YYYY-MM-DD; prose month names and numeric short dates trigger repair. The two
abstention searches must have different effective lexical term sets, so changing
only stopwords does not count. These conservative format checks can reject
otherwise reasonable phrasing for repair. Validation does not check whether prose
faithfully paraphrases a cited record. Hedging, unsupported causal language,
health recommendations, interpreting old notes as causes, unnecessary calls,
not-found wording and owner comprehension remain manual rubric checks, as in
the design. A structural validation pass is not semantic or clinical acceptance.

## Remaining experiment gates

Obtain an explicit owner spending allowance before the prepared paid command
below is executed. Then run both arms on the four fixed cases, retain repair/stop reasons and
measured usage, score the manual rubric and collect owner Useful / Not useful /
Concerning and comprehension ratings. Apply the design's decision rule, preferring
the control on ties. Broader private evaluation, Android integration, durable
memory and production framework adoption remain excluded.

## Paid command and authorization boundary

The Vercel AI Gateway skill and current official documentation informed
`gateway.mjs`; no extra SDK dependency is required. Its Anthropic Messages
transport offers the four native tools plus a structured finish tool, low effort,
one tool per response, and no client retries. The fixed arm exposes only finish. Native parallel tool use is disabled through
`tool_choice`, rather than relying on the one-call instruction alone.
It does not send case IDs, expected labels or arm names to the model.

The public Gateway catalog checked 3 November 2026 listed
`anthropic/claude-sonnet-5.5` with tool support and low reasoning effort, at
US$2/million input and US$10/million output tokens. The CLI re-checks that catalog
contract before paid execution and refuses changed prices/capabilities. These are
catalog rates, not observed charges or verified account access. The provider is
restricted to Anthropic, with no model fallback or cache-control markers.

Before each generation, the transport counts the full system/messages/tools
through the count-tokens endpoint, allowing 1,024 tokens of provider framing
within the 8,000 input cap, and sets 1,000 output tokens. It reserves US$0.030
before sending generation, conservatively including the five-minute cache-write
premium. This is stricter than the design's US$0.026 base-rate estimate. Measured
usage replaces the reservation only after durable settlement. An unknown outcome,
unexpected usage or provider failure stops the comparison and holds the full
reservation. A fully settled model output limit ends only that run; the known
charge is recorded and the other unattempted runs may continue. No automatic retry occurs. The US$0.16 per-run cap still applies;
an expensive run may stop before its sixth request to preserve that cap. Eight
runs therefore require at most US$1.28 of reserved/measured token charges under
the verified rate contract, without paid external search or other tools.

The CLI requires an existing `AI_GATEWAY_API_KEY` supplied through the environment
and an explicit `--allow-usd` opt-in with a positive two-decimal amount at most
US$1.28. A smaller approved total still preserves the US$0.16 per-run cap. It creates a fresh ignored directory under
`outputs/` with a synced append-only spend ledger and synthetic results, both
mode 0600 inside a 0700 directory. No key or remote budget is created or changed.
An interrupted run must be inspected before any separate attempt; a fresh
invocation is a new allowance, not an automatic recovery of the old grant.

```sh
# Only after explicit owner authority for this one synthetic comparison.
# Supply the existing key through the environment; never paste it in this command.
node --import tsx scripts/run-investigation-comparison.mjs --allow-usd 1.28
```

Mocked transport checks cover both arms, preflight counting, persistent reservation,
unknown paid outcomes, token/usage limits, per-run caps, aborts and refusal without
opt-in. These prove local controls, not live provider behavior or account billing.
The first authorized run is recorded below; another run requires separate owner
authority and must collect the manual rubric and owner ratings.

Primary references checked:

- [Gateway catalog and discovery](https://vercel.com/docs/ai-gateway/models-and-providers)
- [Anthropic Messages API and token counting](https://vercel.com/docs/ai-gateway/sdks-and-apis/anthropic-messages-api)
- [Native tool calling](https://vercel.com/docs/ai-gateway/sdks-and-apis/anthropic-messages-api/tool-calling)

## First live attempt — 3 November 2026

The owner approved one eight-run comparison up to US$1.28. Every arm/case was
attempted once. All paid requests settled; calculated token charges totalled
US$0.138932. This is usage-times-catalog-rate accounting, not a reconciled Gateway
invoice. Only the two no-meaningful-change answers validated. The six investigation
answers were incomplete, so the run cannot establish agent value or justify a
product direction change. Manual owner usefulness/comprehension ratings remain
unverified; no ratings are inferred from software success or failure.

Live execution exposed harness problems not covered by the original mocks:

- A paid response reporting fewer than 1,000 output tokens could exceed the
  runner's offline 1,000-byte approximation and be rejected before validation.
- The API returned multiple tool calls despite a prompt asking for one. The
  adapter rejected that response and spent its sole repair on formatting.
- A model output stop with settled charges was treated like uncertain billing,
  halting the first attempt. A guarded local continuation checked every ledger
  entry, refused any unsettled charge, reserved headroom for the seven remaining
  runs and never repeated the first arm. Model-visible inputs and limits were
  unchanged during continuation; only host stop handling and diagnostic metadata
  changed. This split execution is another reason to avoid a quality comparison.

The first arm's full provider stop metadata was not retained. Later entries show
both an actual `max_tokens` stop and complete native answer calls rejected by the
byte check. No unsupported claim is made about the first arm's exact stop reason.
The raw rejected answers were not retained; they cannot be retrospectively rated.

Regression tests now cover paid responses over 1,000 bytes within the provider
output-token cap, request-level parallel disabling, settled output stops continuing
other arms, and smaller explicit total allowances. The model prompt and the
1,000-token cap are unchanged. A genuine truncation can still occur; fixing the
harness does not prove that cap will be sufficient for every answer.

Raw synthetic results, generation IDs, spend ledger and the one-shot recovery
script remain in the ignored `outputs/investigation-1793706005328/` directory.
Linear RAY-245 owns the current verdict and any new spending grant. The first
comparison's authority is consumed; no corrected rerun is authorized by this file.

## Corrected live attempt — 3 November 2026

The owner approved one corrected eight-run comparison capped at US$1.14. It ran
once at commit `22a22ab`, with no host or prompt changes during execution. Its
24 paid requests all settled. Rate-derived token charges were US$0.242434; the
two comparisons together cost US$0.381366, below the original US$1.28 ceiling.
These figures remain token-accounting estimates rather than reconciled invoices.

Both arms produced two authored-label-correct conclusions out of four. The agent
produced two structurally validated answers; the control produced three, including
an incorrect unexplained conclusion in the differently worded travel-note case.
Neither arm found that note. The agent made an unnecessary duplicate comparison
lookup and day-level requests when sources had not changed. Its two successful
cases did not establish useful additional evidence over the control.

The run still has important limitations. A remaining offline input-byte guard
blocked the agent's repairs in the source-change and different-wording cases;
those failures are partly harness-confounded. The control's source-change answer
failed validation twice, but the then-current runner retained no error list or
rejected draft, limiting retrospective diagnosis. The raw run results are
preserved unchanged in ignored `outputs/investigation-1793706547317/`.

Manual review of the validated answers found search-absence overstatement in the
agent's missing-evidence answer and misinterpretation of a search-result flag as
uncertain date coverage in control answers. These are semantic quality failures
that structural validation did not establish. Owner Useful / Not useful /
Concerning and comprehension ratings remain unverified, with no ratings inferred.

Local fixes after this run remove the paid input-byte approximation, delegate
that boundary to the existing exact token preflight, and retain safe validation
error categories for future diagnosis. A known oversized preflight stops only
that run without reserving a generation; unknown accounting/transport failures
still halt the comparison. Regression tests cover these contracts. There has
been no additional paid call to verify those post-run fixes.

The defensible decision is **agent advantage not demonstrated**, with both
investigation outputs unsuitable for promotion on this evidence. This is not
proof that an agent cannot help, or that the control is accepted owner advice.
Local fixes cannot retrospectively repair the experiment. Linear owns the
independent acceptance review, negative-result disposition and next grooming
boundary. No third paid comparison is authorized.
