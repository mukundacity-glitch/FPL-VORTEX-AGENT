import type { EmbeddingProvider } from "./embedding-provider.js";
import type { MemoryStore } from "./memory-store.js";
import type { MemoryQuery, MemoryRecord, MemorySearchResult } from "./types.js";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) ?? []);
}

function lexicalSimilarity(query: string, content: string): number {
  const left = tokens(query);
  const right = tokens(content);
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const dice = (2 * intersection) / (left.size + right.size);
  const phraseBonus = content.toLowerCase().includes(query.trim().toLowerCase()) ? 0.15 : 0;
  return clamp01(dice + phraseBonus);
}

function cosineSimilarity(left?: readonly number[], right?: readonly number[]): number {
  if (!left || !right || left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftMagnitude += a * a;
    rightMagnitude += b * b;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return clamp01((dot / Math.sqrt(leftMagnitude * rightMagnitude) + 1) / 2);
}

function recencyScore(record: MemoryRecord, now = Date.now()): number {
  const updated = Date.parse(record.updatedAt);
  if (!Number.isFinite(updated)) return 0;
  const ageDays = Math.max(0, now - updated) / 86_400_000;
  return Math.exp(-ageDays / 180);
}

export class MemoryRetriever {
  public constructor(
    private readonly store: MemoryStore,
    private readonly embeddings?: EmbeddingProvider,
  ) {}

  public async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const limit = Math.max(1, Math.min(query.limit ?? 8, 50));
    const minScore = clamp01(query.minScore ?? 0.08);
    const candidates = await this.store.list(query);
    const queryEmbedding = this.embeddings
      ? await this.embeddings.embed(query.text)
      : undefined;

    const scored = candidates.map((record): MemorySearchResult => {
      const semanticScore = this.embeddings && record.embeddingModel === this.embeddings.model
        ? cosineSimilarity(queryEmbedding, record.embedding)
        : 0;
      const lexicalScore = lexicalSimilarity(query.text, record.content);
      const importanceScore = clamp01(record.importance);
      const recent = recencyScore(record);
      const hasSemantic = semanticScore > 0;
      const score = hasSemantic
        ? 0.55 * semanticScore + 0.25 * lexicalScore + 0.12 * importanceScore + 0.08 * recent
        : 0.72 * lexicalScore + 0.18 * importanceScore + 0.10 * recent;

      return {
        record,
        score: clamp01(score),
        semanticScore,
        lexicalScore,
        importanceScore,
        recencyScore: recent,
      };
    });

    return scored
      .filter((item) => item.score >= minScore)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }
}
