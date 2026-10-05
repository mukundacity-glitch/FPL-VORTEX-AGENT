import { z } from "zod";
const player = z
  .object({
    id: z.number().int(),
    web_name: z.string(),
    team: z.number().int(),
    element_type: z.number().int(),
    now_cost: z.number(),
    status: z.string(),
    news: z.string(),
    form: z.string(),
    ep_next: z.string().nullable(),
    minutes: z.number(),
    chance_of_playing_next_round: z.number().nullable(),
  })
  .passthrough();
const bootstrap = z.object({
  elements: z.array(player),
  teams: z.array(z.object({ id: z.number(), name: z.string() })),
  events: z.array(
    z.object({
      id: z.number(),
      is_next: z.boolean(),
      is_current: z.boolean(),
      deadline_time: z.string(),
    }),
  ),
});
const fixtures = z.array(
  z.object({
    id: z.number(),
    event: z.number().nullable(),
    team_h: z.number(),
    team_a: z.number(),
    team_h_difficulty: z.number(),
    team_a_difficulty: z.number(),
    finished: z.boolean(),
    kickoff_time: z.string().nullable(),
  }),
);
export type FplPlayer = z.infer<typeof player>;
export class FplClient {
  private cached: { at: number; data: unknown } | undefined;
  constructor(private readonly base = "https://fantasy.premierleague.com/api") {
    const url = new URL(base);
    if (url.protocol !== "https:") throw new Error("FPL URL requires HTTPS.");
  }
  private async json(path: string): Promise<unknown> {
    const response = await fetch(`${this.base.replace(/\/$/, "")}/${path}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(`Official FPL API returned ${response.status}.`);
    const text = await response.text();
    if (text.length > 10000000) throw new Error("FPL response too large.");
    return JSON.parse(text);
  }
  async snapshot(entry?: number) {
    let data = this.cached?.data as
      | {
          players: FplPlayer[];
          teams: unknown[];
          events: {
            id: number;
            is_next: boolean;
            is_current: boolean;
            deadline_time: string;
          }[];
          fixtures: z.infer<typeof fixtures>;
        }
      | undefined;
    if (!data || Date.now() - (this.cached?.at ?? 0) > 300000) {
      const [b, f] = await Promise.all([
        this.json("bootstrap-static/"),
        this.json("fixtures/"),
      ]);
      const parsed = bootstrap.parse(b);
      data = {
        players: parsed.elements,
        teams: parsed.teams,
        events: parsed.events,
        fixtures: fixtures.parse(f),
      };
      this.cached = { at: Date.now(), data };
    }
    const gw = data.events.find((e) => e.is_next)?.id;
    if (!gw)
      throw new Error(
        "Official FPL data has no next gameweek. Off-season projections unavailable.",
      );
    let picks: number[] = [];
    if (entry !== undefined) {
      if (!Number.isSafeInteger(entry) || entry < 1)
        throw new Error("Invalid FPL entry ID.");
      const current = data.events.find((e) => e.is_current)?.id;
      if (!current) throw new Error("Current gameweek unavailable.");
      const result = z
        .object({ picks: z.array(z.object({ element: z.number().int() })) })
        .parse(await this.json(`entry/${entry}/event/${current}/picks/`));
      picks = result.picks.map((p) => p.element);
    }
    const picked = new Set(picks);
    const ranked = [...data.players].sort(
      (a, b) => Number(b.ep_next ?? 0) - Number(a.ep_next ?? 0),
    );
    const players = ranked
      .filter((p, i) => i < 80 || picked.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.web_name,
        team: p.team,
        position: p.element_type,
        price: p.now_cost / 10,
        status: p.status,
        news: p.news,
        form: p.form,
        expectedNext: p.ep_next,
        seasonMinutes: p.minutes,
        availability: p.chance_of_playing_next_round,
      }));
    return {
      source: this.base,
      observedAt: new Date(this.cached?.at ?? Date.now()).toISOString(),
      nextGameweek: gw,
      deadline: data.events.find((e) => e.id === gw)?.deadline_time,
      teams: data.teams,
      players,
      picks,
      fixtures: data.fixtures.filter(
        (f) => f.event !== null && f.event >= gw && f.event < gw + 8,
      ),
      limitations: [
        "ep_next is the official next-event estimate, not an eight-week projection.",
        "Public picks reflect the latest published gameweek, not private pending transfers.",
        "No live press-conference, expected-minutes, or price-prediction feed is configured.",
      ],
    };
  }
}
