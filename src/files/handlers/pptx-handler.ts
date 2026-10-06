import AdmZip from "adm-zip";
import type { FileHandler, FileHandlerOutput, FileSection, FileSource } from "../types.js";
import { collectLocalNameText, naturalNumber, OOXML_PARSER } from "./ooxml-utils.js";

export class PptxFileHandler implements FileHandler {
  public readonly id = "pptx";

  public supports(detection: { format: string }): boolean {
    return detection.format === "pptx";
  }

  public async extract(source: FileSource): Promise<FileHandlerOutput> {
    const zip = new AdmZip(source.bytes);
    const slides = zip.getEntries()
      .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/u.test(entry.entryName))
      .sort((a, b) => naturalNumber(a.entryName) - naturalNumber(b.entryName));

    const sections: FileSection[] = slides.map((entry, index) => {
      const parsed = OOXML_PARSER.parse(entry.getData().toString("utf8")) as unknown;
      const runs = collectLocalNameText(parsed, "t").map((value) => value.trim()).filter(Boolean);
      return {
        id: `slide-${index + 1}`,
        title: `Slide ${index + 1}`,
        kind: "slide",
        text: runs.join("\n"),
        metadata: { slideNumber: index + 1 },
      };
    });

    return {
      text: sections.map((section) => `# ${section.title ?? section.id}\n${section.text}`).join("\n\n"),
      sections,
      metadata: { slideCount: sections.length },
    };
  }
}
