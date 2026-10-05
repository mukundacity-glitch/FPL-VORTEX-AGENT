import OpenAI from "openai";
import type { ModelRequest, ModelResponse } from "../core/types.js";
import type { ModelProvider } from "./model-provider.js";

export class OpenAIAgentProvider implements ModelProvider {
  public readonly name = "openai" as const;
  private readonly client: OpenAI;

  public constructor(
    public readonly model: string,
    apiKey: string,
  ) {
    if (!model.trim()) {
      throw new Error("OpenAI agent model is required.");
    }
    if (!apiKey.trim()) {
      throw new Error("OPENAI_API_KEY is required.");
    }
    this.client = new OpenAI({ apiKey });
  }

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    const events = await this.client.beta.agents.sessions.create({
      agent: {
        model: this.model,
        instructions: request.systemPrompt,
      },
      environment: { type: "openai_hosted" },
      input: request.userPrompt,
      stream: true,
    });

    events.withResultCollection();
    try {
      for await (const _event of events) {
        // Consume the stream so the managed Codex harness can complete its task.
      }

      const result = await events.finalResult();
      const text = result.output_text?.trim();
      if (!text) {
        throw new Error(`OpenAI agent model ${this.model} returned no text output.`);
      }

      return {
        provider: this.name,
        model: this.model,
        text,
        requestId: result.session_id,
      };
    } finally {
      events.controller.abort();
    }
  }
}
