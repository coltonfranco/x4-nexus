# Architecture

The full build plan — including the trade-route ranking design, save-file streaming approach,
schema sketches, milestones, and identified hard problems — lives at:

**`C:\Users\colto\.claude\plans\binary-seeking-nebula.md`**

This file exists in the repo as a stable entry point. The plan is the source of truth for
**why** decisions were made; this directory ([`docs/`](.)) captures more granular references
that change with the code:

- [`data-tiers.md`](data-tiers.md) — V1 MUST / NICE / SKIP inventory of game XML files
- [`openapi.yaml`](openapi.yaml) — generated from FastAPI; the public contract for the API

If you change architecture in code, update the plan file first, then propagate here.
