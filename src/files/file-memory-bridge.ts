import type { KnowledgeIngestor } from "../memory/knowledge-ingestor.js";
import type { FileUnderstanding } from "./types.js";

export interface FileMemoryCoordinates {
  tenantId: string;
  namespace: string;
  projectId?: string;
  conversationId?: string;
  importance?: number;
}

export interface FileMemoryIngestResult {
  fileIds: readonly string[];
  memoryIds: readonly string[];
  chunks: number;
}

function memoryText(file: FileUnderstanding): string {
  const sectionText = file.sections
    .filter((section) => section.text && !file.text.includes(section.text))
    .map((section) => `# ${section.title ?? section.id}\n${section.text}`)
    .join("\n\n");
  return [file.text, sectionText].filter(Boolean).join("\n\n");
}

export class FileMemoryBridge {
  public constructor(private readonly ingestor: KnowledgeIngestor) {}

  public async ingest(file: FileUnderstanding, coordinates: FileMemoryCoordinates): Promise<FileMemoryIngestResult> {
    const fileIds: string[] = [];
    const memoryIds: string[] = [];
    let chunks = 0;

    const visit = async (current: FileUnderstanding): Promise<void> => {
      fileIds.push(current.id);
      const content = memoryText(current);
      if (content.trim()) {
        const result = await this.ingestor.ingest({
          tenantId: coordinates.tenantId,
          namespace: coordinates.namespace,
          scope: "file",
          fileId: current.id,
          content,
          source: current.name,
          metadata: {
            fileName: current.name,
            kind: current.kind,
            format: current.format,
            mimeType: current.mimeType,
            sizeBytes: current.sizeBytes,
            warnings: current.warnings,
          },
          ...(coordinates.projectId ? { projectId: coordinates.projectId } : {}),
          ...(coordinates.conversationId ? { conversationId: coordinates.conversationId } : {}),
          ...(coordinates.importance !== undefined ? { importance: coordinates.importance } : {}),
        });
        memoryIds.push(...result.memoryIds);
        chunks += result.chunks;
      }
      for (const child of current.children) await visit(child);
    };

    await visit(file);
    return { fileIds, memoryIds, chunks };
  }
}
