import { CaptainEngine, type CaptainMode } from "./captain-engine.js";
import { ChipPlanner } from "./chip-planner.js";
import { FplDataValidator } from "./data-validator.js";
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
  private readonly validator = new FplDataValidator();
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
    return snapshot.gameweeks.filter((gw) => gw.id >= start).slice(0, Math.max(1, Math.min(horizon, 12))).map((gw) => gw.id);
  }

  private validateSquad(snapshot: FplDataSnapshot, squad: SquadState): void {
    if (squad.playerIds.length !== this.rules.squadSize || new Set(squad.playerIds).size !== this.rules.squadSize) throw new Error("Squad must contain 15 unique players.");
    if (squad.bank < 0) throw new Error("Squad bank cannot be negative.");
    const map = new Map(snapshot.players.map((p) => [p.id, p]));
    const players = squad.playerIds.map((id) => map.get(id));
    if (players.some((p) => p === undefined)) throw new Error("Squad contains player IDs not present in the FPL snapshot.");
    const definite = players.filter((p) => p !== undefined);
    const positions = new Map<number, number>(); const clubs = new Map<number, number>();
    for (const player of definite) { positions.set(player.position, (positions.get(player.position) ?? 0) + 1); clubs.set(player.teamId, (clubs.get(player.teamId) ?? 0) + 1); }
    if (positions.get(1) !== 2 || positions.get(2) !== 5 || positions.get(3) !== 5 || positions.get(4) !== 3) throw new Error("Squad positional structure must be 2 GK, 5 DEF, 5 MID and 3 FWD.");
    if ([...clubs.values()].some((count) => count > this.rules.maxPlayersPerClub)) throw new Error(`Squad exceeds the ${this.rules.maxPlayersPerClub}-players-per-club limit.`);
  }

  private budget(snapshot: FplDataSnapshot, squad: SquadState): number {
    const map = new Map(snapshot.players.map((p) => [p.id, p]));
    return squad.playerIds.reduce((sum, id) => sum + (squad.sellingPrices?.[id] ?? map.get(id)?.price ?? 0), 0) + squad.bank;
  }

  private squadScore(playerIds: readonly number[], projections: readonly HorizonProjection[]): number {
    const map = new Map(projections.map((p) => [p.playerId, p.riskAdjustedPoints]));
    return playerIds.reduce((sum, id) => sum + (map.get(id) ?? 0), 0);
  }

  private projectionsFrom(projections: readonly HorizonProjection[], fromGameweek: number): HorizonProjection[] {
    return projections.map((horizon) => {
      const gameweeks = horizon.gameweeks.filter((p) => p.gameweek >= fromGameweek);
      let weightedPoints = 0; let riskAdjustedPoints = 0;
      gameweeks.forEach((p, index) => {
        const weight = 0.92 ** index;
        weightedPoints += p.expectedPoints * weight;
        riskAdjustedPoints += p.expectedPoints * (1 - p.risk * 0.18) * weight;
      });
      return { playerId: horizon.playerId, gameweeks, weightedPoints, riskAdjustedPoints };
    });
  }

  public async analyze(squad: SquadState, options: FplAnalyzeOptions = {}): Promise<FplAnalysisReport> {
    const snapshot = options.snapshot ?? await this.api.snapshot();
    const dataWarnings = this.validator.assertValid(snapshot);
    this.validateSquad(snapshot, squad);
    const gameweeks = this.upcomingGameweeks(snapshot, options.horizon ?? 6);
    if (gameweeks.length === 0) throw new Error("No upcoming FPL Gameweek is available.");
    const projections = this.projection.projectHorizon(snapshot, gameweeks);
    const lineups = gameweeks.map((gw) => this.lineup.optimize(snapshot, squad.playerIds, projections, gw));
    const first = lineups[0]!;
    const captainCandidates = this.captain.rank(snapshot, first.starters, projections, first.gameweek, options.captainMode ?? "balanced");
    const transferPlans = this.transfer.optimize(snapshot, squad, projections, options.maxTransfers ?? 2);
    const totalBudget = this.budget(snapshot, squad);
    const freeHitGain: Record<number, number> = {}; const wildcardGain: Record<number, number> = {};
    for (const gw of gameweeks) {
      const singleGwSquad = this.squadOptimizer.optimize(snapshot, projections, totalBudget, gw);
      const currentLine = lineups.find((line) => line.gameweek === gw);
      if (singleGwSquad && currentLine) {
        const optimizedLine = this.lineup.optimize(snapshot, singleGwSquad.playerIds, projections, gw);
        freeHitGain[gw] = Math.max(0, optimizedLine.expectedPoints - currentLine.expectedPoints);
      }
      const futureProjections = this.projectionsFrom(projections, gw);
      const wildcard = this.squadOptimizer.optimize(snapshot, futureProjections, totalBudget);
      const currentScore = this.squadScore(squad.playerIds, futureProjections);
      if (wildcard) wildcardGain[gw] = Math.max(0, wildcard.score - currentScore);
    }
    const chipPlan = this.chips.plan({ squad, gameweeks, lineups, projections, freeHitGainByGameweek: freeHitGain, wildcardGainByGameweek: wildcardGain });
    const signals = await this.signals.collect(snapshot);
    const signalWarnings = signals.filter((signal) => signal.reliability >= 0.65 && signal.playerId !== undefined && squad.playerIds.includes(signal.playerId)).map((signal) => `${signal.kind}: ${signal.text}`);
    const warnings = [...dataWarnings, ...signalWarnings];
    if (!squad.sellingPrices) warnings.push("Exact selling prices were not supplied; budget calculations use current market prices as an approximation.");
    if (squad.freeTransfers > this.rules.maxRolledFreeTransfers) warnings.push(`Free transfers were capped at ${this.rules.maxRolledFreeTransfers} by the ${this.rules.season} rules profile.`);
    return { generatedAt: new Date().toISOString(), currentGameweek: first.gameweek, horizon: gameweeks, lineup: first, captainCandidates, transferPlans, chipPlan, projections: projections.filter((p) => squad.playerIds.includes(p.playerId)), warnings };
  }
}
