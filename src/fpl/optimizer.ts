export interface Projection {
  id: number;
  name: string;
  position: number;
  team: number;
  price: number;
  points: number[];
  availability: number;
}
function validate(players: Projection[], horizon: number): void {
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 8)
    throw new Error("Horizon must be 1 to 8 gameweeks.");
  if (new Set(players.map((p) => p.id)).size !== players.length)
    throw new Error("Duplicate player IDs.");
  for (const p of players)
    if (
      !Number.isSafeInteger(p.id) ||
      !p.name ||
      ![1, 2, 3, 4].includes(p.position) ||
      !Number.isFinite(p.price) ||
      p.price < 0 ||
      !Number.isFinite(p.availability) ||
      p.availability < 0 ||
      p.availability > 1 ||
      p.points.length < horizon ||
      p.points.some((v) => !Number.isFinite(v) || v < 0)
    )
      throw new Error("Invalid player projection.");
}
export function optimizeLineup(players: Projection[]) {
  validate(players, 1);
  const counts = [0, 2, 5, 5, 3];
  if (
    players.length !== 15 ||
    counts.some(
      (n, pos) =>
        pos > 0 && players.filter((p) => p.position === pos).length !== n,
    )
  )
    throw new Error("Squad must contain 2 GK, 5 DEF, 5 MID, 3 FWD.");
  for (const team of new Set(players.map((p) => p.team)))
    if (players.filter((p) => p.team === team).length > 3)
      throw new Error("Maximum three players per club.");
  const expected = (p: Projection) => (p.points[0] ?? 0) * p.availability;
  const groups = [1, 2, 3, 4].map((pos) =>
    players
      .filter((p) => p.position === pos)
      .sort((a, b) => expected(b) - expected(a)),
  );
  let best: Projection[] = [];
  let score = -1;
  for (let d = 3; d <= 5; d++)
    for (let m = 2; m <= 5; m++) {
      const f = 10 - d - m;
      if (f < 1 || f > 3) continue;
      const lineup = [
        ...groups[0]!.slice(0, 1),
        ...groups[1]!.slice(0, d),
        ...groups[2]!.slice(0, m),
        ...groups[3]!.slice(0, f),
      ];
      const total = lineup.reduce((n, p) => n + expected(p), 0);
      if (total > score) {
        best = lineup;
        score = total;
      }
    }
  const captain = [...best].sort((a, b) => expected(b) - expected(a))[0]!;
  const vice = [...best]
    .filter((p) => p.id !== captain.id)
    .sort((a, b) => expected(b) - expected(a))[0]!;
  return {
    lineup: best.map((p) => p.id),
    bench: players
      .filter((p) => !best.includes(p))
      .sort((a, b) => expected(b) - expected(a))
      .map((p) => p.id),
    captain: captain.id,
    viceCaptain: vice.id,
    expectedPoints: score + expected(captain),
    assumptions: [
      "Supplied points are conditional on availability; availability is applied once.",
      "No automatic substitutions or captain fallback are simulated.",
    ],
  };
}
export function simulate(
  players: Projection[],
  horizon = 1,
  iterations = 2000,
  seed = 42,
) {
  validate(players, horizon);
  if (!Number.isInteger(iterations) || iterations < 100 || iterations > 10000)
    throw new Error("Simulation iterations must be 100 to 10000.");
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return (state + 0.5) / 4294967296;
  };
  const results = players.map((player) => {
    const totals: number[] = [];
    for (let i = 0; i < iterations; i++) {
      let total = 0;
      for (const mean of player.points.slice(0, horizon)) {
        if (random() > player.availability) continue;
        const normal =
          Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
        total += Math.max(0, mean + normal * Math.sqrt(mean + 1));
      }
      totals.push(total);
    }
    totals.sort((a, b) => a - b);
    return {
      id: player.id,
      name: player.name,
      mean: totals.reduce((a, b) => a + b, 0) / iterations,
      p10: totals[Math.floor(iterations * 0.1)],
      p90: totals[Math.floor(iterations * 0.9)],
    };
  });
  return {
    horizon,
    iterations,
    seed,
    results,
    assumptions: [
      "Illustrative independent nonnegative normal points model; not a calibrated FPL forecast.",
      "User-supplied projections and availability; no player/fixture correlations.",
    ],
  };
}
export function bestSingleTransfer(
  squad: Projection[],
  candidates: Projection[],
  bank: number,
  salePrices: Record<number, number>,
  freeTransfers = 1,
  horizon = 1,
) {
  optimizeLineup(squad);
  validate(
    [...squad, ...candidates.filter((c) => !squad.some((p) => p.id === c.id))],
    horizon,
  );
  if (
    !Number.isFinite(bank) ||
    bank < 0 ||
    !Number.isInteger(freeTransfers) ||
    freeTransfers < 0
  )
    throw new Error("Invalid transfer budget.");
  for (const p of squad)
    if (!Number.isFinite(salePrices[p.id]) || salePrices[p.id]! < 0)
      throw new Error("Actual selling prices are required.");
  const expected = (p: Projection) =>
    p.points.slice(0, horizon).reduce((a, b) => a + b, 0) * p.availability;
  let best: {
    out: number;
    in: number;
    netGain: number;
    remainingBank: number;
  } | null = null;
  for (const out of squad)
    for (const incoming of candidates) {
      if (
        incoming.position !== out.position ||
        squad.some((p) => p.id === incoming.id)
      )
        continue;
      const cash = bank + salePrices[out.id]! - incoming.price;
      if (
        cash < 0 ||
        squad.filter((p) => p.id !== out.id && p.team === incoming.team)
          .length >= 3
      )
        continue;
      const gain = expected(incoming) - expected(out) - (freeTransfers ? 0 : 4);
      if (gain > 0 && (!best || gain > best.netGain))
        best = {
          out: out.id,
          in: incoming.id,
          netGain: gain,
          remainingBank: cash,
        };
    }
  return {
    transfer: best,
    assumptions: [
      "One-transfer exhaustive search on squad totals, not a full multiweek lineup/chip optimizer.",
      "Uses actual selling prices and a four-point hit when no free transfer remains.",
    ],
  };
}
