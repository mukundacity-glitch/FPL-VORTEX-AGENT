import { CaptainEngine, type CaptainMode } from "./captain-engine.js";
import { ChipPlanner } from "./chip-planner.js";
import { FplApiClient } from "./fpl-api-client.js";
import { LineupOptimizer } from "./lineup-optimizer.js";
import { FplProjectionEngine } from "./projection-engine.js";
import { FPL_RULES_2026_27 } from "./rules.js";
import { SquadOptimizer } from "./squad-optimizer.js";
import { FplSignalAggregator } from "./signals.js";
import { TransferOptimizer } from "./transfer-optimizer.js";
import type { FplAnalysisReport, FplDataSnapshot, FplSeasonRules, HorizonProjection, SquadState } from "./types.js";

export interface FplAnalyzeOptions { horizon?: number; maxTransfers?: number; captainMode?: CaptainMode; snapshot?: FplDataSnapshot; }

export class FplVortexIntelligence {
  private readonly projection = new FplProjectionEngine();
  private readonly lineup = new LineupOptimizer();
  private readonly captain = new CaptainEngine();
  private readonly transfer: TransferOptimizer;
  private readonly chips: ChipPlanner;
  private readonly squadOptimizer: SquadOptimizer;

  public constructor(
    private readonly api = new FplApiClient(),
    private readonly rules: FplSeasonRules = FPL_RULES_2026_27,
    private readonly signals = new FplSignalAggregator(),
  ) {
    this.transfer = new TransferOptimizer(rules);
    this.chips = new ChipPlanner(rules);
    this.squadOptimizer = new SquadOptimizer(rules);
  }

  private upcomingGameweeks(snapshot: FplDataSnapshot, horizon: number): number[] {
    const start = snapshot.gameweeks.find((gw) => gw.isNext)?.id ?? snapshot.gameweeks.find((gw) => gw.isCurrent && !gw.finished)?.id ?? 1;
    return snapshot.gameweeks.filter((gw) => gw.id >= start).slice(0, Math.max(1, horizon)).map((gw) => gw.id);
  }

  private budget(snapshot: FplDataSnapshot, squad: SquadState): number {
    const map = new Map(snapshot.players.map((p) => [p.id, p]));
    return squad.playerIds.reduce((sum, id) => sum + (squad.sellingPrices?.[id] ?? map.get(id)?.price ?? 0), 0) + squad.bank;
  }

  private squadScore(playerIds: readonly number[], projections: readonly HorizonProjection[]): number {
    const map = new Map(projections.map((p) => [p.playerId, p.riskAdjustedPoints]));
    return playerIds.reduce((sum, id) => sum + (map.get(id) ?? 0), 0);
  }

  public async analyze(squad: SquadState, options: FplAnalyzeOptions = {}): Promise<FplAnalysisReport> {
    const snapshot = options.snapshot ?? await this.api.snapshot();
    const gameweeks = this.upcomingGameweeks(snapshot, options.horizon ?? 6);
    const projections = this.projection.projectHorizon(snapshot, gameweeks);
    const lineups = gameweeks.map((gw) => this.lineup.optimize(snapshot, squad.playerIds, projections, gw));
    const first = lineups[0]; if (!first) throw new Error("No upcoming FPL Gameweek is available.");
    const captainCandidates = this.captain.rank(snapshot, first.starters, projections, first.gameweek, options.captainMode ?? "balanced");
    const transferPlans = this.transfer.optimize(snapshot, squad, projections, options.maxTransfers ?? 2);
    const totalBudget = this.budget(snapshot, squad);
    const freeHitGain: Record<number, number> = {}; const wildcardGain: Record<number, number> = {};
    const currentHorizonScore = this.squadScore(squad.playerIds, projections);
    for (const gw of gameweeks) {
      const optimized = this.squadOptimizer.optimize(snapshot, projections, totalBudget, gw);
      const currentLine = lineups.find((line) => line.gameweek === gw);
      if (optimized && currentLine) {
        const optimizedLine = this.lineup.optimize(snapshot, optimized.playerIds, projections, gw);
        freeHitGain[gw] = Math.max(0, optimizedLine.expectedPoints - currentLine.expectedPoints);
      }
      const wildcard = this.squadOptimizer.optimize(snapshot, projections, totalBudget);
      if (wildcard) wildcardGain[gw] = Math.max(0, wildcard.score - currentHorizonScore);
    }
    const chipPlan = this.chips.plan({ squad, gameweeks, lineups, projections, freeHitGainByGameweek: freeHitGain, wildcardGainByGameweek: wildcardGain });
    const signals = await this.signals.collect(snapshot);
    const warnings = signals.filter((signal) => signal.reliability >= 0.65 && signal.playerId !== undefined && squad.playerIds.includes(signal.playerId))
      .map((signal) => `${signal.kind}: ${signal.text}`);
    return { generatedAt: new Date().toISOString(), currentGameweek: first.gameweek, horizon: gameweeks, lineup: first, captainCandidates, transferPlans, chipPlan, projections: projections.filter((p) => squad.playerIds.includes(p.playerId)), warnings };
  }
}
