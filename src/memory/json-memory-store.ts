import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { MemoryFilter, MemoryRecord } from "./types.js";
import { memoryMatchesFilter, type MemoryStore } from "./memory-store.js";

interface PersistedMemoryFile {
  version: 1;
  records: MemoryRecord[];
}

export class JsonMemoryStore implements MemoryStore {
  private loaded = false;
  private readonly records = new Map<string, MemoryRecord>();
  private writeChain: Promise<void> = Promise.resolve();

  public constructor(private readonly filePath: string) {}

  private key(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedMemoryFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.records)) {
        throw new Error("Unsupported Vortex memory file format.");
      }
      for (const record of parsed.records) {
        this.records.set(this.key(record.tenantId, record.id), record);
      }
    } catch (error) {
      const code = error instanceof Error && "code" in error
        ? (error as NodeJS.ErrnoException).code
        : undefined;
      if (code !== "ENOENT") throw error;
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const snapshot: PersistedMemoryFile = {
      version: 1,
      records: [...this.records.values()],
    };
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(snapshot)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, this.filePath);
  }

  private queuePersist(): Promise<void> {
    this.writeChain = this.writeChain.then(() => this.persist());
    return this.writeChain;
  }

  public async put(record: MemoryRecord): Promise<void> {
    await this.ensureLoaded();
    this.records.set(this.key(record.tenantId, record.id), structuredClone(record));
    await this.queuePersist();
  }

  public async get(tenantId: string, id: string): Promise<MemoryRecord | undefined> {
    await this.ensureLoaded();
    const record = this.records.get(this.key(tenantId, id));
    return record ? structuredClone(record) : undefined;
  }

  public async delete(tenantId: string, id: string): Promise<boolean> {
    await this.ensureLoaded();
    const deleted = this.records.delete(this.key(tenantId, id));
    if (deleted) await this.queuePersist();
    return deleted;
  }

  public async list(filter: MemoryFilter): Promise<MemoryRecord[]> {
    await this.ensureLoaded();
    return [...this.records.values()]
      .filter((record) => memoryMatchesFilter(record, filter))
      .map((record) => structuredClone(record));
  }
}
