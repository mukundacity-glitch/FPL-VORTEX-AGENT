import type { MemoryFilter, MemoryRecord } from "./types.js";

export interface MemoryStore {
  put(record: MemoryRecord): Promise<void>;
  get(tenantId: string, id: string): Promise<MemoryRecord | undefined>;
  delete(tenantId: string, id: string): Promise<boolean>;
  list(filter: MemoryFilter): Promise<MemoryRecord[]>;
}

function matches(record: MemoryRecord, filter: MemoryFilter): boolean {
  if (record.tenantId !== filter.tenantId) return false;
  if (filter.namespace !== undefined && record.namespace !== filter.namespace) return false;
  if (filter.scopes !== undefined && !filter.scopes.includes(record.scope)) return false;
  if (filter.projectId !== undefined && record.projectId !== filter.projectId) return false;
  if (filter.conversationId !== undefined && record.conversationId !== filter.conversationId) return false;
  if (filter.fileId !== undefined && record.fileId !== filter.fileId) return false;
  if (filter.agentId !== undefined && record.agentId !== filter.agentId) return false;
  if (
    filter.tags !== undefined
    && !filter.tags.every((tag) => record.tags.includes(tag))
  ) return false;
  return true;
}

export class InMemoryMemoryStore implements MemoryStore {
  private readonly records = new Map<string, MemoryRecord>();

  private key(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }

  public async put(record: MemoryRecord): Promise<void> {
    this.records.set(this.key(record.tenantId, record.id), structuredClone(record));
  }

  public async get(tenantId: string, id: string): Promise<MemoryRecord | undefined> {
    const record = this.records.get(this.key(tenantId, id));
    return record ? structuredClone(record) : undefined;
  }

  public async delete(tenantId: string, id: string): Promise<boolean> {
    return this.records.delete(this.key(tenantId, id));
  }

  public async list(filter: MemoryFilter): Promise<MemoryRecord[]> {
    return [...this.records.values()]
      .filter((record) => matches(record, filter))
      .map((record) => structuredClone(record));
  }
}

export { matches as memoryMatchesFilter };
