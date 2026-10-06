import assert from "node:assert/strict";
import test from "node:test";
import { ProjectionBacktester } from "./backtester.js";
import { ChipPlanner } from "./chip-planner.js";
import { FplDataValidator } from "./data-validator.js";
import { FplVortexIntelligence } from "./fpl-intelligence.js";
import { LineupOptimizer } from "./lineup-optimizer.js";
import { FplProjectionEngine } from "./projection-engine.js";
import { freshChipInventory } from "./rules.js";
import { FplMonteCarloSimulator } from "./simulator.js";
import { SquadOptimizer } from "./squad-optimizer.js";
import { TransferOptimizer } from "./transfer-optimizer.js";
import type { FplDataSnapshot, FplPlayer, FplPosition, SquadState } from "./types.js";

function player(id: number, position: FplPosition, teamId: number, boost = 0): FplPlayer {
  return {
    id, webName: `P${id}`, teamId, position, price: position === 1 ? 4.5 : position === 2 ? 5 : position === 3 ? 6.5 : 7,
    totalPoints: 24 + boost, minutes: 450, starts: 5, form: 4.2 + boost / 20, pointsPerGame: 4.8 + boost / 25,
    selectedByPercent: 10 + id / 2, chanceOfPlayingNextRound: 100, status: "a", transfersInEvent: 1000 + boost * 50,
    transfersOutEvent: 500, expectedGoals: position >= 3 ? 1.8 + boost / 20 : 0.3, expectedAssists: 1.0 + boost / 30,
    expectedGoalInvolvements: position >= 3 ? 2.8 + boost / 15 : 0.8 + boost / 30, expectedGoalsConceded: 4.5,
    cleanSheets: 2, saves: position === 1 ? 18 : 0, bonus: 3 + boost / 10, defensiveContribution: position === 1 ? 0 : 5 + boost / 10,
    epNext: 4.5 + boost / 15, news: "",
  };
}

function snapshot(): FplDataSnapshot {
  const players: FplPlayer[] = [];
  let id = 1;
  const add = (position: FplPosition, count: number) => { for (let i = 0; i < count; i += 1) { players.push(player(id, position, ((id - 1) % 5) + 1, id > 15 ? 18 : i)); id += 1; } };
  add(1, 3); add(2, 7); add(3, 7); add(4, 5);
  const teams = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, name: `Team ${index + 1}`, shortName: `T${index + 1}`, strength: 3 }));
  const fixtures = [5, 6, 7].flatMap((gw, offset) => [
    { id: gw * 10 + 1, event: gw, teamHome: 1, teamAway: 2, difficultyHome: 2, difficultyAway: 4, kickoffTime: null, started: false, finished: false },
    { id: gw * 10 + 2, event: gw, teamHome: 3, teamAway: 4, difficultyHome: 3, difficultyAway: 3, kickoffTime: null, started: false, finished: false },
    { id: gw * 10 + 3, event: gw, teamHome: 5, teamAway: 6, difficultyHome: 4 - Math.min(offset, 1), difficultyAway: 2 + Math.min(offset, 1), kickoffTime: null, started: false, finished: false },
  ]);
  return {
    fetchedAt: "2026-10-05T20:00:00Z", players, teams, fixtures,
    gameweeks: [
      { id: 4, name: "GW4", deadlineTime: "", isCurrent: true, isNext: false, finished: true },
      { id: 5, name: "GW5", deadlineTime: "", isCurrent: false, isNext: true, finished: false },
      { id: 6, name: "GW6", deadlineTime: "", isCurrent: false, isNext: false, finished: false },
      { id: 7, name: "GW7", deadlineTime: "", isCurrent: false, isNext: false, finished: false },
    ],
  };
}

function squadState(data: FplDataSnapshot): SquadState {
  const choose = (position: FplPosition, count: number) => data.players.filter((p) => p.position === position).slice(0, count).map((p) => p.id);
  return { playerIds: [...choose(1, 2), ...choose(2, 5), ...choose(3, 5), ...choose(4, 3)], bank: 8, freeTransfers: 1, chips: freshChipInventory() };
}

test("snapshot validator accepts coherent synthetic FPL data", () => {
  const result = new FplDataValidator().validate(snapshot());
  assert.deepEqual(result.errors, []);
});

test("projection and lineup engines create a legal starting XI", () => {
  const data = snapshot(); const squad = squadState(data); const projections = new FplProjectionEngine().projectHorizon(data, [5, 6, 7]);
  const lineup = new LineupOptimizer().optimize(data, squad.playerIds, projections, 5);
  assert.equal(lineup.starters.length, 11); assert.equal(lineup.bench.length, 4);
  const playerMap = new Map(data.players.map((p) => [p.id, p]));
  const counts = [1, 2, 3, 4].map((position) => lineup.starters.filter((id) => playerMap.get(id)?.position === position).length);
  assert.equal(counts[0], 1); assert.ok(counts[1]! >= 3); assert.ok(counts[2]! >= 2); assert.ok(counts[3]! >= 1);
});

test("transfer and squad optimizers respect structure and budget", () => {
  const data = snapshot(); const squad = squadState(data); const projections = new FplProjectionEngine().projectHorizon(data, [5, 6, 7]);
  const plans = new TransferOptimizer().optimize(data, squad, projections, 2);
  assert.ok(plans.length > 0); assert.equal(plans[0]!.resultingPlayerIds.length, 15); assert.ok(plans[0]!.resultingBank >= 0);
  const optimized = new SquadOptimizer(undefined, { candidatePoolPerPosition: 10, beamWidth: 150 }).optimize(data, projections, 100);
  assert.ok(optimized); assert.equal(optimized!.playerIds.length, 15); assert.ok(optimized!.cost <= 100);
});

test("Monte Carlo simulation is deterministic for a fixed seed", () => {
  const data = snapshot(); const projection = new FplProjectionEngine().projectPlayer(data, data.players[0]!, 5);
  const simulator = new FplMonteCarloSimulator(); const a = simulator.simulate(projection, 1000, 42); const b = simulator.simulate(projection, 1000, 42);
  assert.equal(a.mean, b.mean); assert.equal(a.p90, b.p90);
});

test("chip planner values triple captain and bench boost", () => {
  const data = snapshot(); const squad = squadState(data); const projections = new FplProjectionEngine().projectHorizon(data, [5]);
  const lineup = new LineupOptimizer().optimize(data, squad.playerIds, projections, 5);
  const plan = new ChipPlanner().plan({ squad, gameweeks: [5], lineups: [lineup], projections });
  assert.ok(plan.candidates.some((candidate) => candidate.chip === "triple_captain"));
  assert.ok(plan.candidates.some((candidate) => candidate.chip === "bench_boost"));
});

test("backtester reports zero error for perfect projections", () => {
  const result = new ProjectionBacktester().evaluate([{ projected: 5, actual: 5 }, { projected: 8, actual: 8 }]);
  assert.equal(result.mae, 0); assert.equal(result.rmse, 0); assert.equal(result.bias, 0);
});

test("FPL Vortex intelligence produces an end-to-end report without live network", async () => {
  const data = snapshot(); const squad = squadState(data);
  const report = await new FplVortexIntelligence().analyze(squad, { snapshot: data, horizon: 3, maxTransfers: 2 });
  assert.equal(report.currentGameweek, 5); assert.equal(report.horizon.length, 3); assert.equal(report.lineup.starters.length, 11);
  assert.ok(report.captainCandidates.length >= 2); assert.ok(report.projections.length === 15);
});
