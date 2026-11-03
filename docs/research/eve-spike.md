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
