import type { MemoryScope } from "../memory/types.js";
import type { AnyToolDefinition, ToolResult } from "../tools/types.js";

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
  tools: readonly AnyToolDefinition[];
  history: readonly AgentHistoryEntry[];
}

export interface AgentBrain {
  next(input: AgentBrainInput): Promise<AgentAction>;
}

export interface AgentMemoryContext {
  tenantId: string;
  namespace: string;
  projectId?: string;
  conversationId?: string;
  fileId?: string;
  scopes?: readonly MemoryScope[];
  limit?: number;
  maxCharacters?: number;
}

export interface AgentRunInput {
  objective: string;
  context?: Readonly<Record<string, unknown>>;
  taskId?: string;
  memory?: AgentMemoryContext;
}

export interface AgentContextEnricher {
  enrich(
    definition: AgentDefinition,
    input: AgentRunInput,
    baseContext: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>>;
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
