# Phase 5 — FPL Vortex Intelligence

Phase 5 turns Vortex into a specialized Fantasy Premier League decision engine while keeping every recommendation traceable to normalized data, configurable rules, projections and explicit optimization logic.

## Pipeline

`FPL API -> validation -> projections -> risk -> lineup -> captain -> transfers -> squad optimization -> chips -> report -> optional memory`

## Current 2026/27 rule profile

The bundled `FPL_RULES_2026_27` profile models the current season: 15-player squads, maximum three players per club, up to five rolled free transfers, one Wildcard/Free Hit/Triple Captain/Bench Boost in each half, first-half chips expiring after GW19, one chip per Gameweek, and the GW19/GW20 Free Hit restriction. Rules live in one configuration object so later seasons can replace them cleanly.

## Engines

- `FplApiClient`: public FPL bootstrap/fixture/player/entry endpoints.
- `FplDataValidator`: duplicate/reference/shape sanity checks before analysis.
- `FplProjectionEngine`: expected minutes, form/history, xGI, clean-sheet, save, bonus, defensive-contribution and FDR features. Its outputs are heuristics, not official probabilities.
- `LineupOptimizer`: legal starting XI and bench selection.
- `CaptainEngine`: balanced, upside and differential ranking modes.
- `TransferOptimizer`: one/two-transfer search with budget, club limits, positional structure, free transfers, hits and risk-adjusted gain.
- `SquadOptimizer`: beam-search 15-player optimization for Wildcard/Free Hit scenarios.
- `ChipPlanner`: compares Triple Captain, Bench Boost, Free Hit and Wildcard incremental gains.
- `FplMonteCarloSimulator`: seeded distribution estimates (P10/P50/P90, haul/blank probabilities).
- `PriceTracker`: factual price deltas plus transfer-pressure indicators. It does not claim to know FPL's private price-change algorithm.
- `ProjectionBacktester`: MAE/RMSE/bias for model calibration.
- `FplSignalAggregator`: extensible injury, suspension, rotation and press-conference signals; the built-in provider uses FPL player news.
- `FplVortexIntelligence`: one stable `analyze()` entry point.
- `fpl.analyze`: permissioned agent tool using live network data.
- `FplReportMemoryBridge`: stores concise recommendations in project memory for later comparison and learning.

## Accuracy boundaries

Vortex distinguishes facts from forecasts. Official/public API data and validated external signals are evidence. Expected points, price pressure, captain scores, simulations and optimizer gains are model outputs and must be presented as estimates. Exact FPL selling prices should be supplied in `SquadState.sellingPrices`; otherwise current market prices are used only as an approximation.

## Future model upgrades

Phase 5 intentionally exposes interfaces rather than hard-coding third-party forecast feeds. Expected-minutes models, bookmaker probabilities, xG providers, press-conference parsers and learned projection models can be added later without changing the browser-chat contract.
