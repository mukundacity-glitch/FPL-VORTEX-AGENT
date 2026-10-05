# FPL VORTEX AGENT

FPL VORTEX AGENT is an independent, multi-model agent orchestration platform for Fantasy Premier League research, simulation, decision support, content generation, automation, and software maintenance.

## Core principles

- **Multi-model routing** — OpenAI, Anthropic, and future providers behind one typed interface.
- **No single-model trust** — important outputs can be reviewed by a second model plus deterministic validators.
- **FPL-native agents** — data ingestion, projections, transfers, captaincy, chips, fixtures, press conferences, injuries/news, simulation, and publishing.
- **Self-maintaining workflow** — dependency and upstream-change monitors create reviewable update branches instead of silently replacing production code.
- **Reproducible decisions** — runs record inputs, provider/model, validation results, confidence, and final decisions.
- **Rollback-first releases** — changes are promoted only after verification gates pass.
- **Provider portability** — model IDs are configuration, so newer models can be adopted without rewriting the orchestration layer.

## Architecture

```text
FPL API / fixtures / club news / pressers / market data
                         |
                         v
                  Ingestion agents
                         |
                         v
                   Evidence layer
                         |
                         v
                  Task orchestrator
                 /       |        \
                /        |         \
            OpenAI   Anthropic   Future providers
                \        |         /
                 \       |        /
                  Candidate results
                         |
             +-----------+-----------+
             |                       |
   Deterministic validators   Independent reviewer
             |                       |
             +-----------+-----------+
                         |
                  Decision gate
                         |
             +-----------+-----------+
             |                       |
        FPL decisions          Publishing/actions
```

## Repository layout

```text
src/
  agents/          FPL domain agents
  config/          Runtime configuration
  core/            Orchestration primitives
  providers/       AI-provider adapters
  updates/         Upstream/dependency update logic
  verification/    Cross-model and deterministic checks
.github/workflows/ CI and update monitoring
```

## Local setup

```bash
npm install
cp .env.example .env
npm run typecheck
npm test
npm run build
```

Keep API keys only in `.env` locally or in your deployment secret manager. Never commit secrets.

## Relationship to Ruflo

This is an independent project, not an official Ruflo distribution. Architectural ideas and compatible components may be adapted from the MIT-licensed `ruvnet/ruflo` project where useful. Any copied or substantially derived MIT-licensed portions retain the required copyright and permission notice.

## Update strategy

Upstream and dependency changes are monitored automatically. Updates are applied through a branch/PR, validated by type checks, tests, compatibility checks, and review gates, and only then promoted. The goal is to stay current without allowing a bad upstream change to break FPL VORTEX automatically.
