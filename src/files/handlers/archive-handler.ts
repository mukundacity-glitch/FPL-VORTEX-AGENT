import AdmZip from "adm-zip";
import type { FileHandler, FileHandlerOutput, FileSource } from "../types.js";

function unsafeEntryName(name: string): boolean {
  const normalized = name.replace(/\\/gu, "/");
  return normalized.startsWith("/") || normalized.split("/").includes("..");
}

export class ZipArchiveHandler implements FileHandler {
  public readonly id = "zip";

  public supports(detection: { kind: string; format: string }): boolean {
    return detection.kind === "archive" && detection.format === "zip";
  }

  public async extract(source: FileSource, context: Parameters<FileHandler["extract"]>[1]): Promise<FileHandlerOutput> {
    const zip = new AdmZip(source.bytes);
    const children = [];
    const warnings: string[] = [];

    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      if (unsafeEntryName(entry.entryName)) {
        warnings.push(`Skipped unsafe archive path: ${entry.entryName}`);
        continue;
      }
      if (entry.header.size > context.limits.maxFileBytes) {
        warnings.push(`Skipped oversized archive member: ${entry.entryName}`);
        continue;
      }
      try {
        children.push(await context.analyzeChild(entry.entryName, entry.getData()));
      } catch (error) {
        warnings.push(`Failed archive member ${entry.entryName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const text = children
      .filter((child) => child.text)
      .map((child) => `## ${child.name}\n${child.text}`)
      .join("\n\n");

    return {
      text,
      children,
      warnings,
      metadata: { entriesAnalyzed: children.length, depth: context.depth },
    };
  }
}
