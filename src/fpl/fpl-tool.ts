import type { ToolDefinition } from "../tools/types.js";
import type { FplVortexIntelligence, FplAnalyzeOptions } from "./fpl-intelligence.js";
import type { ChipInventory, SquadState } from "./types.js";

interface ToolInput { squad: SquadState; options?: FplAnalyzeOptions; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function validateInventory(value: unknown): ChipInventory {
  if (!isRecord(value) || !isRecord(value.firstHalf) || !isRecord(value.secondHalf)) throw new Error("chips.firstHalf and chips.secondHalf are required.");
  const parse = (part: Record<string, unknown>) => ({ wildcard: Number(part.wildcard ?? 0), free_hit: Number(part.free_hit ?? 0), triple_captain: Number(part.triple_captain ?? 0), bench_boost: Number(part.bench_boost ?? 0) });
  return { firstHalf: parse(value.firstHalf), secondHalf: parse(value.secondHalf) };
}

export function createFplAnalysisTool(intelligence: FplVortexIntelligence): ToolDefinition<ToolInput> {
  return {
    name: "fpl.analyze",
    description: "Analyze an FPL squad using live FPL data, projections, lineup, captaincy, transfers, chips and multi-Gameweek optimization.",
    permissions: ["read", "network"],
    validate(input: unknown): ToolInput {
      if (!isRecord(input) || !isRecord(input.squad)) throw new Error("squad is required.");
      const raw = input.squad;
      if (!Array.isArray(raw.playerIds) || raw.playerIds.length !== 15) throw new Error("squad.playerIds must contain exactly 15 FPL player IDs.");
      const squad: SquadState = {
        playerIds: raw.playerIds.map(Number), bank: Number(raw.bank ?? 0), freeTransfers: Number(raw.freeTransfers ?? 1), chips: validateInventory(raw.chips),
        ...(isRecord(raw.sellingPrices) ? { sellingPrices: Object.fromEntries(Object.entries(raw.sellingPrices).map(([key, value]) => [Number(key), Number(value)])) } : {}),
      };
      const options = isRecord(input.options) ? { horizon: Number(input.options.horizon ?? 6), maxTransfers: Number(input.options.maxTransfers ?? 2) } : undefined;
      return options ? { squad, options } : { squad };
    },
    async execute(input) {
      try { return { ok: true, data: await intelligence.analyze(input.squad, input.options) }; }
      catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
    },
  };
}
