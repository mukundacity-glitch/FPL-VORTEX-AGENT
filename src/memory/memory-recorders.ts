import type { AgentExecutionResult } from "../agents/types.js";
import type { VortexMemory } from "./vortex-memory.js";

export interface ConversationTurnInput {
  tenantId: string;
  namespace: string;
  conversationId: string;
  projectId?: string;
  userMessage: string;
  assistantMessage: string;
  source?: string;
}

export interface AgentExperienceInput {
  tenantId: string;
  namespace: string;
  agentId: string;
  objective: string;
  result: AgentExecutionResult;
  projectId?: string;
  source?: string;
  importance?: number;
}

export class ConversationMemoryRecorder {
  public constructor(private readonly memory: VortexMemory) {}

  public async recordTurn(input: ConversationTurnInput): Promise<string[]> {
    const ids: string[] = [];
    const common = {
      tenantId: input.tenantId,
      namespace: input.namespace,
      scope: "conversation" as const,
      conversationId: input.conversationId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.source ? { source: input.source } : {}),
    };

    if (input.userMessage.trim()) {
      const user = await this.memory.remember({
        ...common,
        content: input.userMessage,
        tags: ["conversation", "user"],
        importance: 0.55,
        metadata: { role: "user" },
      });
      ids.push(user.id);
    }

    if (input.assistantMessage.trim()) {
      const assistant = await this.memory.remember({
        ...common,
        content: input.assistantMessage,
        tags: ["conversation", "assistant"],
        importance: 0.45,
        metadata: { role: "assistant" },
      });
      ids.push(assistant.id);
    }
    return ids;
  }
}

export class AgentExperienceRecorder {
  public constructor(private readonly memory: VortexMemory) {}

  public async recordSuccess(input: AgentExperienceInput): Promise<string | undefined> {
    if (input.result.status !== "success" || !input.result.answer?.trim()) return undefined;
    const toolNames = [...new Set(input.result.steps.map((step) => step.tool))];
    const record = await this.memory.remember({
      tenantId: input.tenantId,
      namespace: input.namespace,
      scope: "agent",
      agentId: input.agentId,
      content: [
        `Objective: ${input.objective}`,
        `Successful answer: ${input.result.answer}`,
      ].join("\n\n"),
      tags: ["agent-experience", "success", ...toolNames.map((tool) => `tool:${tool}`)],
      importance: input.importance ?? 0.6,
      source: input.source ?? "agent-experience",
      metadata: {
        tools: toolNames,
        stepCount: input.result.steps.length,
      },
      ...(input.projectId ? { projectId: input.projectId } : {}),
    });
    return record.id;
  }
}
