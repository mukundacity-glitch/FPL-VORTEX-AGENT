import type { TaskPlan } from "./types.js";
import { ProviderPool } from "./provider-pool.js";
import type { ModelProvider } from "../providers/model-provider.js";

export class ProviderRouter {
  public constructor(private readonly pool: ProviderPool) {}

  public candidates(plan: TaskPlan): ModelProvider[] {
    const ordered = [plan.preferredProvider, plan.fallbackProvider];
    const result: ModelProvider[] = [];

    for (const name of ordered) {
      if (!this.pool.has(name)) continue;
      const provider = this.pool.get(name);
      if (!result.some((candidate) => candidate.name === provider.name)) {
        result.push(provider);
      }
    }

    for (const name of this.pool.names()) {
      if (!result.some((candidate) => candidate.name === name)) {
        result.push(this.pool.get(name));
      }
    }

    if (result.length === 0) {
      throw new Error("No model providers are available for this task.");
    }

    return result;
  }
}
