import type { ToolDefinition, ToolResult } from "../tools/types.js";

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  allowedTools: readonly string[];
  maxToolCalls: number;
}

export interface AgentHistoryEntry {
  kind: "tool" | "observation";
  tool?: string;
  input?: unknown;
  result?: ToolResult;
}

export type AgentAction =
  | { type: "tool"; tool: string; input: unknown }
  | { type: "final"; answer: string };

export interface AgentBrainInput {
  definition: AgentDefinition;
  objective: string;
  context: Readonly<Record<string, unknown>>;
  tools: readonly ToolDefinition[];
  history: readonly AgentHistoryEntry[];
}

export interface AgentBrain {
  next(input: AgentBrainInput): Promise<AgentAction>;
}

export interface AgentRunInput {
  objective: string;
  context?: Readonly<Record<string, unknown>>;
  taskId?: string;
}

export interface AgentStep {
  tool: string;
  input: unknown;
  result: ToolResult;
}

export interface AgentExecutionResult {
  agentId: string;
  status: "success" | "failed";
  answer?: string;
  steps: AgentStep[];
  error?: string;
}

export interface AgentExecutor {
  run(input: AgentRunInput): Promise<AgentExecutionResult>;
}
