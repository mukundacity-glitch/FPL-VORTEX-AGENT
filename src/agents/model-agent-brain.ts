import type { ModelProvider } from "../providers/model-provider.js";
import type { AgentAction, AgentBrain, AgentBrainInput } from "./types.js";

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "").trim();
}

function parseAction(text: string): AgentAction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch (error) {
    throw new Error("Agent brain returned invalid JSON action.", { cause: error });
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Agent action must be a JSON object.");
  }
  const value = parsed as Record<string, unknown>;
  if (value.type === "final") {
    if (typeof value.answer !== "string" || !value.answer.trim()) {
      throw new Error("Final agent action requires a non-empty answer.");
    }
    return { type: "final", answer: value.answer };
  }
  if (value.type === "tool") {
    if (typeof value.tool !== "string" || !value.tool.trim()) {
      throw new Error("Tool agent action requires a tool name.");
    }
    return { type: "tool", tool: value.tool, input: value.input ?? {} };
  }
  throw new Error("Agent action type must be tool or final.");
}

export class ModelAgentBrain implements AgentBrain {
  public constructor(private readonly provider: ModelProvider) {}

  public async next(input: AgentBrainInput): Promise<AgentAction> {
    const tools = input.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      permissions: tool.permissions,
    }));

    const response = await this.provider.generate({
      systemPrompt: [
        input.definition.systemPrompt,
        "You are operating inside the Vortex tool loop.",
        "Choose exactly one next action.",
        "Return ONLY JSON, with no markdown or commentary.",
        'Tool action: {"type":"tool","tool":"tool.name","input":{}}',
        'Final action: {"type":"final","answer":"..."}',
        "Never call a tool outside the supplied list.",
        "Use observations from previous tool calls before deciding the next step.",
      ].join("\n"),
      userPrompt: [
        `AGENT: ${input.definition.name}`,
        `OBJECTIVE: ${input.objective}`,
        `CONTEXT: ${JSON.stringify(input.context)}`,
        `TOOLS: ${JSON.stringify(tools)}`,
        `HISTORY: ${JSON.stringify(input.history)}`,
      ].join("\n\n"),
      maxOutputTokens: 1600,
      temperature: 0,
    });

    return parseAction(response.text);
  }
}
