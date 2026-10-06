import { chipRemaining, FPL_RULES_2026_27 } from "./rules.js";
import type { ChipCandidate, ChipPlan, FplSeasonRules, HorizonProjection, LineupPlan, SquadState } from "./types.js";

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
    return { recommended: candidates[0] ?? null, candidates };
  }
}
