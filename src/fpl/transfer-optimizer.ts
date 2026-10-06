import type { FplDataSnapshot, FplPlayer, FplSeasonRules, HorizonProjection, SquadState, TransferMove, TransferPlan } from "./types.js";
import { FPL_RULES_2026_27 } from "./rules.js";

export interface TransferOptimizerOptions { candidatePool?: number; maxPlans?: number; riskWeight?: number; }
function validSquad(players: readonly FplPlayer[], rules: FplSeasonRules): boolean {
  if (players.length !== rules.squadSize) return false;
  const clubs = new Map<number, number>(); const positions = new Map<number, number>();
  for (const player of players) { clubs.set(player.teamId, (clubs.get(player.teamId) ?? 0) + 1); positions.set(player.position, (positions.get(player.position) ?? 0) + 1); }
  return [...clubs.values()].every((count) => count <= rules.maxPlayersPerClub)
    && positions.get(1) === 2 && positions.get(2) === 5 && positions.get(3) === 5 && positions.get(4) === 3;
}

export class TransferOptimizer {
  private readonly candidatePool: number; private readonly maxPlans: number; private readonly riskWeight: number;
  public constructor(private readonly rules: FplSeasonRules = FPL_RULES_2026_27, options: TransferOptimizerOptions = {}) {
    this.candidatePool = options.candidatePool ?? 12; this.maxPlans = options.maxPlans ?? 10; this.riskWeight = options.riskWeight ?? 0.22;
  }

  public optimize(snapshot: FplDataSnapshot, squad: SquadState, projections: readonly HorizonProjection[], maxTransfers = 2): TransferPlan[] {
    const playerMap = new Map(snapshot.players.map((p) => [p.id, p])); const projMap = new Map(projections.map((p) => [p.playerId, p]));
    const original = squad.playerIds.map((id) => playerMap.get(id)).filter((p) => p !== undefined);
    if (!validSquad(original, this.rules)) throw new Error("Transfer optimizer requires a legal 15-player FPL squad.");
    const score = (id: number) => projMap.get(id)?.riskAdjustedPoints ?? 0;
    const salePrice = (id: number) => squad.sellingPrices?.[id] ?? playerMap.get(id)?.price ?? 0;
    const plans: TransferPlan[] = []; const outCandidates = original.slice().sort((a, b) => score(a.id) - score(b.id)).slice(0, 8);
    const availableFreeTransfers = Math.min(this.rules.maxRolledFreeTransfers, Math.max(0, squad.freeTransfers));

    const tryPlan = (moves: TransferMove[]) => {
      const outIds = new Set(moves.map((m) => m.outPlayerId)); const inIds = new Set(moves.map((m) => m.inPlayerId));
      if (outIds.size !== moves.length || inIds.size !== moves.length) return;
      const nextIds = squad.playerIds.filter((id) => !outIds.has(id)).concat([...inIds]);
      const players = nextIds.map((id) => playerMap.get(id)).filter((p) => p !== undefined); if (!validSquad(players, this.rules)) return;
      const received = moves.reduce((sum, m) => sum + salePrice(m.outPlayerId), 0);
      const spent = moves.reduce((sum, m) => sum + (playerMap.get(m.inPlayerId)?.price ?? 0), 0);
      const bank = squad.bank + received - spent; if (bank < -1e-9) return;
      const rawGain = moves.reduce((sum, m) => sum + score(m.inPlayerId) - score(m.outPlayerId), 0);
      const hits = Math.max(0, moves.length - availableFreeTransfers) * 4;
      const uncertainty = moves.reduce((sum, m) => sum + Math.max(0, (projMap.get(m.inPlayerId)?.weightedPoints ?? 0) - score(m.inPlayerId)), 0) * this.riskWeight;
      plans.push({ moves, cost: spent - received, pointsHit: hits, expectedGain: rawGain - hits, riskAdjustedGain: rawGain - hits - uncertainty, resultingBank: bank, resultingPlayerIds: nextIds });
    };

    for (const out of outCandidates) {
      const ins = snapshot.players.filter((p) => p.position === out.position && !squad.playerIds.includes(p.id)).sort((a, b) => score(b.id) - score(a.id)).slice(0, this.candidatePool);
      for (const incoming of ins) tryPlan([{ outPlayerId: out.id, inPlayerId: incoming.id }]);
    }
    if (maxTransfers >= 2) {
      const outs = outCandidates.slice(0, 5);
      for (let i = 0; i < outs.length; i += 1) for (let j = i + 1; j < outs.length; j += 1) {
        const a = outs[i]!; const b = outs[j]!;
        const inA = snapshot.players.filter((p) => p.position === a.position && !squad.playerIds.includes(p.id)).sort((x, y) => score(y.id) - score(x.id)).slice(0, 5);
        const inB = snapshot.players.filter((p) => p.position === b.position && !squad.playerIds.includes(p.id)).sort((x, y) => score(y.id) - score(x.id)).slice(0, 5);
        for (const x of inA) for (const y of inB) if (x.id !== y.id) tryPlan([{ outPlayerId: a.id, inPlayerId: x.id }, { outPlayerId: b.id, inPlayerId: y.id }]);
      }
    }
    return plans.sort((a, b) => b.riskAdjustedGain - a.riskAdjustedGain).slice(0, this.maxPlans);
  }
}
