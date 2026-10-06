import type { VortexMemory } from "../memory/vortex-memory.js";
import { MemoryContextEnricher } from "../memory/memory-context-enricher.js";
import type { ModelProvider } from "../providers/model-provider.js";
import { PermissionPolicyEngine, type PermissionPolicy } from "../tools/permission-policy.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import type { AnyToolDefinition, ApprovalHandler } from "../tools/types.js";
import { ModelAgentBrain } from "./model-agent-brain.js";
import { ParallelAgentRunner } from "./parallel-agent-runner.js";
import { ToolAgent } from "./tool-agent.js";
import type { AgentDefinition } from "./types.js";

export interface VortexAgentRuntimeOptions {
  permissionPolicy?: PermissionPolicy;
  approvalHandler?: ApprovalHandler;
  maxConcurrency?: number;
  memory?: VortexMemory;
}

export class VortexAgentRuntime {
  public readonly registry: ToolRegistry;
  public readonly parallel: ParallelAgentRunner;
  private readonly memoryEnricher?: MemoryContextEnricher;

  public constructor(options: VortexAgentRuntimeOptions = {}) {
    this.registry = new ToolRegistry(
      new PermissionPolicyEngine(options.permissionPolicy),
      options.approvalHandler,
    );
    this.parallel = new ParallelAgentRunner(options.maxConcurrency ?? 4);
    this.memoryEnricher = options.memory
      ? new MemoryContextEnricher(options.memory)
      : undefined;
  }

  public registerTool(tool: AnyToolDefinition): void {
    this.registry.register(tool);
  }

  public registerTools(tools: readonly AnyToolDefinition[]): void {
    this.registry.registerMany(tools);
  }

  public createAgent(definition: AgentDefinition, provider: ModelProvider): ToolAgent {
    return new ToolAgent(
      definition,
      new ModelAgentBrain(provider),
      this.registry,
      this.memoryEnricher,
    );
  }
}
