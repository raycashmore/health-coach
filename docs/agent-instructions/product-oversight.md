# Product oversight

Use when selecting, expanding or accepting a capability. Resume from the
[current handoff and governing records](issue-tracker.md#start-or-resume).

## Choose one outcome

1. Recover the selected issue, its existing brief and unfinished acceptance.
   Establish what the owner can actually do, the supporting environment and the
   largest evidenced obstacle in the specification's complete owner journey.
2. Review relevant [feedback](issue-tracker.md#feedback). Completed planning and
   old roadmap ideas are context; current evidence determines the next outcome.
3. Before selecting a new capability, changing material direction or accepting a
   product milestone, use the personal review protocol at
   `~/.codex/agents/team-review.md`: Product Manager, Product Designer and
   Engineering Lead give independent assessments, with one challenge round for
   material disagreement. Routine fixes and documentation changes need
   proportionate review, not a product panel.
4. Compare at most three options, including assessing or simplifying existing
   work when useful. State origin, benefit, evidence, effort and ongoing cost.
   Record the winner, strongest objection and its disposition, smaller
   alternative, exclusions and owner-visible proof in the existing issue/brief.
5. Keep one selected slice and at most two conditional next candidates in the
   handoff. Empty next/later lists are valid. Preserve the release specification;
   a material change to its outcome requires an explicit owner decision.

Before implementation, the issue/brief must name observable success, required
environment, first verifiable increment, scope, exclusions, investigation limit,
stop condition, existing authority and external gates. Scale detail to uncertainty.
Use the shared `~/.agents/skills/ray-next-feature/` workflow when invoked; its
`BUILD-BRIEF.md` and `DELIVERY.md` supply reusable structure. Follow
`SUBAGENTS.md` there if delegation is required and authorized. Keep shared rules
in those sources rather than copying them here.

## Handle new evidence

Routine defects stay within the slice. Reconsider direction when a material
assumption fails, scope grows, a required environment cannot establish acceptance,
or investigation reaches its limit without new evidence. Record the consequence
and smallest resolving check; continue independent authorized work. Ask the owner
only for a missing consequential choice or authority. Preserve current grants
with their action, environment and limits.

## Accept the outcome

Record three separate verdicts in the existing issue/brief:

1. **Implementation:** correct against scope, with revision and checks, or no
   code change required.
2. **Acceptance:** pass, fail or unverified for each criterion in its required
   environment. Synthetic/local evidence leaves private, hosted and Android
   gates open where those are required.
3. **Product progress:** owner capability gained or obstacle removed; a negative
   result may instead change the next decision. Passing tests alone proves
   neither health quality nor owner usefulness.

Link related feedback to observed outcomes. Save one
[tracker checkpoint](issue-tracker.md#checkpoint) and report using
[progress reporting](progress-reporting.md). A completed slice does not authorize
starting another feature. Keep unresolved release gates visible even when
implementation is complete.
