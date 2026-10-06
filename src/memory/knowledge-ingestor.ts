import type { VortexMemory } from "./vortex-memory.js";
import type { KnowledgeDocument, KnowledgeIngestResult } from "./types.js";

export interface KnowledgeIngestorOptions {
  chunkCharacters?: number;
  overlapCharacters?: number;
}

function splitText(text: string, chunkSize: number, overlap: number): string[] {
  const normalized = text.replace(/\r\n/gu, "\n").trim();
  if (!normalized) return [];
  if (normalized.length <= chunkSize) return [normalized];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + chunkSize);
    if (end < normalized.length) {
      const paragraph = normalized.lastIndexOf("\n\n", end);
      const sentence = normalized.lastIndexOf(". ", end);
      const boundary = Math.max(paragraph, sentence);
      if (boundary > start + Math.floor(chunkSize * 0.6)) {
        end = boundary + (boundary === sentence ? 1 : 0);
      }
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

export class KnowledgeIngestor {
  private readonly chunkCharacters: number;
  private readonly overlapCharacters: number;

  public constructor(
    private readonly memory: VortexMemory,
    options: KnowledgeIngestorOptions = {},
  ) {
    this.chunkCharacters = Math.max(500, options.chunkCharacters ?? 4_000);
    this.overlapCharacters = Math.max(
      0,
      Math.min(options.overlapCharacters ?? 400, Math.floor(this.chunkCharacters / 3)),
    );
  }

  public async ingest(document: KnowledgeDocument): Promise<KnowledgeIngestResult> {
    const chunks = splitText(document.content, this.chunkCharacters, this.overlapCharacters);
    const memoryIds: string[] = [];

    for (let index = 0; index < chunks.length; index += 1) {
      const record = await this.memory.remember({
        tenantId: document.tenantId,
        namespace: document.namespace,
        scope: document.scope,
        content: chunks[index] ?? "",
        metadata: {
          ...(document.metadata ?? {}),
          chunkIndex: index,
          chunkCount: chunks.length,
        },
        ...(document.tags ? { tags: document.tags } : {}),
        ...(document.importance !== undefined ? { importance: document.importance } : {}),
        ...(document.source ? { source: document.source } : {}),
        ...(document.projectId ? { projectId: document.projectId } : {}),
        ...(document.conversationId ? { conversationId: document.conversationId } : {}),
        ...(document.fileId ? { fileId: document.fileId } : {}),
        ...(document.agentId ? { agentId: document.agentId } : {}),
      });
      memoryIds.push(record.id);
    }

    return { memoryIds, chunks: chunks.length };
  }
}
