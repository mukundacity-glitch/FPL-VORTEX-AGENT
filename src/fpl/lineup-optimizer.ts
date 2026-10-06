import type { FplDataSnapshot, HorizonProjection, LineupPlan, PlayerProjection } from "./types.js";

function projectionFor(map: Map<number, HorizonProjection>, playerId: number, gameweek: number): PlayerProjection | undefined {
  return map.get(playerId)?.gameweeks.find((p) => p.gameweek === gameweek);
}

export class LineupOptimizer {
  public optimize(snapshot: FplDataSnapshot, squadIds: readonly number[], projections: readonly HorizonProjection[], gameweek: number): LineupPlan {
    const playerMap = new Map(snapshot.players.map((p) => [p.id, p]));
    const projectionMap = new Map(projections.map((p) => [p.playerId, p]));
    const squad = squadIds.map((id) => playerMap.get(id)).filter((p) => p !== undefined);
    if (squad.length !== 15) throw new Error(`Expected a 15-player squad, received ${squad.length}.`);

    const byPosition = (position: number) => squad
      .filter((p) => p.position === position)
      .sort((a, b) => (projectionFor(projectionMap, b.id, gameweek)?.expectedPoints ?? 0) - (projectionFor(projectionMap, a.id, gameweek)?.expectedPoints ?? 0));
    const keepers = byPosition(1); const defenders = byPosition(2); const mids = byPosition(3); const forwards = byPosition(4);
    if (keepers.length !== 2 || defenders.length !== 5 || mids.length !== 5 || forwards.length !== 3) throw new Error("Squad has an invalid FPL positional structure.");

    const starters = [keepers[0]!.id, ...defenders.slice(0, 3).map((p) => p.id), ...mids.slice(0, 2).map((p) => p.id), forwards[0]!.id];
    const selected = new Set(starters);
    const remaining = squad.filter((p) => !selected.has(p.id) && p.position !== 1)
      .sort((a, b) => (projectionFor(projectionMap, b.id, gameweek)?.expectedPoints ?? 0) - (projectionFor(projectionMap, a.id, gameweek)?.expectedPoints ?? 0));
    while (starters.length < 11) {
      const candidate = remaining.shift();
      if (!candidate) break;
      starters.push(candidate.id); selected.add(candidate.id);
    }
    const bench = squad.filter((p) => !selected.has(p.id))
      .sort((a, b) => {
        if (a.position === 1) return -1;
        if (b.position === 1) return 1;
        return (projectionFor(projectionMap, b.id, gameweek)?.expectedPoints ?? 0) - (projectionFor(projectionMap, a.id, gameweek)?.expectedPoints ?? 0);
      }).map((p) => p.id);
    const ranked = starters.slice().sort((a, b) => {
      const pa = projectionFor(projectionMap, a, gameweek); const pb = projectionFor(projectionMap, b, gameweek);
      const scoreA = (pa?.expectedPoints ?? 0) + (pa?.ceiling ?? 0) * 0.10 - (pa?.risk ?? 1) * 0.6;
      const scoreB = (pb?.expectedPoints ?? 0) + (pb?.ceiling ?? 0) * 0.10 - (pb?.risk ?? 1) * 0.6;
      return scoreB - scoreA;
    });
    const base = starters.reduce((sum, id) => sum + (projectionFor(projectionMap, id, gameweek)?.expectedPoints ?? 0), 0);
    const captain = ranked[0]!;
    return { gameweek, starters, bench, captainId: captain, viceCaptainId: ranked[1] ?? captain, expectedPoints: base + (projectionFor(projectionMap, captain, gameweek)?.expectedPoints ?? 0) };
  }
}
