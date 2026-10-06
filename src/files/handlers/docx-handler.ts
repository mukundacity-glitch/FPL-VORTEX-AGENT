import mammoth from "mammoth";
import type { FileHandler, FileHandlerOutput, FileSource } from "../types.js";

export class DocxFileHandler implements FileHandler {
  public readonly id = "docx";

  public supports(detection: { format: string }): boolean {
    return detection.format === "docx";
  }

  public async extract(source: FileSource): Promise<FileHandlerOutput> {
    const result = await mammoth.extractRawText({ buffer: source.bytes });
    return {
      text: result.value.trim(),
      metadata: { messages: result.messages.length },
      warnings: result.messages.map((message) => `${message.type}: ${message.message}`),
    };
  }
}
