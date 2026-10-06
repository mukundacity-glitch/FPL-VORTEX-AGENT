import OpenAI from "openai";

export interface EmbeddingProvider {
  readonly model: string;
  embed(text: string): Promise<number[]>;
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class LocalTokenEmbeddingProvider implements EmbeddingProvider {
  public readonly model = "vortex-local-token-v1";

  public constructor(private readonly dimensions = 384) {
    if (!Number.isInteger(dimensions) || dimensions < 32) {
      throw new Error("Local embedding dimensions must be an integer >= 32.");
    }
  }

  public async embed(text: string): Promise<number[]> {
    const vector = Array<number>(this.dimensions).fill(0);
    const tokens = text.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
    for (const token of tokens) {
      const hash = hashToken(token);
      const index = hash % this.dimensions;
      const sign = (hash & 1) === 0 ? 1 : -1;
      vector[index] = (vector[index] ?? 0) + sign;
    }
    return normalize(vector);
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly client: OpenAI;

  public constructor(
    public readonly model: string,
    apiKey: string,
  ) {
    if (!model.trim()) throw new Error("An explicit OpenAI embedding model is required.");
    if (!apiKey.trim()) throw new Error("OPENAI_API_KEY is required for OpenAI embeddings.");
    this.client = new OpenAI({ apiKey });
  }

  public async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
      encoding_format: "float",
    });
    const embedding = response.data[0]?.embedding;
    if (!embedding) throw new Error("OpenAI embedding response did not include an embedding.");
    return embedding;
  }
}
