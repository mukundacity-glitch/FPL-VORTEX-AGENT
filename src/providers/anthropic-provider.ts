import Anthropic from "@anthropic-ai/sdk";
import type { ModelRequest, ModelResponse } from "../core/types.js";
import type { ModelProvider } from "./model-provider.js";

export class AnthropicProvider implements ModelProvider {
  public readonly name = "anthropic" as const;
  private readonly client: Anthropic;

  public constructor(
    public readonly model: string,
    apiKey: string,
  ) {
    if (!model.trim()) {
      throw new Error("Anthropic model is required.");
    }
    if (!apiKey.trim()) {
      throw new Error("ANTHROPIC_API_KEY is required.");
    }
    this.client = new Anthropic({ apiKey, timeout: 120000, maxRetries: 1 });
  }

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxOutputTokens ?? 4096,
      system: request.systemPrompt,
      messages: [{ role: "user", content: request.userPrompt }],
    });

    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) {
      throw new Error(`Anthropic model ${this.model} returned no text output.`);
    }

    return {
      provider: this.name,
      model: this.model,
      text,
      requestId: message.id,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    };
  }
}
