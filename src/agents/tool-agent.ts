import { randomUUID } from "node:crypto";
import type { ToolRegistry } from "../tools/tool-registry.js";
import type {
  AgentBrain,
  AgentContextEnricher,
  AgentDefinition,
  AgentExecutionResult,
  AgentHistoryEntry,
  AgentRunInput,
  AgentStep,
} from "./types.js";

export class ToolAgent {
  public constructor(
    private readonly definition: AgentDefinition,
    private readonly brain: AgentBrain,
    private readonly registry: ToolRegistry,
    private readonly contextEnricher?: AgentContextEnricher,
  ) {}

  public async run(input: AgentRunInput): Promise<AgentExecutionResult> {
    const taskId = input.taskId ?? randomUUID();
    const baseContext = input.context ?? {};
    let context: Readonly<Record<string, unknown>> = baseContext;
    if (this.contextEnricher) {
      try {
        context = await this.contextEnricher.enrich(this.definition, input, baseContext);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          agentId: this.definition.id,
          status: "failed",
          steps: [],
          error: `Context enrichment failed: ${message}`,
        };
      }
    }

    const allowed = new Set(this.definition.allowedTools);
    const tools = this.registry.list().filter((tool) => allowed.has(tool.name));
    const history: AgentHistoryEntry[] = [];
    const steps: AgentStep[] = [];

    for (let toolCalls = 0; toolCalls <= this.definition.maxToolCalls; toolCalls += 1) {
      let action;
      try {
        action = await this.brain.next({
          definition: this.definition,
          objective: input.objective,
          context,
          tools,
          history,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { agentId: this.definition.id, status: "failed", steps, error: message };
      }

      if (action.type === "final") {
        return {
          agentId: this.definition.id,
          status: "success",
          answer: action.answer,
          steps,
        };
      }

      if (!allowed.has(action.tool)) {
        return {
          agentId: this.definition.id,
          status: "failed",
          steps,
          error: `Agent attempted disallowed tool: ${action.tool}`,
        };
      }

      if (toolCalls >= this.definition.maxToolCalls) {
        return {
          agentId: this.definition.id,
          status: "failed",
          steps,
          error: `Agent exceeded maxToolCalls=${this.definition.maxToolCalls}.`,
        };
      }

      const result = await this.registry.execute(action.tool, action.input, {
        taskId,
        agentId: this.definition.id,
      });
      const step = { tool: action.tool, input: action.input, result };
      steps.push(step);
      history.push({ kind: "tool", tool: action.tool, input: action.input });
      history.push({ kind: "observation", tool: action.tool, result });
    }

    return {
      agentId: this.definition.id,
      status: "failed",
      steps,
      error: "Agent loop ended without a final answer.",
    };
  }
}
