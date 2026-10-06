import type { FplDataSnapshot, PriceMovementSignal } from "./types.js";

export class PriceTracker {
  public compare(previous: FplDataSnapshot, current: FplDataSnapshot): PriceMovementSignal[] {
    const before = new Map(previous.players.map((p) => [p.id, p]));
    return current.players.map((player): PriceMovementSignal | null => {
      const old = before.get(player.id); if (!old) return null;
      const priceChange = Number((player.price - old.price).toFixed(1));
      const netTransfers = player.transfersInEvent - player.transfersOutEvent;
      const ownershipBase = Math.max(player.selectedByPercent, 0.5);
      const pressure = netTransfers / (ownershipBase * 10000);
      return { playerId: player.id, priceChange, netTransfers, direction: priceChange > 0 ? "rise" : priceChange < 0 ? "fall" : "flat", pressure };
    }).filter((signal): signal is PriceMovementSignal => signal !== null)
      .sort((a, b) => Math.abs(b.pressure) - Math.abs(a.pressure));
  }
}
