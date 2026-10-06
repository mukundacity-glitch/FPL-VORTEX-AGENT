import type { FplDataSnapshot, FplFixture, FplPlayer, HorizonProjection, PlayerProjection, ProjectionComponents } from "./types.js";

export interface ProjectionEngineOptions {
  recencyWeight?: number;
  fixtureWeight?: number;
  riskPenalty?: number;
  horizonDecay?: number;
}

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function fixturesFor(snapshot: FplDataSnapshot, player: FplPlayer, gameweek: number): FplFixture[] {
  return snapshot.fixtures.filter((f) => f.event === gameweek && (f.teamHome === player.teamId || f.teamAway === player.teamId));
}
function playerDifficulty(f: FplFixture, teamId: number): number { return f.teamHome === teamId ? f.difficultyHome : f.difficultyAway; }

export class FplProjectionEngine {
  private readonly recencyWeight: number;
  private readonly fixtureWeight: number;
  private readonly riskPenalty: number;
  private readonly horizonDecay: number;

  public constructor(options: ProjectionEngineOptions = {}) {
    this.recencyWeight = options.recencyWeight ?? 0.62;
    this.fixtureWeight = options.fixtureWeight ?? 0.22;
    this.riskPenalty = options.riskPenalty ?? 0.18;
    this.horizonDecay = options.horizonDecay ?? 0.92;
  }

  public expectedMinutes(player: FplPlayer): number {
    const minutesPerStart = player.starts > 0 ? player.minutes / player.starts : Math.min(player.minutes, 90);
    const base = player.starts > 0 ? clamp(minutesPerStart, 20, 90) : clamp(player.minutes / 3, 0, 70);
    const availability = player.chanceOfPlayingNextRound === null ? (player.status === "a" ? 1 : 0.65) : player.chanceOfPlayingNextRound / 100;
    return clamp(base * availability, 0, 90);
  }

  public projectPlayer(snapshot: FplDataSnapshot, player: FplPlayer, gameweek: number): PlayerProjection {
    const fixtures = fixturesFor(snapshot, player, gameweek);
    const expectedMinutes = this.expectedMinutes(player);
    if (fixtures.length === 0) {
      return { playerId: player.id, gameweek, fixtureIds: [], expectedMinutes: 0, expectedPoints: 0, floor: 0, ceiling: 0, standardDeviation: 0, risk: 1, components: { appearance: 0, attack: 0, cleanSheet: 0, saves: 0, bonus: 0, defensiveContribution: 0, fixtureAdjustment: 0 } };
    }

    const minuteShare = expectedMinutes / 90;
    const historicalRate = player.minutes > 0 ? player.totalPoints / (player.minutes / 90) : player.pointsPerGame;
    const formRate = player.form || player.epNext || player.pointsPerGame || historicalRate;
    const blendedRate = this.recencyWeight * formRate + (1 - this.recencyWeight) * historicalRate;
    const attackPer90 = player.minutes > 0 ? player.expectedGoalInvolvements / (player.minutes / 90) : 0;
    const positionAttackMultiplier = player.position === 2 ? 5.7 : player.position === 3 ? 4.7 : player.position === 4 ? 4.0 : 5.2;
    const attack = attackPer90 * positionAttackMultiplier * minuteShare;
    const appearance = expectedMinutes >= 60 ? 2 : expectedMinutes > 0 ? 1 : 0;
    const csBase = player.minutes > 0 ? player.cleanSheets / Math.max(1, player.starts || player.minutes / 90) : 0.2;
    const csPoints = player.position <= 2 ? 4 : player.position === 3 ? 1 : 0;
    const saveRate = player.position === 1 && player.minutes > 0 ? (player.saves / (player.minutes / 90)) / 3 : 0;
    const bonusRate = player.minutes > 0 ? player.bonus / (player.minutes / 90) : 0;
    const defRate = player.minutes > 0 ? player.defensiveContribution / (player.minutes / 90) : 0;

    let total = 0;
    let fixtureAdjustment = 0;
    for (const fixture of fixtures) {
      const difficulty = playerDifficulty(fixture, player.teamId);
      const fixtureFactor = clamp(1 + (3 - difficulty) * this.fixtureWeight, 0.55, 1.45);
      fixtureAdjustment += fixtureFactor - 1;
      total += Math.max(0, (blendedRate * 0.48 + appearance * 0.20 + attack * 0.70 + csBase * csPoints * 0.34 + saveRate * 0.25 + bonusRate * 0.20 + defRate * 0.16) * minuteShare * fixtureFactor);
    }
    total = Math.max(total, player.epNext > 0 && fixtures.length === 1 ? total * 0.72 + player.epNext * 0.28 : total);
    const availabilityRisk = 1 - expectedMinutes / 90;
    const volatility = clamp(0.30 + attackPer90 * 0.55 + availabilityRisk * 0.65, 0.25, 1.2);
    const standardDeviation = Math.max(1.3, total * volatility);
    const expectedPoints = Number(total.toFixed(3));
    const risk = clamp(availabilityRisk * 0.65 + volatility * 0.25, 0, 1);
    const components: ProjectionComponents = {
      appearance: appearance * fixtures.length,
      attack: attack * fixtures.length,
      cleanSheet: csBase * csPoints * fixtures.length,
      saves: saveRate * fixtures.length,
      bonus: bonusRate * fixtures.length,
      defensiveContribution: defRate * fixtures.length,
      fixtureAdjustment,
    };
    return {
      playerId: player.id, gameweek, fixtureIds: fixtures.map((f) => f.id), expectedMinutes,
      expectedPoints, floor: Number(Math.max(0, expectedPoints - 1.15 * standardDeviation).toFixed(3)),
      ceiling: Number((expectedPoints + 1.65 * standardDeviation).toFixed(3)), standardDeviation, risk, components,
    };
  }

  public projectHorizon(snapshot: FplDataSnapshot, gameweeks: readonly number[]): HorizonProjection[] {
    return snapshot.players.map((player) => {
      const projections = gameweeks.map((gw) => this.projectPlayer(snapshot, player, gw));
      let weightedPoints = 0;
      let riskWeighted = 0;
      projections.forEach((p, index) => {
        const weight = this.horizonDecay ** index;
        weightedPoints += p.expectedPoints * weight;
        riskWeighted += p.expectedPoints * (1 - p.risk * this.riskPenalty) * weight;
      });
      return { playerId: player.id, gameweeks: projections, weightedPoints, riskAdjustedPoints: riskWeighted };
    });
  }
}
