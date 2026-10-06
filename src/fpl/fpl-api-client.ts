import type { FplDataSnapshot, FplFixture, FplPlayer, FplPosition, FplTeam, GameweekInfo } from "./types.js";

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected object from FPL API.");
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}
function str(value: unknown, fallback = ""): string { return typeof value === "string" ? value : fallback; }
function bool(value: unknown): boolean { return value === true; }
function nullableNum(value: unknown): number | null { return value === null || value === undefined ? null : num(value, 0); }
function position(value: unknown): FplPosition {
  const parsed = Math.round(num(value, 4));
  return parsed >= 1 && parsed <= 4 ? parsed as FplPosition : 4;
}

export class FplApiClient {
  public constructor(
    private readonly baseUrl = "https://fantasy.premierleague.com/api",
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async get(path: string): Promise<unknown> {
    const response = await this.fetchFn(`${this.baseUrl.replace(/\/$/u, "")}/${path.replace(/^\//u, "")}`, {
      headers: { Accept: "application/json", "User-Agent": "FPL-Vortex-Agent/0.5" },
    });
    if (!response.ok) throw new Error(`FPL API ${response.status} for ${path}`);
    return await response.json() as unknown;
  }

  public async snapshot(): Promise<FplDataSnapshot> {
    const [bootstrapRaw, fixturesRaw] = await Promise.all([this.get("bootstrap-static/"), this.get("fixtures/")]);
    const bootstrap = record(bootstrapRaw);
    const players = array(bootstrap.elements).map((item): FplPlayer => {
      const p = record(item);
      return {
        id: num(p.id), webName: str(p.web_name), teamId: num(p.team), position: position(p.element_type),
        price: num(p.now_cost) / 10, totalPoints: num(p.total_points), minutes: num(p.minutes), starts: num(p.starts),
        form: num(p.form), pointsPerGame: num(p.points_per_game), selectedByPercent: num(p.selected_by_percent),
        chanceOfPlayingNextRound: nullableNum(p.chance_of_playing_next_round), status: str(p.status, "a"),
        transfersInEvent: num(p.transfers_in_event), transfersOutEvent: num(p.transfers_out_event),
        expectedGoals: num(p.expected_goals), expectedAssists: num(p.expected_assists),
        expectedGoalInvolvements: num(p.expected_goal_involvements), expectedGoalsConceded: num(p.expected_goals_conceded),
        cleanSheets: num(p.clean_sheets), saves: num(p.saves), bonus: num(p.bonus),
        defensiveContribution: num(p.defensive_contribution ?? p.defensive_contributions), epNext: num(p.ep_next), news: str(p.news),
      };
    });
    const teams = array(bootstrap.teams).map((item): FplTeam => {
      const t = record(item);
      return { id: num(t.id), name: str(t.name), shortName: str(t.short_name), strength: num(t.strength, 3) };
    });
    const gameweeks = array(bootstrap.events).map((item): GameweekInfo => {
      const e = record(item);
      return { id: num(e.id), name: str(e.name), deadlineTime: str(e.deadline_time), isCurrent: bool(e.is_current), isNext: bool(e.is_next), finished: bool(e.finished) };
    });
    const fixtures = array(fixturesRaw).map((item): FplFixture => {
      const f = record(item);
      return {
        id: num(f.id), event: f.event === null ? null : num(f.event), teamHome: num(f.team_h), teamAway: num(f.team_a),
        difficultyHome: num(f.team_h_difficulty, 3), difficultyAway: num(f.team_a_difficulty, 3),
        kickoffTime: f.kickoff_time === null ? null : str(f.kickoff_time), started: bool(f.started), finished: bool(f.finished),
      };
    });
    return { fetchedAt: new Date().toISOString(), players, teams, fixtures, gameweeks };
  }

  public async elementSummary(playerId: number): Promise<unknown> { return await this.get(`element-summary/${playerId}/`); }
  public async entryPicks(entryId: number, gameweek: number): Promise<unknown> { return await this.get(`entry/${entryId}/event/${gameweek}/picks/`); }
  public async entryHistory(entryId: number): Promise<unknown> { return await this.get(`entry/${entryId}/history/`); }
}
