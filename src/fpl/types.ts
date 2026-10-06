export type FplPosition = 1 | 2 | 3 | 4;
export type ChipName = "wildcard" | "free_hit" | "triple_captain" | "bench_boost";

export interface FplTeam {
  id: number;
  name: string;
  shortName: string;
  strength: number;
}

export interface FplPlayer {
  id: number;
  webName: string;
  teamId: number;
  position: FplPosition;
  price: number;
  totalPoints: number;
  minutes: number;
  starts: number;
  form: number;
  pointsPerGame: number;
  selectedByPercent: number;
  chanceOfPlayingNextRound: number | null;
  status: string;
  transfersInEvent: number;
  transfersOutEvent: number;
  expectedGoals: number;
  expectedAssists: number;
  expectedGoalInvolvements: number;
  expectedGoalsConceded: number;
  cleanSheets: number;
  saves: number;
  bonus: number;
  defensiveContribution: number;
  epNext: number;
  news: string;
}

export interface FplFixture {
  id: number;
  event: number | null;
  teamHome: number;
  teamAway: number;
  difficultyHome: number;
  difficultyAway: number;
  kickoffTime: string | null;
  started: boolean;
  finished: boolean;
}

export interface GameweekInfo {
  id: number;
  name: string;
  deadlineTime: string;
  isCurrent: boolean;
  isNext: boolean;
  finished: boolean;
}

export interface FplDataSnapshot {
  fetchedAt: string;
  players: FplPlayer[];
  teams: FplTeam[];
  fixtures: FplFixture[];
  gameweeks: GameweekInfo[];
}

export interface FplSeasonRules {
  season: string;
  squadBudget: number;
  squadSize: number;
  maxPlayersPerClub: number;
  maxRolledFreeTransfers: number;
  firstHalfLastGameweek: number;
  chipsPerHalf: Readonly<Record<ChipName, number>>;
  oneChipPerGameweek: boolean;
  freeHitUnavailableGameweek1: boolean;
  freeHitGw19Gw20Restriction: boolean;
  defensiveContributionThreshold: Readonly<Record<FplPosition, number | null>>;
}

export interface ChipInventory {
  firstHalf: Readonly<Record<ChipName, number>>;
  secondHalf: Readonly<Record<ChipName, number>>;
}

export interface SquadState {
  playerIds: readonly number[];
  bank: number;
  freeTransfers: number;
  chips: ChipInventory;
  /** Optional exact selling prices in £m. When omitted, current market price is used as a conservative approximation. */
  sellingPrices?: Readonly<Record<number, number>>;
}

export interface ProjectionComponents {
  appearance: number;
  attack: number;
  cleanSheet: number;
  saves: number;
  bonus: number;
  defensiveContribution: number;
  fixtureAdjustment: number;
}

export interface PlayerProjection {
  playerId: number;
  gameweek: number;
  fixtureIds: number[];
  expectedMinutes: number;
  expectedPoints: number;
  floor: number;
  ceiling: number;
  standardDeviation: number;
  risk: number;
  components: ProjectionComponents;
}

export interface HorizonProjection {
  playerId: number;
  gameweeks: PlayerProjection[];
  weightedPoints: number;
  riskAdjustedPoints: number;
}

export interface LineupPlan {
  gameweek: number;
  starters: number[];
  bench: number[];
  captainId: number;
  viceCaptainId: number;
  expectedPoints: number;
}

export interface CaptainCandidate {
  playerId: number;
  expectedPoints: number;
  ceiling: number;
  risk: number;
  captainScore: number;
}

export interface TransferMove {
  outPlayerId: number;
  inPlayerId: number;
}

export interface TransferPlan {
  moves: TransferMove[];
  cost: number;
  pointsHit: number;
  expectedGain: number;
  riskAdjustedGain: number;
  resultingBank: number;
  resultingPlayerIds: number[];
}

export interface ChipCandidate {
  chip: ChipName;
  gameweek: number;
  expectedGain: number;
  rationale: string;
}

export interface ChipPlan {
  recommended: ChipCandidate | null;
  candidates: ChipCandidate[];
}

export interface SimulationSummary {
  playerId: number;
  gameweek: number;
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  haulProbability: number;
  blankProbability: number;
}

export interface PriceMovementSignal {
  playerId: number;
  priceChange: number;
  netTransfers: number;
  direction: "rise" | "fall" | "flat";
  pressure: number;
}

export interface BacktestResult {
  observations: number;
  mae: number;
  rmse: number;
  bias: number;
}

export interface FplAnalysisReport {
  generatedAt: string;
  currentGameweek: number;
  horizon: number[];
  lineup: LineupPlan;
  captainCandidates: CaptainCandidate[];
  transferPlans: TransferPlan[];
  chipPlan: ChipPlan;
  projections: HorizonProjection[];
  warnings: string[];
}
