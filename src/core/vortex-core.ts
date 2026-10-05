import type { RuntimeConfig } from "../config/runtime.js";
import type { AgentRunResult, AgentTask, ProviderName } from "./types.js";
import { TaskOrchestrator } from "./orchestrator.js";
import { ProviderPool } from "./provider-pool.js";
import { ProviderRouter } from "./provider-router.js";
import { TaskPlanner } from "./task-planner.js";
import { createProvider } from "../providers/factory.js";
import type { ModelProvider } from "../providers/model-provider.js";
import { CrossModelReviewer } from "../verification/cross-model-reviewer.js";

function providerConfigured(name: ProviderName, config: RuntimeConfig): boolean {
  return name === "openai"
    ? Boolean(config.openai.apiKey)
    : Boolean(config.anthropic.apiKey);
}

function buildPrimaryProviders(config: RuntimeConfig): ModelProvider[] {
  const providers: ModelProvider[] = [];

  if (providerConfigured("openai", config)) {
    providers.push(createProvider("openai", "primary", config));
  }
  if (providerConfigured("anthropic", config)) {
    providers.push(createProvider("anthropic", "primary", config));
  }

  if (providers.length === 0) {
    throw new Error(
      "Vortex AI requires at least one configured provider: OPENAI_API_KEY or ANTHROPIC_API_KEY.",
    );
  }

  return providers;
}

export class VortexCore {
  public constructor(private readonly orchestrator: TaskOrchestrator) {}

  public run(task: AgentTask): Promise<AgentRunResult> {
    return this.orchestrator.run(task);
  }
}

export function createVortexCore(config: RuntimeConfig): VortexCore {
  const pool = new ProviderPool(buildPrimaryProviders(config));
  const router = new ProviderRouter(pool);
  const planner = new TaskPlanner(config.primaryProvider);

  const reviewer = config.enableCrossModelReview
    ? (() => {
        if (!providerConfigured(config.reviewProvider, config)) {
          throw new Error(
            `Cross-model review is enabled but ${config.reviewProvider} has no API key configured.`,
          );
        }
        return new CrossModelReviewer(
          createProvider(config.reviewProvider, "review", config),
          config.minReviewScore,
        );
      })()
    : undefined;

  return new VortexCore(new TaskOrchestrator(router, reviewer, planner));
}
