import type { ChipInventory, ChipName, FplSeasonRules } from "./types.js";

const oneEach: Readonly<Record<ChipName, number>> = {
  wildcard: 1,
  free_hit: 1,
  triple_captain: 1,
  bench_boost: 1,
};

export const FPL_RULES_2026_27: FplSeasonRules = {
  season: "2026/27",
  squadBudget: 100,
  squadSize: 15,
  maxPlayersPerClub: 3,
  maxRolledFreeTransfers: 5,
  firstHalfLastGameweek: 19,
  chipsPerHalf: oneEach,
  oneChipPerGameweek: true,
  freeHitUnavailableGameweek1: true,
  freeHitGw19Gw20Restriction: true,
  defensiveContributionThreshold: { 1: null, 2: 10, 3: 12, 4: 12 },
};

export function freshChipInventory(rules: FplSeasonRules = FPL_RULES_2026_27): ChipInventory {
  return { firstHalf: { ...rules.chipsPerHalf }, secondHalf: { ...rules.chipsPerHalf } };
}

export function chipRemaining(
  inventory: ChipInventory,
  chip: ChipName,
  gameweek: number,
  rules: FplSeasonRules = FPL_RULES_2026_27,
): number {
  return gameweek <= rules.firstHalfLastGameweek
    ? inventory.firstHalf[chip]
    : inventory.secondHalf[chip];
}
