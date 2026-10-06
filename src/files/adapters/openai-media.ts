import OpenAI from "openai";
import type {
  FileSource,
  TranscriptionProvider,
  TranscriptionResult,
  VisionAnalyzer,
  VisionResult,
} from "../types.js";

export interface OpenAITranscriptionOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class OpenAITranscriptionProvider implements TranscriptionProvider {
  private readonly model: string;
  private readonly baseUrl: string;

  public constructor(private readonly options: OpenAITranscriptionOptions) {
    this.model = options.model ?? "gpt-transcribe";
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/u, "");
  }

  public async transcribe(source: FileSource): Promise<TranscriptionResult> {
    const form = new FormData();
    form.append("file", new Blob([source.bytes], { type: source.mimeType ?? "application/octet-stream" }), source.name);
    form.append("model", this.model);
    form.append("response_format", "json");

    const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.options.apiKey}` },
      body: form,
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`OpenAI transcription ${response.status}: ${raw.slice(0, 800)}`);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.text !== "string") throw new Error("Transcription response did not contain text.");
    return {
      text: parsed.text,
      ...(typeof parsed.language === "string" ? { language: parsed.language } : {}),
      ...(typeof parsed.duration === "number" ? { durationSeconds: parsed.duration } : {}),
      metadata: { model: this.model },
    };
  }
}

export interface OpenAIVisionOptions {
  apiKey: string;
  model?: string;
}

export class OpenAIVisionAnalyzer implements VisionAnalyzer {
  private readonly client: OpenAI;
  private readonly model: string;

  public constructor(options: OpenAIVisionOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.model = options.model ?? "gpt-6-astra";
  }

  public async analyzeImage(source: FileSource, prompt = "Describe this image precisely."): Promise<VisionResult> {
    const mimeType = source.mimeType ?? "image/png";
    const dataUrl = `data:${mimeType};base64,${source.bytes.toString("base64")}`;
    const response = await this.client.responses.create({
      model: this.model,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", detail: "auto", image_url: dataUrl },
        ],
      }],
    });
    return { text: response.output_text, metadata: { model: this.model } };
  }
}
