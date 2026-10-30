# Health Coach

Health Coach is a private, single-owner advisory health agent that turns longitudinal health data into explainable, risk-calibrated recommendations.

## Planning source

Linear is the planning-system source of truth. Before choosing or starting the
next feature, identify the current planning map and ready items in the **Health
coach** Linear project. Read the linked decision documents for the selected
item; do not substitute GitHub Projects or infer a roadmap from commit history
when Linear is available.

Start or resume work from the **now, next and later** document, found through
the [planning records](docs/agent-instructions/issue-tracker.md#planning-records).
The planning map and first-version specification there govern strategy; completed tracker state does not establish current acceptance.

## Operating workflow

- **Resume or checkpoint:** read [tracker ownership and feedback](docs/agent-instructions/issue-tracker.md).
- **Groom the backlog, select, expand or accept a capability:** read [product oversight](docs/agent-instructions/product-oversight.md).
- **Prepare, implement, verify or publish:** read [delivery workflow](docs/agent-instructions/delivery-workflow.md).
- **Report progress or close out:** read [progress reporting](docs/agent-instructions/progress-reporting.md).
- **Check the Android app on the owner's phone:** read [phone verification](docs/agent-instructions/phone-verification.md).
- **Implement visual design:** the source is `design/health-coach.pen`. Read it through the Pencil tools with the Pencil app open; when Pencil is closed, ask the owner to open it.
- **Change domain terms or architecture:** read [domain guidance](docs/agents/domain.md) and [architecture](docs/architecture.md).

Shared defaults, review roles and skills stay in their personal locations. These
documents adapt them to Health Coach; they grant no additional authority.

## Project constraints

- Use Node.js 22+ and pnpm 10 (`pnpm`); this is a Turborepo monorepo.
- Treat all tracked files and Git history as public: never commit personal health data, identifying information, credentials, tokens, source reports, screenshots, or real evaluation content.
- Read the applicable guidance before work in that area:
  - [Privacy and public-repository safety](docs/agent-instructions/privacy.md)
  - [Engineering approach](docs/agent-instructions/engineering.md)
  - [Testing and verification](docs/agent-instructions/testing.md)
  - [TypeScript and React conventions](docs/agent-instructions/typescript-react.md)
