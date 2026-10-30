# Delivery workflow

## Prepare

Read the [current handoff, selected issue and brief](issue-tracker.md#start-or-resume).
Use [product oversight](product-oversight.md) for selection or scope changes.
Read [privacy](privacy.md), [engineering](engineering.md), [testing](testing.md),
[TypeScript/React](typescript-react.md), and the applicable
[domain guidance](../agents/domain.md) and [architecture](../architecture.md).
Inspect the affected implementation before changing it; architecture prose may
describe intentions rather than current behavior.

Name the required acceptance environment and evidence before building. Confirm
external access, private-data scope, provider costs and deployment effects only
where the selected task depends on them. Carry existing grants forward with
their limits; an unknown fact blocks only dependent work. Keep synthetic proof
and any later private acceptance as separate gates.

## Build and verify

Use the existing checkout. Substantial work belongs on a feature branch; create
a worktree only on explicit owner instruction. Preserve unrelated edits and keep
one cohesive slice per local commit. Follow the existing no-co-author convention.

Inspect root and affected workspace `package.json` scripts as the command source
of truth. Current broad checks are `pnpm verify` (format, types, tests) and
`pnpm build` when affected work warrants a build. Run targeted behavioral checks
while working, then one broader pass; repeat for new changes or unresolved failures.

For documentation-only work, check changed Markdown formatting, links/anchors
and the diff. Application checks are warranted when executable commands,
configuration or code change. Standards/Spec code review uses a fixed base/head
diff and accepted brief when applicable; product review answers a different
question about usefulness. Scale review to the change.

### Local data and runtime checks

Follow [README local setup](../../README.md#local-development) for Node, pnpm,
Docker, Supabase, web, Expo and Inngest. Environment files may point to private
resources; inspect target identity safely before running data-affecting commands.

`pnpm supabase:verify` starts Supabase and **resets the local database** before
lifecycle verification. `pnpm supabase:reset` also destroys local data. Run
either only against a confirmed disposable synthetic database; locality alone
does not make the owner's Personal Health Record disposable. See
[database migrations](../../README.md#database-migrations) for non-reset migration
commands, which still mutate data and need the applicable task authority.

Synthetic tests demonstrate their bounded contracts. Local web checks do not
prove hosted authentication, durable scheduling or Android usability. Record
which surface and environment were exercised. Private imports, real evaluations
and hosted inspection require applicable authority; preserve unresolved gates
rather than silently running them or substituting synthetic proof.

## Publication and migrations

Before pushing or opening a PR, inspect the current workflow events/conditions,
deployment settings and actual target. Explain material automatic effects and
apply existing authority to them. Use the actual configuration and read-only
checks to establish the publication boundary.

- `.github/workflows/ci.yml` runs on pull requests and main pushes. It installs
  dependencies, runs disposable-runner Supabase verification, `pnpm verify` and
  `pnpm build`. These checks alone do not establish hosted behavior.
- `.github/workflows/deploy-supabase-migrations.yml` is manually dispatched with
  confirmation `deploy`, targets the `production` environment, links Supabase,
  performs a dry run and then pushes migrations. It does not reset production.
  Inspect configured environment protection rather than assuming approval is set.
- Hosted frontend and Inngest deployment behavior must be checked in their
  actual settings when publication is in scope. Do not infer preview isolation
  or production effects from CI, README intentions or another repository.

Apply [public-repository privacy checks](privacy.md), including commit metadata,
before publication. A local commit, PR, main merge, production migration and
private import are distinct actions; use the owner's grant for each. Attach any
created PR to the chat through the app tool.

## Close out

Review the scoped diff and checks, record the three
[verdicts](product-oversight.md#accept-the-outcome), then save one
[tracker checkpoint](issue-tracker.md#checkpoint). Use
[progress reporting](progress-reporting.md) for the owner summary. Keep remaining
acceptance gates and authority available to the next chat. The ranking, not
this slice, decides what follows; file new ideas for
[grooming](product-oversight.md#groom-the-backlog).
