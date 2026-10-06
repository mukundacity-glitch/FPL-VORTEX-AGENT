import { chipRemaining, FPL_RULES_2026_27 } from "./rules.js";
import type { ChipCandidate, ChipName, ChipPlan, FplSeasonRules, HorizonProjection, LineupPlan, SquadState } from "./types.js";

export interface ChipPlannerInput {
  squad: SquadState;
  gameweeks: readonly number[];
  lineups: readonly LineupPlan[];
  projections: readonly HorizonProjection[];
  wildcardGainByGameweek?: Readonly<Record<number, number>>;
  freeHitGainByGameweek?: Readonly<Record<number, number>>;
}

export class ChipPlanner {
  public constructor(private readonly rules: FplSeasonRules = FPL_RULES_2026_27) {}

  private schedule(candidates: readonly ChipCandidate[], squad: SquadState): ChipCandidate[] {
    const usedGameweeks = new Set<number>();
    const usedByHalf = new Map<string, number>();
    const selected: ChipCandidate[] = [];
    for (const candidate of candidates) {
      if (usedGameweeks.has(candidate.gameweek)) continue;
      const half = candidate.gameweek <= this.rules.firstHalfLastGameweek ? "first" : "second";
      const key = `${half}:${candidate.chip}`;
      const inventory = chipRemaining(squad.chips, candidate.chip, candidate.gameweek, this.rules);
      if ((usedByHalf.get(key) ?? 0) >= inventory) continue;
      if (this.rules.freeHitGw19Gw20Restriction && candidate.chip === "free_hit") {
        const conflicts = selected.some((item) => item.chip === "free_hit" && ((item.gameweek === 19 && candidate.gameweek === 20) || (item.gameweek === 20 && candidate.gameweek === 19)));
        if (conflicts) continue;
      }
      selected.push(candidate);
      usedGameweeks.add(candidate.gameweek);
      usedByHalf.set(key, (usedByHalf.get(key) ?? 0) + 1);
    }
    return selected.sort((a, b) => a.gameweek - b.gameweek);
  }

  public plan(input: ChipPlannerInput): ChipPlan {
    const projectionMap = new Map(input.projections.map((p) => [p.playerId, p]));
    const candidates: ChipCandidate[] = [];
    for (const gw of input.gameweeks) {
      const lineup = input.lineups.find((line) => line.gameweek === gw); if (!lineup) continue;
      const projection = (id: number) => projectionMap.get(id)?.gameweeks.find((p) => p.gameweek === gw)?.expectedPoints ?? 0;
      if (chipRemaining(input.squad.chips, "triple_captain", gw, this.rules) > 0) {
        const gain = projection(lineup.captainId);
        candidates.push({ chip: "triple_captain", gameweek: gw, expectedGain: gain, rationale: `Adds one extra captain score (${gain.toFixed(1)} xP) beyond normal captaincy.` });
      }
      if (chipRemaining(input.squad.chips, "bench_boost", gw, this.rules) > 0) {
        const gain = lineup.bench.reduce((sum, id) => sum + projection(id), 0);
        candidates.push({ chip: "bench_boost", gameweek: gw, expectedGain: gain, rationale: `Activates ${gain.toFixed(1)} projected bench points.` });
      }
      const fh = input.freeHitGainByGameweek?.[gw];
      if (fh !== undefined && chipRemaining(input.squad.chips, "free_hit", gw, this.rules) > 0 && !(this.rules.freeHitUnavailableGameweek1 && gw === 1)) {
        candidates.push({ chip: "free_hit", gameweek: gw, expectedGain: fh, rationale: "Single-Gameweek optimized squad gain versus the current squad." });
      }
      const wc = input.wildcardGainByGameweek?.[gw];
      if (wc !== undefined && chipRemaining(input.squad.chips, "wildcard", gw, this.rules) > 0) {
        candidates.push({ chip: "wildcard", gameweek: gw, expectedGain: wc, rationale: "Permanent multi-Gameweek squad optimization gain." });
      }
    }
    candidates.sort((a, b) => b.expectedGain - a.expectedGain);
    const schedule = this.schedule(candidates, input.squad);
    const recommended = candidates[0] ?? null;
    return { recommended, schedule, candidates };
  }
}
