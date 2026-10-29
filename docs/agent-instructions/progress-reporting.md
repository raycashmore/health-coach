# Progress reporting

Follow the shared plain-language summary protocol in
`~/.codex/agents/team-review.md`. Keep technical contracts, revisions, checks and
decision history in the existing issue/brief. Follow
[record ownership](issue-tracker.md#record-ownership) rather than duplicating status.

## Current handoff

Maintain [Health Coach — now, next and later](https://linear.app/cashmore/document/health-coach-now-next-and-later-878de48e456c)
at [tracker checkpoints](issue-tracker.md#checkpoint). Start with five short lines:

- **Goal:** owner outcome.
- **Working:** behavior demonstrated, with evidence and environment.
- **Missing:** main remaining capability or uncertainty.
- **Next:** one outcome and why now.
- **Decision:** missing owner choice, or none.

Keep the selected task and brief linked beside the summary. Below it, retain a
compact handoff: revision/branch/PR where relevant, environment/deployment,
evidence link, remaining gates, existing authority with source and limits, and
one next action. Timestamp meaningful updates in Australia/Sydney, including
local time and offset/zone when available. Keep dated history in its owning
evidence record.

## Chat and closeout

At slice start and meaningful checkpoints, link the task and existing brief.
Updates usually need only what changed, what remains unproved and next/decision.
For closeout, aim for about 120 words, expanding for consequential ambiguity:

1. Explain the concrete change and benefit.
2. Say what is usable now: local committed code, published changes, a synthetic
   demonstration or an observed owner experience.
3. State the obstacle removed and what remains unverified; link the evidence and
   whole-product handoff. Keep implementation, acceptance and product progress
   distinct.
4. Name one next action, why now and its success check. Continue only work already
   authorized; carry missing input or authority into the handoff.

Put checks and revision details below the benefit. Label local/synthetic,
hosted, Android and private evidence precisely. Passing tests and historical
Done labels establish neither current private acceptance nor clinical validity
or owner usefulness. Report fail/unverified without unsupported completion
percentages or forecasts. Apply [privacy guidance](privacy.md) to every report;
private checks produce minimal capability verdicts, not exported health content.
