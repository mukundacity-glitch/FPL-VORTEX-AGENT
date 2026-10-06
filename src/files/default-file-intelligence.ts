import { FileHandlerRegistry } from "./file-handler-registry.js";
import { FileIntelligence, type FileIntelligenceOptions } from "./file-intelligence.js";
import { ZipArchiveHandler } from "./handlers/archive-handler.js";
import { DocxFileHandler } from "./handlers/docx-handler.js";
import { ImageFileHandler } from "./handlers/image-handler.js";
import { MediaFileHandler } from "./handlers/media-handler.js";
import { PdfFileHandler } from "./handlers/pdf-handler.js";
import { PptxFileHandler } from "./handlers/pptx-handler.js";
import { TextFileHandler } from "./handlers/text-handler.js";
import { XlsxFileHandler } from "./handlers/xlsx-handler.js";

export function createDefaultFileIntelligence(options: FileIntelligenceOptions = {}): FileIntelligence {
  const registry = new FileHandlerRegistry();
  registry.registerMany([
    new TextFileHandler(),
    new PdfFileHandler(),
    new DocxFileHandler(),
    new XlsxFileHandler(),
    new PptxFileHandler(),
    new ZipArchiveHandler(),
    new ImageFileHandler(),
    new MediaFileHandler(),
  ]);
  return new FileIntelligence(registry, options);
}
