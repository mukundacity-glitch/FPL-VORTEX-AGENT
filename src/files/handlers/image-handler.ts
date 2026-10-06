import type { FileHandler, FileHandlerOutput, FileSource } from "../types.js";

function jpegDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1] ?? 0;
    const length = bytes.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    if (length < 2) break;
    offset += 2 + length;
  }
  return undefined;
}

function dimensions(source: FileSource, format: string): { width: number; height: number } | undefined {
  const bytes = source.bytes;
  if (format === "png" && bytes.length >= 24) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (format === "gif" && bytes.length >= 10) return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (format === "jpg") return jpegDimensions(bytes);
  return undefined;
}

export class ImageFileHandler implements FileHandler {
  public readonly id = "image";

  public supports(detection: { kind: string }): boolean {
    return detection.kind === "image";
  }

  public async extract(source: FileSource, context: Parameters<FileHandler["extract"]>[1]): Promise<FileHandlerOutput> {
    const size = dimensions(source, context.detection.format);
    const warnings: string[] = [];
    let text = "";
    const metadata: Record<string, unknown> = size ? { ...size } : {};

    if (context.vision) {
      try {
        const result = await context.vision.analyzeImage(source, "Describe this image precisely. Extract visible text, important objects, relationships, charts, UI, and anything needed for later question answering.");
        text = result.text;
        if (result.tags) metadata.tags = result.tags;
        if (result.metadata) Object.assign(metadata, result.metadata);
      } catch (error) {
        warnings.push(`Vision analysis failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      warnings.push("No vision analyzer configured; image understanding is limited to metadata.");
    }

    return { text, metadata, warnings };
  }
}
