import type { ProviderName } from "./types.js";
import type { ModelProvider } from "../providers/model-provider.js";

export class ProviderPool {
  private readonly providers = new Map<ProviderName, ModelProvider>();

  public constructor(providers: readonly ModelProvider[]) {
    for (const provider of providers) {
      if (this.providers.has(provider.name)) {
        throw new Error(`Duplicate provider configured: ${provider.name}`);
      }
      this.providers.set(provider.name, provider);
    }

    if (this.providers.size === 0) {
      throw new Error("At least one model provider must be configured.");
    }
  }

  public has(name: ProviderName): boolean {
    return this.providers.has(name);
  }

  public get(name: ProviderName): ModelProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} is not configured.`);
    }
    return provider;
  }

  public names(): ProviderName[] {
    return [...this.providers.keys()];
  }
}
