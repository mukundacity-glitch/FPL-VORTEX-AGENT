# FPL VORTEX AGENT Architecture

## Goal

Build an independent FPL-native meta-harness that matches the useful orchestration, memory, swarm, workflow, plugin, and self-improvement ideas of Ruflo while adding stronger FPL specialization, multi-provider consensus, deterministic validation, and controlled self-updating.

## Model roles

### Claude Fable 5.1 — deep reasoning

Default for the hardest FPL decisions: long-horizon transfer planning, chip strategy, scenario analysis, contradictory evidence, and large-context synthesis.

### OpenAI managed Codex harness — coding and autonomous implementation

Use OpenAI Agents API with an OpenAI-hosted sandbox for repository work, migrations, tests, tool-driven implementation, and maintenance tasks. This is intentionally separate from a simple Responses API call.

### OpenAI Responses — independent verification and lower-overhead reasoning

Use for review/critique tasks where a full managed coding sandbox is unnecessary.

### Claude Opus 5.5 — secondary Anthropic reviewer

Use where Fable is unnecessary but an Anthropic-side independent review is desirable.

## Required subsystems

1. **Evidence ingestion**
   - Official FPL API
   - fixtures and results
   - player availability/status
   - club/manager press conferences
   - injury/news feeds
   - price and ownership changes
   - user squad and transfer state

2. **Evidence ledger**
   - timestamp every fact
   - retain source/provenance
   - distinguish official data, reporting, projection, and model inference
   - expire stale evidence

3. **Agent registry**
   - planner
   - FPL data specialist
   - fixture analyst
   - xMins/availability analyst
   - projection modeler
   - transfer optimizer
   - captaincy analyst
   - chip strategist
   - press-conference analyst
   - injury/news analyst
   - price-change analyst
   - simulator/backtester
   - content/publishing agent
   - verifier/critic
   - code maintainer

4. **Swarm/task graph**
   - decompose large objectives into typed tasks
   - run independent tasks in parallel
   - express dependencies explicitly
   - retry idempotent failures
   - prevent duplicate actions
   - support hard deadlines around FPL gameweek lock

5. **Model router**
   - route by task capability, cost, latency, context size, and provider health
   - Fable only when the task warrants frontier reasoning
   - managed Codex for code/tool-heavy autonomous work
   - cheaper/faster models for routine extraction and formatting
   - fail over between providers where safe

6. **Verification gate**
   - deterministic schema/constraint checks
   - second-model critique for important decisions
   - optional multi-model quorum for high-impact recommendations
   - reject rather than publish when confidence/evidence is insufficient

7. **FPL optimization engine**
   - expected-points projections
   - minutes/starting probability
   - transfer horizon optimization
   - hit-cost accounting
   - captain/vice expected utility
   - chip simulations
   - bench and formation optimization
   - uncertainty and downside modelling

8. **Memory and learning**
   - retain successful/failed decision patterns
   - backtest recommendations against realized outcomes
   - store prompt/evaluation versions
   - learn calibration by agent and model
   - never treat model-generated memory as fact without provenance

9. **Publishing and automation**
   - scheduled news summaries
   - gameweek deadline workflows
   - captain comparisons
   - press conference summaries
   - graphics/content payloads
   - deduplication and cooldown rules

10. **Self-maintenance**
    - monitor Ruflo upstream and dependency releases
    - inspect deltas
    - port useful changes into a dedicated branch
    - run CI, compatibility tests, and evals
    - promote only verified updates
    - preserve rollback points

## Update policy

"Always updated" does not mean blindly installing every upstream commit. The system detects new upstream versions automatically, creates a reviewable integration task, tests it, and only promotes it after validation. This protects production from compromised, incompatible, or simply broken upstream changes.

## Security boundaries

- secrets never enter the repository
- production actions use least-privilege credentials
- read-only agents cannot publish or mutate
- high-impact actions require explicit policy gates
- tool execution is sandboxed where available
- every model/tool action is auditable

## Planned build order

1. typed orchestration + multi-provider adapters
2. CI + update monitor
3. official FPL data/evidence layer
4. task router and specialist agent registry
5. deterministic optimization/simulation engine
6. persistent memory + run ledger
7. gameweek workflows and publishing
8. backtesting/evals and self-improvement loop
9. dashboard/observability
10. automated upstream-port PRs with rollback
