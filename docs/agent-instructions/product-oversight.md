# Product oversight

Use when grooming the backlog, or selecting, expanding or accepting a
capability. Resume from the
[current handoff and governing records](issue-tracker.md#start-or-resume).

## Groom the backlog

Grooming sets priority, interactively with the owner, in its own session. Use
the shared `~/.agents/skills/ray-groom-backlog/` workflow; it defines the
steps, the staleness triggers and the review panel's role. Health Coach
specifics:

- Build the journey map from the
  [first-version specification](issue-tracker.md#planning-records),
  including open proposals and reassessments recorded there.
- Candidates are Health coach project issues. Proposed items carry the
  `needs-triage` label until groomed.
- Write the ranking to the “Ranking” section of
  [now, next and later](issue-tracker.md#planning-records),
  with links, one-line reasons, the date and a reset slices-since-grooming count.
- Mirror it in Linear: Now is Todo with High priority; Next is Backlog with
  Medium; Later is Backlog with Low; Not doing is Canceled with a reason comment.
  Remove `needs-triage` from every groomed item.

A material change to the specification's release outcome requires an explicit
owner decision, recorded in the specification.

## Take the next outcome

1. Resume the in-progress issue first: its brief, unfinished implementation and
   acceptance. Establish what the owner can actually do and in which environment.
2. Otherwise take the ranking's Now item. When the ranking is stale or has no
   ready Now item, groom first. The previous handoff's ideas for new work are
   grooming input, not selections.
3. Review relevant [feedback](issue-tracker.md#feedback) that arrived since
   grooming. Feedback that challenges the ranking makes it stale.
4. The ranked item was reviewed at grooming; selecting it needs no new product
   panel. Use the personal `ray-team-review` skill
   for milestone acceptance and when evidence challenges the direction.
   Routine fixes and documentation changes need proportionate review.
5. Record the selected item's smaller alternative, exclusions and owner-visible
   proof in the existing issue/brief.

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
and smallest resolving check, and treat the ranking as stale; continue
independent authorized work. Ask the owner
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
