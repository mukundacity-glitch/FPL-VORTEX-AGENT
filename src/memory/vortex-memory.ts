import { createHash, randomUUID } from "node:crypto";
import type { EmbeddingProvider } from "./embedding-provider.js";
import { MemoryRetriever } from "./memory-retriever.js";
import type { MemoryStore } from "./memory-store.js";
import type {
  MemoryAddress,
  MemoryContextOptions,
  MemoryQuery,
  MemoryRecord,
  MemorySearchResult,
  MemoryWriteInput,
} from "./types.js";

function requireValue(value: string | undefined, name: string): void {
  if (!value?.trim()) throw new Error(`${name} is required for this memory scope.`);
}

function validateAddress(address: MemoryAddress): void {
  requireValue(address.tenantId, "tenantId");
  requireValue(address.namespace, "namespace");
  if (address.scope === "conversation") requireValue(address.conversationId, "conversationId");
  if (address.scope === "project") requireValue(address.projectId, "projectId");
  if (address.scope === "file") requireValue(address.fileId, "fileId");
  if (address.scope === "agent") requireValue(address.agentId, "agentId");
}

function normalizedHash(content: string): string {
  const normalized = content.trim().replace(/\s+/gu, " ").toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}

function addressFilter(input: MemoryWriteInput) {
  return {
    tenantId: input.tenantId,
    namespace: input.namespace,
    scopes: [input.scope],
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.fileId ? { fileId: input.fileId } : {}),
    ...(input.agentId ? { agentId: input.agentId } : {}),
  } as const;
}

export class VortexMemory {
  private readonly retriever: MemoryRetriever;

  public constructor(
    private readonly store: MemoryStore,
    private readonly embeddings?: EmbeddingProvider,
  ) {
    this.retriever = new MemoryRetriever(store, embeddings);
  }

  public async remember(input: MemoryWriteInput): Promise<MemoryRecord> {
    validateAddress(input);
    const content = input.content.trim();
    if (!content) throw new Error("Memory content cannot be empty.");
    const importance = Math.max(0, Math.min(input.importance ?? 0.5, 1));
    const contentHash = normalizedHash(content);
    const existing = (await this.store.list(addressFilter(input)))
      .find((record) => record.contentHash === contentHash);
    const now = new Date().toISOString();
    const embedding = this.embeddings ? await this.embeddings.embed(content) : undefined;
    const tags = [...new Set([...(existing?.tags ?? []), ...(input.tags ?? [])])].sort();

    const record: MemoryRecord = {
      id: existing?.id ?? randomUUID(),
      tenantId: input.tenantId,
      namespace: input.namespace,
      scope: input.scope,
      content,
      contentHash,
      tags,
      importance: Math.max(existing?.importance ?? 0, importance),
      metadata: { ...(existing?.metadata ?? {}), ...(input.metadata ?? {}) },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      ...(input.fileId ? { fileId: input.fileId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.source ? { source: input.source } : existing?.source ? { source: existing.source } : {}),
      ...(embedding ? { embedding } : {}),
      ...(embedding && this.embeddings ? { embeddingModel: this.embeddings.model } : {}),
    };

    await this.store.put(record);
    return record;
  }

  public async recall(query: MemoryQuery): Promise<MemorySearchResult[]> {
    requireValue(query.tenantId, "tenantId");
    if (!query.text.trim()) return [];
    return await this.retriever.search(query);
  }

  public async forget(tenantId: string, id: string): Promise<boolean> {
    requireValue(tenantId, "tenantId");
    requireValue(id, "id");
    return await this.store.delete(tenantId, id);
  }

  public async get(tenantId: string, id: string): Promise<MemoryRecord | undefined> {
    return await this.store.get(tenantId, id);
  }

  public async buildContext(options: MemoryContextOptions): Promise<string> {
    const maxCharacters = Math.max(500, Math.min(options.maxCharacters ?? 12_000, 50_000));
    const results = await this.recall(options);
    const sections: string[] = [];
    let used = 0;

    for (const result of results) {
      const header = `[memory:${result.record.scope} score=${result.score.toFixed(3)}${result.record.source ? ` source=${result.record.source}` : ""}]`;
      const section = `${header}\n${result.record.content}`;
      if (used + section.length > maxCharacters) break;
      sections.push(section);
      used += section.length + 2;
    }
    return sections.join("\n\n");
  }
}
