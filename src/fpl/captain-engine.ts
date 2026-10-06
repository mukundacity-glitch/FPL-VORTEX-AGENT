import type { CaptainCandidate, FplDataSnapshot, HorizonProjection } from "./types.js";

export type CaptainMode = "balanced" | "upside" | "differential";

export class CaptainEngine {
  public rank(snapshot: FplDataSnapshot, starterIds: readonly number[], projections: readonly HorizonProjection[], gameweek: number, mode: CaptainMode = "balanced"): CaptainCandidate[] {
    const playerMap = new Map(snapshot.players.map((p) => [p.id, p]));
    const projectionMap = new Map(projections.map((p) => [p.playerId, p]));
    return starterIds.map((playerId): CaptainCandidate | null => {
      const player = playerMap.get(playerId);
      const projection = projectionMap.get(playerId)?.gameweeks.find((p) => p.gameweek === gameweek);
      if (!player || !projection) return null;
      const ownership = player.selectedByPercent / 100;
      const base = projection.expectedPoints + projection.ceiling * 0.16 - projection.risk * 1.1;
      const modeAdjustment = mode === "upside"
        ? projection.ceiling * 0.16
        : mode === "differential"
          ? (1 - ownership) * 1.6 + projection.ceiling * 0.08
          : ownership * 0.25;
      return { playerId, expectedPoints: projection.expectedPoints, ceiling: projection.ceiling, risk: projection.risk, captainScore: base + modeAdjustment };
    }).filter((candidate): candidate is CaptainCandidate => candidate !== null)
      .sort((a, b) => b.captainScore - a.captainScore);
  }
}
