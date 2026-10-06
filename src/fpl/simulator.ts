import type { PlayerProjection, SimulationSummary } from "./types.js";

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gaussian(next: () => number): number {
  const u1 = Math.max(next(), 1e-12); const u2 = next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function percentile(values: readonly number[], p: number): number { const index = Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * p))); return values[index] ?? 0; }

export class FplMonteCarloSimulator {
  public simulate(projection: PlayerProjection, iterations = 5000, seed = 202627): SimulationSummary {
    const next = rng(seed ^ projection.playerId ^ projection.gameweek);
    const values: number[] = [];
    for (let i = 0; i < Math.max(100, iterations); i += 1) {
      const availability = next() <= projection.expectedMinutes / 90;
      const sample = availability ? Math.max(0, projection.expectedPoints + gaussian(next) * projection.standardDeviation) : 0;
      values.push(sample);
    }
    values.sort((a, b) => a - b);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return {
      playerId: projection.playerId, gameweek: projection.gameweek, mean,
      p10: percentile(values, 0.10), p50: percentile(values, 0.50), p90: percentile(values, 0.90),
      haulProbability: values.filter((v) => v >= 10).length / values.length,
      blankProbability: values.filter((v) => v < 2).length / values.length,
    };
  }
}
