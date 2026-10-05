import OpenAI from "openai";
import type { ModelRequest, ModelResponse } from "../core/types.js";
import type { ModelProvider } from "./model-provider.js";

export class OpenAIProvider implements ModelProvider {
  public readonly name = "openai" as const;
  private readonly client: OpenAI;

  public constructor(
    public readonly model: string,
    apiKey: string,
  ) {
    if (!model.trim()) {
      throw new Error("OpenAI model is required.");
    }
    if (!apiKey.trim()) {
      throw new Error("OPENAI_API_KEY is required.");
    }
    this.client = new OpenAI({ apiKey });
  }

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: request.systemPrompt,
      input: request.userPrompt,
      ...(request.maxOutputTokens === undefined
        ? {}
        : { max_output_tokens: request.maxOutputTokens }),
      ...(request.temperature === undefined
        ? {}
        : { temperature: request.temperature }),
    });

    const text = response.output_text?.trim();
    if (!text) {
      throw new Error(`OpenAI model ${this.model} returned no text output.`);
    }

    return {
      provider: this.name,
      model: this.model,
      text,
      requestId: response.id,
      usage: {
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
      },
    };
  }
}
