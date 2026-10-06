import { XMLParser } from "fast-xml-parser";
import type { FileHandler, FileHandlerOutput, FileSource } from "../types.js";

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? "";
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function collectPrimitiveText(value: unknown, out: string[]): void {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPrimitiveText(item, out);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value as Record<string, unknown>)) collectPrimitiveText(child, out);
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/[ \t]+/gu, " ")
    .replace(/\n\s+/gu, "\n")
    .trim();
}

export class TextFileHandler implements FileHandler {
  public readonly id = "text";

  public supports(detection: { kind: string }): boolean {
    return detection.kind === "text";
  }

  public async extract(source: FileSource, context: Parameters<FileHandler["extract"]>[1]): Promise<FileHandlerOutput> {
    const raw = source.bytes.toString("utf8").replace(/^\uFEFF/u, "");
    const warnings: string[] = [];
    let text = raw;
    const metadata: Record<string, unknown> = { lineCount: raw ? raw.split(/\r?\n/u).length : 0 };

    if (source.bytes.includes(0)) warnings.push("Input contains NUL bytes; text decoding may be incomplete.");

    if (context.detection.format === "json") {
      try {
        const parsed: unknown = JSON.parse(raw);
        text = JSON.stringify(parsed, null, 2);
        metadata.jsonType = Array.isArray(parsed) ? "array" : typeof parsed;
      } catch (error) {
        warnings.push(`JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (context.detection.format === "jsonl") {
      const valid: unknown[] = [];
      for (const [index, line] of raw.split(/\r?\n/u).entries()) {
        if (!line.trim()) continue;
        try { valid.push(JSON.parse(line)); }
        catch { warnings.push(`JSONL line ${index + 1} is invalid JSON.`); }
      }
      metadata.records = valid.length;
    } else if (context.detection.format === "csv" || context.detection.format === "tsv") {
      const rows = parseCsv(raw, context.detection.format === "tsv" ? "\t" : ",");
      metadata.rows = rows.length;
      metadata.columns = rows.reduce((max, row) => Math.max(max, row.length), 0);
      text = rows.map((row) => row.join("\t")).join("\n");
    } else if (context.detection.format === "xml") {
      try {
        const parsed = new XMLParser({ ignoreAttributes: false, trimValues: true }).parse(raw) as unknown;
        const values: string[] = [];
        collectPrimitiveText(parsed, values);
        text = values.join("\n");
        metadata.xmlParsed = true;
      } catch (error) {
        warnings.push(`XML parse failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (context.detection.format === "html" || context.detection.format === "htm") {
      text = htmlToText(raw);
    }

    return { text, metadata, warnings };
  }
}
