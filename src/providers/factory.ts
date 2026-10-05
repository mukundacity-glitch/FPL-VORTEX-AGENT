import type { RuntimeConfig } from "../config/runtime.js";
import type { ProviderName } from "../core/types.js";
import { AnthropicProvider } from "./anthropic-provider.js";
import type { ModelProvider } from "./model-provider.js";
import { OpenAIProvider } from "./openai-provider.js";

export type ProviderRole = "primary" | "review";

export function createProvider(
  provider: ProviderName,
  role: ProviderRole,
  config: RuntimeConfig,
): ModelProvider {
  if (provider === "openai") {
    const model = role === "primary"
      ? config.openai.primaryModel
      : config.openai.reviewModel || config.openai.primaryModel;
    return new OpenAIProvider(model, config.openai.apiKey);
  }

  const model = role === "primary"
    ? config.anthropic.primaryModel
    : config.anthropic.reviewModel || config.anthropic.primaryModel;
  return new AnthropicProvider(model, config.anthropic.apiKey);
}
