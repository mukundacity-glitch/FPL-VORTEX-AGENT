import AdmZip from "adm-zip";
import type { FileHandler, FileHandlerOutput, FileSection, FileSource } from "../types.js";
import { asArray, collectLocalNameText, naturalNumber, OOXML_PARSER } from "./ooxml-utils.js";

interface SheetInfo { name: string; relationshipId: string; }

function sharedStrings(zip: AdmZip): string[] {
  const entry = zip.getEntry("xl/sharedStrings.xml");
  if (!entry) return [];
  const parsed = OOXML_PARSER.parse(entry.getData().toString("utf8")) as Record<string, unknown>;
  const root = parsed.sst as Record<string, unknown> | undefined;
  return asArray(root?.si).map((item) => collectLocalNameText(item, "t").join(""));
}

function workbookSheets(zip: AdmZip): SheetInfo[] {
  const entry = zip.getEntry("xl/workbook.xml");
  if (!entry) return [];
  const parsed = OOXML_PARSER.parse(entry.getData().toString("utf8")) as Record<string, unknown>;
  const workbook = parsed.workbook as Record<string, unknown> | undefined;
  const sheets = workbook?.sheets as Record<string, unknown> | undefined;
  return asArray(sheets?.sheet).flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    const name = record["@_name"];
    const relationshipId = record["@_r:id"];
    return typeof name === "string" && typeof relationshipId === "string" ? [{ name, relationshipId }] : [];
  });
}

function relationshipTargets(zip: AdmZip): Map<string, string> {
  const entry = zip.getEntry("xl/_rels/workbook.xml.rels");
  const map = new Map<string, string>();
  if (!entry) return map;
  const parsed = OOXML_PARSER.parse(entry.getData().toString("utf8")) as Record<string, unknown>;
  const relationships = parsed.Relationships as Record<string, unknown> | undefined;
  for (const item of asArray(relationships?.Relationship)) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const id = record["@_Id"];
    const target = record["@_Target"];
    if (typeof id === "string" && typeof target === "string") {
      map.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//u, "")}`);
    }
  }
  return map;
}

function cellText(cell: Record<string, unknown>, strings: readonly string[]): string {
  const type = cell["@_t"];
  const value = cell.v;
  if (type === "s") {
    const index = Number(value);
    return Number.isInteger(index) ? strings[index] ?? "" : "";
  }
  if (type === "inlineStr") return collectLocalNameText(cell.is, "t").join("");
  if (value === undefined || value === null) return collectLocalNameText(cell, "t").join("");
  return String(value);
}

function worksheetText(xml: string, strings: readonly string[]): { text: string; rows: number; columns: number } {
  const parsed = OOXML_PARSER.parse(xml) as Record<string, unknown>;
  const worksheet = parsed.worksheet as Record<string, unknown> | undefined;
  const sheetData = worksheet?.sheetData as Record<string, unknown> | undefined;
  const rows = asArray(sheetData?.row);
  let maxColumns = 0;
  const lines: string[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const cells = asArray((row as Record<string, unknown>).c);
    const values = cells.map((cell) => typeof cell === "object" && cell !== null ? cellText(cell as Record<string, unknown>, strings) : "");
    maxColumns = Math.max(maxColumns, values.length);
    lines.push(values.join("\t"));
  }
  return { text: lines.join("\n"), rows: lines.length, columns: maxColumns };
}

export class XlsxFileHandler implements FileHandler {
  public readonly id = "xlsx";

  public supports(detection: { format: string }): boolean {
    return detection.format === "xlsx";
  }

  public async extract(source: FileSource): Promise<FileHandlerOutput> {
    const zip = new AdmZip(source.bytes);
    const strings = sharedStrings(zip);
    const sheets = workbookSheets(zip);
    const targets = relationshipTargets(zip);
    const worksheetEntries = zip.getEntries()
      .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/u.test(entry.entryName))
      .sort((a, b) => naturalNumber(a.entryName) - naturalNumber(b.entryName));

    const sections: FileSection[] = [];
    if (sheets.length > 0) {
      for (const [index, sheet] of sheets.entries()) {
        const target = targets.get(sheet.relationshipId) ?? `xl/worksheets/sheet${index + 1}.xml`;
        const entry = zip.getEntry(target);
        if (!entry) continue;
        const extracted = worksheetText(entry.getData().toString("utf8"), strings);
        sections.push({
          id: `sheet-${index + 1}`,
          title: sheet.name,
          kind: "worksheet",
          text: extracted.text,
          metadata: { rows: extracted.rows, columns: extracted.columns },
        });
      }
    } else {
      for (const [index, entry] of worksheetEntries.entries()) {
        const extracted = worksheetText(entry.getData().toString("utf8"), strings);
        sections.push({
          id: `sheet-${index + 1}`,
          title: `Sheet ${index + 1}`,
          kind: "worksheet",
          text: extracted.text,
          metadata: { rows: extracted.rows, columns: extracted.columns },
        });
      }
    }

    return {
      text: sections.map((section) => `# ${section.title ?? section.id}\n${section.text}`).join("\n\n"),
      sections,
      metadata: { sheetCount: sections.length, sharedStringCount: strings.length },
    };
  }
}
