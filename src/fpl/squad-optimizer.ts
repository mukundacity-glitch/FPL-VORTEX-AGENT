import { FPL_RULES_2026_27 } from "./rules.js";
import type { FplDataSnapshot, FplPlayer, FplSeasonRules, HorizonProjection } from "./types.js";

export interface OptimizedSquad { playerIds: number[]; cost: number; score: number; }
export interface SquadOptimizerOptions { candidatePoolPerPosition?: number; beamWidth?: number; }
interface PartialSquad { playerIds: number[]; cost: number; score: number; clubs: Map<number, number>; }
interface PositionCombo { playerIds: number[]; cost: number; score: number; clubs: Map<number, number>; }

function combinations<T>(items: readonly T[], choose: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, current: T[]) => {
    if (current.length === choose) { out.push(current.slice()); return; }
    for (let index = start; index <= items.length - (choose - current.length); index += 1) walk(index + 1, [...current, items[index]!]);
  };
  walk(0, []); return out;
}

export class SquadOptimizer {
  private readonly pool: number; private readonly beamWidth: number;
  public constructor(private readonly rules: FplSeasonRules = FPL_RULES_2026_27, options: SquadOptimizerOptions = {}) {
    this.pool = options.candidatePoolPerPosition ?? 14; this.beamWidth = options.beamWidth ?? 500;
  }

  public optimize(snapshot: FplDataSnapshot, projections: readonly HorizonProjection[], budget: number, gameweek?: number): OptimizedSquad | null {
    const projectionMap = new Map(projections.map((p) => [p.playerId, p]));
    const score = (player: FplPlayer) => {
      const horizon = projectionMap.get(player.id); if (!horizon) return -Infinity;
      if (gameweek === undefined) return horizon.riskAdjustedPoints;
      const projection = horizon.gameweeks.find((p) => p.gameweek === gameweek);
      return projection ? projection.expectedPoints * (1 - projection.risk * 0.16) : 0;
    };
    const requirements = [[1, 2], [2, 5], [3, 5], [4, 3]] as const;
    const comboGroups: PositionCombo[][] = [];
    for (const [position, count] of requirements) {
      const candidates = snapshot.players.filter((p) => p.position === position && Number.isFinite(score(p)))
        .sort((a, b) => score(b) - score(a)).slice(0, this.pool);
      if (candidates.length < count) return null;
      const combos = combinations(candidates, count).map((group): PositionCombo => {
        const clubs = new Map<number, number>();
        for (const p of group) clubs.set(p.teamId, (clubs.get(p.teamId) ?? 0) + 1);
        return { playerIds: group.map((p) => p.id), cost: group.reduce((sum, p) => sum + p.price, 0), score: group.reduce((sum, p) => sum + score(p), 0), clubs };
      }).filter((combo) => [...combo.clubs.values()].every((value) => value <= this.rules.maxPlayersPerClub))
        .sort((a, b) => b.score - a.score).slice(0, this.beamWidth);
      comboGroups.push(combos);
    }
    let beam: PartialSquad[] = [{ playerIds: [], cost: 0, score: 0, clubs: new Map() }];
    for (const combos of comboGroups) {
      const next: PartialSquad[] = [];
      for (const partial of beam) for (const combo of combos) {
        const cost = partial.cost + combo.cost; if (cost > budget + 1e-9) continue;
        const clubs = new Map(partial.clubs); let valid = true;
        for (const [club, count] of combo.clubs) { const total = (clubs.get(club) ?? 0) + count; if (total > this.rules.maxPlayersPerClub) { valid = false; break; } clubs.set(club, total); }
        if (valid) next.push({ playerIds: [...partial.playerIds, ...combo.playerIds], cost, score: partial.score + combo.score, clubs });
      }
      beam = next.sort((a, b) => b.score - a.score).slice(0, this.beamWidth);
      if (beam.length === 0) return null;
    }
    const best = beam[0]; return best ? { playerIds: best.playerIds, cost: best.cost, score: best.score } : null;
  }
}
