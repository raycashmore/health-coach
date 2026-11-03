# Eve synthetic spike: local boundary checks

RAY-266's first increment runs Eve locally with invented workshop notes. It is
permanently configured with Eve's deterministic mock model. It cannot select a
billable model through environment configuration. This is framework and tool
boundary evidence; useful model decisions and the five paired live comparisons
remain unverified. Linear RAY-266 owns scope, acceptance and the current handoff.

## Reproduce

Use Node 24+ for this isolated package. The application's runtime stays unchanged.
From the repository root:

```sh
pnpm --dir scripts/eve-spike --ignore-workspace install --frozen-lockfile
pnpm --dir scripts/eve-spike --ignore-workspace test:tools
pnpm exec tsc -p scripts/eve-spike/tsconfig.json
pnpm --dir scripts/eve-spike --ignore-workspace test
```

The six plain Node behavioral tests also run in root `pnpm test:tooling`. Eve's
runtime tests require the separate installation above. They start an ephemeral
loopback server, use no paid model, disable CLI telemetry and external reporters,
and keep generated state/traces in the ignored `scripts/eve-spike/.eve/` directory.
The provider-failure and exhausted-model-budget cases deliberately print errors; the assertion
requires a failed turn and no answer.

Dependencies are pinned in a separate package and lockfile: Eve 1.0.0-rc.2, AI SDK
7.0.162 and Zod 4.6.7. No application dependency or production framework changed.
The first offline tool round trip completed within five minutes of starting
setup, inside the brief's 30-minute stopping bound.

## Demonstrated contracts

- The mock checks the actual model-visible tool list on every call. It must be
  exactly `search`, `read_section` and `follow_reference`. `defaultTools: false`
  removes optional defaults; `tool: false` removes root delegation. No skills,
  connections, deferred capabilities or task tools are authored.
- Search reuses the stronger lexical baseline and returns at most five handles
  with short excerpts. It has no automatic answer-support classifier.
- Reads resolve an exact allowlisted synthetic section ID containing its content
  revision; results carry heading and line range. Stale handles stay unavailable.
- Reference following requires an exact link in the current source, a simple
  allowlisted note ID and heading. Schemes, traversal, absolute paths, encodings,
  queries and missing targets cannot open files or URLs. Sources are in-memory
  constants; the tools have no filesystem or network read operation.
- Every executor call consumes the shared session evidence budget. Returned evidence
  includes metadata/excerpts in the byte accounting: 6,000 UTF-8 bytes per result
  and 24,000 cumulatively. Exceeding either returns incomplete with no evidence.
  A terminal state rejects subsequent calls. The runtime cancels when the sixth
  call settles, before a seventh call or an unsupported final answer. Reaching
  six calls is deliberately treated as incomplete, even if the last result was
  useful; this conservative stop is not yet the live comparison harness.
- A separate ceiling of six model calls is checked before model selection.
  The counter advances on actual `model.started` events because Eve can resolve
  a dynamic model more than once per call. This stops repeated schema failures,
  which Eve can retry without emitting tool-settlement events. The invalid and
  mixed-input runtime checks require exactly six model starts and no answer.
- A scripted search → read → follow chain produces a source citation. This is
  prescribed fixture behavior, not adaptive model judgement. A second runtime
  check proves the six-call cancellation; two more cover schema-rejected and mixed valid/rejected calls; a fifth proves provider failure stops
  without fabricating a final answer.

The allowance belongs to one Eve session. Tests create a fresh session per run;
continuing one session does not reset its allowance. Tool executors are
synchronous so parallel requests cannot race the local budget update. These are
application capability restrictions, not an operating-system sandbox for trusted
JavaScript dependencies.

## Frozen demonstration cases

`scripts/eve-spike/fixtures.mjs` declares the five questions and authored labels:
reference, paraphrase, partial, misleading neighbor and missing. It reuses the
existing workshop corpus and adds one separate packing-to-printer reference.
The retrieval benchmark is unchanged. These are demonstrations, not a new
independent holdout. The reference case may also be answered by direct search;
the fixed control must retain that opportunity.

Before live execution, implement the fixed one-search/bounded-read control and
real-model adapter with equal context, output and citation contracts. Both must
honor the agreed six-tool-call envelope without selectively degrading the fixed
control. Verify provider calls/input/output caps, no retries or hidden model
fallbacks, and the monetary reservation before enabling billable execution.
Then manually apply the frozen rubric to all five paired cases. No owner
comprehension, grounded-answer quality or framework superiority verdict follows
from the offline checks.

## Sources

The installed Eve documentation is the implementation reference:
`node_modules/eve/docs/{agent-config.md,concepts/built-in-tools.md,concepts/state.md,guides/hooks.md,evals/index.mdx}`
inside the isolated package. Public counterparts:
[getting started](https://eve.dev/docs/getting-started),
[built-in tools](https://eve.dev/docs/concepts/built-in-tools),
[tools](https://eve.dev/docs/tools), and [evals](https://eve.dev/docs/evals).

## Approved live comparison transport

The owner approved the separate US$1 generation envelope on 3 November 2026.
The live project under `scripts/eve-spike/live` uses the same three tools and
source corpus. Its provider allows a final answer after the sixth tool result
by removing tools, with at most seven model requests. The fixed control uses one
lexical search, reads every returned section (up to five), then gets one answer
request. Both use `prompt.mjs`, the same model, citation contract, evidence byte
bounds and 1,000-token output cap. Eve's framework prompt adds context overhead;
the comparison records that difference rather than pretending prompts match.

```sh
pnpm --dir scripts/eve-spike --ignore-workspace test:live-boundary
node scripts/eve-spike/run-comparison.mjs --fixture
```

Only the explicitly approved execution uses `--live`. It reads the existing
Gateway credential from the ignored retrieval credentials file, or the explicit
`HC_SPIKE_CREDENTIALS` file. It rechecks public model pricing, creates the ignored
`.eve/approved-comparison/ledger.json` exclusively and refuses another run if that
ledger exists. The first reference case is the initial demonstration and counts
inside the ten answers. No extra smoke request or automatic repeat is made.

The HTTP boundary fixes the model to `openai/gpt-4.1-mini`, OpenAI provider only,
and rejects redirects, alternate endpoints, models and tools. Non-streaming
responses are adapted to Eve's stream interface so failures can withhold the
answer. The complete serialized request must fit within 40,000 UTF-8 bytes minus
a 4,096-token framing allowance, with at most 32 messages and three tools. For
this byte-token model this deliberately overbounds text/schema tokens; actual
provider usage is checked before forwarding output. This is a bounded text/tool
protocol, not a general tokenizer or universal transport guarantee. See OpenAI's
[byte-pair tokenization reference](https://github.com/openai/tiktoken).

Before HTTP, the ledger durably reserves every attempted request, including a
fingerprint to reject retries/replays. Failures block their run; a provider usage
limit violation stops the whole comparison. A lock collision fails closed. Seven
requests per agent answer and one per fixed answer allow 40 requests total.
Forty requests at the approved maximum input/output and uncached rates reserve
US$0.704, within the US$1 grant. Unknown failure cost is recorded as unknown while
retaining its reservation; available usage is retained even when output fails.
SDK retries are disabled for the fixed control; Eve receives terminal errors
without a retryable cause. The ledger also rejects a repeated HTTP attempt.

The boundary tests cover request/routing/context limits, durable reservations,
replays, lock ownership, all fixed-control hits, SDK generate/stream paths,
provider failures, known usage on incomplete output, global stop on usage
violation and redirects. The full fixture comparison exercises all ten answers
without calling a provider. Generated traces and raw replies stay ignored.
