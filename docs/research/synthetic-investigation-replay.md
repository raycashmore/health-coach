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
answers or evidence that an agent outperforms the control. No provider request,
credentials, private data, database or filesystem note reader is involved.
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
  with one repair, request/tool/byte/deadline limits and deterministic fallback.
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
request-envelope and response-byte checks fit inside the design's 8k/1k token
caps for these ASCII replay fixtures. They are **not provider token accounting**.
There is no paid adapter and no live spending enforcement in this offline runner.
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

Select and implement a paid transport only after current provider availability,
token accounting, prices and request-level reservation guarantees are verified.
Obtain an explicit owner spending allowance; the design's historical US$0.026
reservation and US$0.16/run are estimates, not a current quote or authority.
Then run both arms on the four fixed cases, retain repair/stop reasons and
measured usage, score the manual rubric and collect owner Useful / Not useful /
Concerning and comprehension ratings. Apply the design's decision rule, preferring
the control on ties. Broader private evaluation, Android integration, durable
memory and production framework adoption remain excluded.
