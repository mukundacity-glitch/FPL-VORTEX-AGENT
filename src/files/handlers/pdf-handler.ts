import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { FileHandler, FileHandlerOutput, FileSection, FileSource } from "../types.js";

export class PdfFileHandler implements FileHandler {
  public readonly id = "pdf";

  public supports(detection: { format: string }): boolean {
    return detection.format === "pdf";
  }

  public async extract(source: FileSource): Promise<FileHandlerOutput> {
    const loading = getDocument({ data: new Uint8Array(source.bytes) });
    const pdf = await loading.promise;
    const sections: FileSection[] = [];
    const warnings: string[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        try {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          const parts: string[] = [];
          for (const item of content.items) {
            if (typeof item === "object" && item !== null && "str" in item) {
              const value = (item as { str?: unknown }).str;
              if (typeof value === "string" && value.trim()) parts.push(value);
            }
          }
          sections.push({
            id: `page-${pageNumber}`,
            title: `Page ${pageNumber}`,
            kind: "page",
            text: parts.join(" ").replace(/\s+/gu, " ").trim(),
            metadata: { pageNumber },
          });
        } catch (error) {
          warnings.push(`Page ${pageNumber} extraction failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } finally {
      await loading.destroy();
    }

    return {
      text: sections.map((section) => section.text).filter(Boolean).join("\n\n"),
      sections,
      metadata: { pages: pdf.numPages },
      warnings,
    };
  }
}
