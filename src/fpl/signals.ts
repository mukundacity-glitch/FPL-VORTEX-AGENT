import type { FplDataSnapshot } from "./types.js";

export type FplSignalKind = "injury" | "suspension" | "minutes" | "press_conference" | "rotation" | "other";
export interface FplSignal { playerId?: number; teamId?: number; kind: FplSignalKind; text: string; source: string; publishedAt: string; reliability: number; }
export interface FplSignalProvider { collect(snapshot: FplDataSnapshot): Promise<readonly FplSignal[]>; }

export class BootstrapNewsSignalProvider implements FplSignalProvider {
  public async collect(snapshot: FplDataSnapshot): Promise<readonly FplSignal[]> {
    return snapshot.players.filter((p) => p.news.trim()).map((p): FplSignal => ({
      playerId: p.id, teamId: p.teamId, kind: p.status === "s" ? "suspension" : "injury", text: p.news.trim(), source: "FPL bootstrap-static", publishedAt: snapshot.fetchedAt, reliability: 0.90,
    }));
  }
}

export class FplSignalAggregator {
  public constructor(private readonly providers: readonly FplSignalProvider[] = [new BootstrapNewsSignalProvider()]) {}
  public async collect(snapshot: FplDataSnapshot): Promise<FplSignal[]> {
    const groups = await Promise.all(this.providers.map((provider) => provider.collect(snapshot)));
    const dedup = new Map<string, FplSignal>();
    for (const signal of groups.flat()) {
      const key = `${signal.playerId ?? 0}:${signal.teamId ?? 0}:${signal.kind}:${signal.text.toLowerCase()}`;
      const existing = dedup.get(key); if (!existing || signal.reliability > existing.reliability) dedup.set(key, signal);
    }
    return [...dedup.values()].sort((a, b) => b.reliability - a.reliability);
  }
}
