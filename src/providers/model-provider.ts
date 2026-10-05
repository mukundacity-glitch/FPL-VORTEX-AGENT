import type { ModelRequest, ModelResponse, ProviderName } from "../core/types.js";

export interface ModelProvider {
  readonly name: ProviderName;
  readonly model: string;
  generate(request: ModelRequest): Promise<ModelResponse>;
}
