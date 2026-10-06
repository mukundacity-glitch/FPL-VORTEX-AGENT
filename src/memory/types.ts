export type MemoryScope =
  | "conversation"
  | "project"
  | "file"
  | "agent"
  | "global";

export interface MemoryAddress {
  tenantId: string;
  namespace: string;
  scope: MemoryScope;
  projectId?: string;
  conversationId?: string;
  fileId?: string;
  agentId?: string;
}

export interface MemoryRecord extends MemoryAddress {
  id: string;
  content: string;
  contentHash: string;
  tags: string[];
  importance: number;
  source?: string;
  metadata: Readonly<Record<string, unknown>>;
  embedding?: number[];
  embeddingModel?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryWriteInput extends MemoryAddress {
  content: string;
  tags?: readonly string[];
  importance?: number;
  source?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface MemoryFilter {
  tenantId: string;
  namespace?: string;
  scopes?: readonly MemoryScope[];
  projectId?: string;
  conversationId?: string;
  fileId?: string;
  agentId?: string;
  tags?: readonly string[];
}

export interface MemoryQuery extends MemoryFilter {
  text: string;
  limit?: number;
  minScore?: number;
}

export interface MemorySearchResult {
  record: MemoryRecord;
  score: number;
  semanticScore: number;
  lexicalScore: number;
  importanceScore: number;
  recencyScore: number;
}

export interface MemoryContextOptions extends MemoryQuery {
  maxCharacters?: number;
}

export interface KnowledgeDocument extends MemoryAddress {
  content: string;
  source?: string;
  tags?: readonly string[];
  importance?: number;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface KnowledgeIngestResult {
  memoryIds: string[];
  chunks: number;
}
