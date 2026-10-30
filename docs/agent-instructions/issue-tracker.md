# Issue tracker: Linear

Linear owns planning; the repository owns reusable operating guidance.

## Planning records

Find these with the Linear tools by the reference shown.

| Record                                    | Linear reference          |
| ----------------------------------------- | ------------------------- |
| Project                                   | "Health coach" (Ray team) |
| Now, next and later (ranking and handoff) | document `878de48e456c`   |
| First-version specification               | document `8f43cf731f86`   |
| Planning map                              | issue `RAY-93`            |

## Start or resume

1. Read the **now, next and later** document: its ranking, last-groomed date
   and current handoff. Then read the in-progress or Now issue and existing
   brief. Recover evidence, remaining gates, authority and the resume action
   before choosing work.
2. At grooming or expansion, read the **planning map**, **first-version
   specification** and relevant feedback. Load further history for unresolved
   questions.
3. Verify consequential completion claims against linked evidence. Historical
   Done issues and the completed project state are history, not current runtime
   proof or instructions to reopen them. Documents may be attached to historical
   issues rather than the project; follow links and search before creating one.

Reuse inspected sources until they change or another writer may have changed
them. Recover missing mutable state after compaction without repeating settled
orientation. If a connector helper is unavailable, use direct record reads and
report any evidence that remains inaccessible.

## Record ownership

| Record                           | Owns                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| Journey / current handoff        | Current outcome, selected task, revision, environment, gates, authority and resume action   |
| Ranking (same document)          | Now/Next/Later/Not doing order, last-groomed date and slices completed since; grooming only |
| Issue                            | Scope, acceptance criteria, state, dependencies and links                                   |
| Existing brief, or issue if none | Decisions, dated evidence, three verdicts and retrospective when useful                     |
| Planning map                     | Durable strategy and decision index                                                         |
| Feedback record                  | Original observations, interpretations, dispositions and outcome links                      |

Keep one authoritative home for each fact. Link detail rather than copying status.
Use [existing triage roles](../agents/triage-labels.md) when triage needs labels.

## Checkpoint

At handoff, pause, material direction/acceptance change or closeout:

1. Save new evidence and decisions in the issue/brief, including the three
   [verdicts](product-oversight.md#accept-the-outcome).
2. Update issue metadata only when scope, state or dependencies change.
3. Replace the journey's current handoff once with a short result, evidence link,
   remaining gates, authority source and resume action. When the slice is
   complete, point to the ranking and add one to the slices-since-grooming count;
   leave the ranking itself to [grooming](product-oversight.md#groom-the-backlog).
   Replace rather than append: dated detail belongs in the evidence record, with
   [reporting conventions](progress-reporting.md).
4. File ideas for new work as Backlog issues labelled `needs-triage`, within
   tracker write authority, for the next grooming.

Use exact patches where supported; re-read after an anchor failure. Check every
write result before dependent updates or claims of success. If saving fails,
report the stale record and preserve a safe chat handoff. Routine chat updates
during an uninterrupted build need no duplicate tracker narration.

Apply the owner's existing authorization to its named actions and destinations.
This guide creates no standing write, messaging, publication, private-data or
spending grant. Record task-specific planning/progress authority in the handoff
with its source and limits.

## Feedback

Search for an existing Health Coach feedback record when concrete feedback needs
tracking. Reuse it, or create a project-linked inbox then link it from the journey.
An empty speculative inbox is unnecessary. Keep explicit owner instructions as
instructions; other observations are evidence, not automatic build commissions.

Before selecting work, read relevant unresolved feedback and all comment pages,
including replies. A document/root timestamp cannot establish that replies are
unchanged. Use full retrieval until a reply-aware incremental method is proven;
keep unreviewed entries pending after partial retrieval. At acceptance revisit
the feedback tied to the slice.

Keep safe original wording and source comment ID/permalink when available,
interpretation as a hypothesis, disposition/reason, revisit condition, linked
work and observed outcome. Label imported chat observations and invented
scenarios. Changed replies can reopen a disposition. Reply beside the source
only within existing messaging authority; otherwise retain the disposition in
the authorized record. Advance the reviewed checkpoint only after retrieval and
required saves succeed.

Apply [privacy guidance](privacy.md) to Linear as well as Git. Use sanitized
capability verdicts; keep real health details, source reports, screenshots,
private evaluation content, identifying data and credentials in their authorized
private stores. Inspection permission alone does not authorize exporting data.
