import { extname } from "node:path";
import { unzipSync } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { FileRecord } from "../memory/store.js";
import type { MediaParser } from "./media.js";
const MAX_BYTES = 10 * 1024 * 1024,
  MAX_TEXT = 80000,
  MAX_EXPANDED = 30 * 1024 * 1024;
const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseTagValue: false,
  processEntities: false,
});
function text(bytes: Uint8Array): string {
  if (bytes.includes(0))
    throw new Error("Binary content is not a supported text file.");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
function xmlText(s: string): string {
  if (
    s.includes("<!DOCTYPE") ||
    s.includes("<!ENTITY") ||
    XMLValidator.validate(s) !== true
  )
    throw new Error("Invalid or unsafe XML.");
  return [
    ...s.matchAll(/<(?:[a-z]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z]+:)?t>/g),
  ]
    .map((m) => decode(m[1] ?? ""))
    .join(" ");
}
function archive(bytes: Uint8Array): Record<string, Uint8Array> {
  let total = 0,
    count = 0;
  return unzipSync(bytes, {
    filter: (file) => {
      if (
        ++count > 200 ||
        file.originalSize > MAX_EXPANDED ||
        (total += file.originalSize) > MAX_EXPANDED
      )
        throw new Error("Archive exceeds extraction limits.");
      if (
        file.name.startsWith("/") ||
        file.name.includes("\\") ||
        file.name.split("/").includes("..")
      )
        throw new Error("Unsafe archive path.");
      return !file.name.endsWith("/");
    },
  });
}
const arr = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
export class FileEngine {
  constructor(private readonly media?: MediaParser) {}
  async ingest(
    name: string,
    bytes: Uint8Array,
    depth = 0,
  ): Promise<FileRecord> {
    if (!name || name.length > 200 || name.includes("/") || name.includes("\\"))
      throw new Error("Invalid filename.");
    if (!bytes.length || bytes.length > MAX_BYTES)
      throw new Error("File size must be 1 byte to 10 MiB.");
    const kind = extname(name).toLowerCase().slice(1),
      warnings: string[] = [];
    let content = "";
    if (
      [
        "txt",
        "md",
        "csv",
        "tsv",
        "json",
        "xml",
        "yaml",
        "yml",
        "log",
        "js",
        "ts",
        "tsx",
        "jsx",
        "py",
        "html",
        "css",
        "sql",
        "sh",
        "rs",
        "go",
        "java",
        "c",
        "cpp",
        "h",
        "ipynb",
      ].includes(kind)
    ) {
      content = text(bytes);
      if (kind === "json" || kind === "ipynb") JSON.parse(content);
      if (
        kind === "xml" &&
        (content.includes("<!DOCTYPE") ||
          content.includes("<!ENTITY") ||
          XMLValidator.validate(content) !== true)
      )
        throw new Error("Invalid or unsafe XML.");
    } else if (kind === "pdf") {
      if (Buffer.from(bytes.slice(0, 5)).toString() !== "%PDF-")
        throw new Error("Invalid PDF signature.");
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const task = getDocument({
        data: new Uint8Array(bytes),
        useSystemFonts: true,
      });
      const pdf = await task.promise;
      try {
        if (pdf.numPages > 100) throw new Error("PDF exceeds 100 pages.");
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const extracted = await page.getTextContent();
          content += `\n[Page ${i}]\n${extracted.items.map((item) => ("str" in item ? item.str : "")).join(" ")}`;
        }
      } finally {
        await task.destroy();
      }
      if (content.replace(/\[Page \d+\]/g, "").trim().length < 20)
        warnings.push(
          "Little embedded text found. Scanned PDFs require OCR, which is not configured.",
        );
    } else if (["docx", "pptx", "xlsx", "zip"].includes(kind)) {
      const entries = archive(bytes);
      if (kind === "docx") {
        if (!entries["word/document.xml"]) throw new Error("Invalid DOCX.");
        content = xmlText(text(entries["word/document.xml"]!));
      }
      if (kind === "pptx") {
        const slides = Object.keys(entries)
          .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
          .sort(
            (a, b) =>
              Number(a.match(/slide(\d+)/)?.[1]) -
              Number(b.match(/slide(\d+)/)?.[1]),
          );
        if (!slides.length) throw new Error("Invalid PPTX.");
        for (const p of slides)
          content += `\n[Slide ${p.match(/slide(\d+)/)?.[1]}]\n${xmlText(text(entries[p]!))}`;
      }
      if (kind === "xlsx") {
        if (!entries["xl/workbook.xml"]) throw new Error("Invalid XLSX.");
        const shared = entries["xl/sharedStrings.xml"]
          ? arr(xml.parse(text(entries["xl/sharedStrings.xml"]!)).sst?.si).map(
              (s: any) =>
                typeof s.t === "string"
                  ? s.t
                  : arr(s.r)
                      .map((r: any) => r.t ?? "")
                      .join(""),
            )
          : [];
        const workbook = xml.parse(text(entries["xl/workbook.xml"]!));
        const sheets = arr(workbook.workbook?.sheets?.sheet) as any[];
        const rels = entries["xl/_rels/workbook.xml.rels"]
          ? (arr(
              xml.parse(text(entries["xl/_rels/workbook.xml.rels"]!))
                .Relationships?.Relationship,
            ) as any[])
          : [];
        for (const sheet of sheets) {
          const rel = rels.find((r) => r["@Id"] === sheet["@r:id"]);
          const target = String(rel?.["@Target"] ?? "");
          const path = target.startsWith("/")
            ? target.slice(1)
            : `xl/${target.replace(/^\.\//, "")}`;
          const data = entries[path];
          if (!data) {
            warnings.push(`Sheet ${sheet["@name"]} could not be extracted.`);
            continue;
          }
          content += `\n[Sheet ${sheet["@name"]}]\n`;
          const parsed = xml.parse(text(data));
          for (const row of arr(parsed.worksheet?.sheetData?.row) as any[]) {
            for (const cell of arr(row.c) as any[]) {
              const value =
                cell["@t"] === "s"
                  ? (shared[Number(cell.v)] ?? "")
                  : cell["@t"] === "inlineStr"
                    ? (cell.is?.t ?? "")
                    : (cell.v ?? "");
              content += `${cell["@r"]}: ${value}${cell.f ? ` [formula: ${cell.f}]` : ""}\t`;
            }
            content += "\n";
          }
        }
        warnings.push(
          "Workbook formulas are not recalculated; cached values may be stale. Charts/macros are not interpreted.",
        );
      }
      if (kind === "zip") {
        if (depth >= 2) throw new Error("Nested archive limit exceeded.");
        for (const [path, data] of Object.entries(entries)) {
          if (/(^|\/)(node_modules|\.git|\.env)(\/|$|\.)/.test(path)) {
            warnings.push(`Skipped private or generated path: ${path}`);
            continue;
          }
          try {
            const file = await this.ingest(
              path.split("/").at(-1)!,
              data,
              depth + 1,
            );
            content += `\n[File ${path}]\n${file.text}`;
            warnings.push(...file.warnings.map((w) => `${path}: ${w}`));
          } catch (error) {
            warnings.push(
              `${path}: ${error instanceof Error ? error.message : "unsupported"}`,
            );
          }
          if (content.length > MAX_TEXT) {
            warnings.push(
              "Archive text limit reached; remaining files omitted.",
            );
            break;
          }
        }
      }
      if (kind !== "zip")
        warnings.push(
          "Text extraction preserves content markers; layout, embedded images, footnotes and other objects may be omitted.",
        );
    } else if (["png", "jpg", "jpeg", "webp", "gif"].includes(kind)) {
      if (!this.media)
        throw new Error("Image parser requires configured media provider.");
      content = await this.media.image(
        bytes,
        `image/${kind === "jpg" ? "jpeg" : kind}`,
      );
      warnings.push(
        "Image extraction is a model interpretation; verify uncertain text.",
      );
    } else if (["mp3", "wav", "m4a", "ogg", "flac"].includes(kind)) {
      if (!this.media)
        throw new Error("Audio parser requires configured media provider.");
      content = await this.media.audio(bytes, name);
      warnings.push("Automated transcription may contain errors.");
    } else if (["mp4", "mov", "webm", "mkv"].includes(kind)) {
      if (!this.media)
        throw new Error("Video parser requires configured media provider.");
      content = await this.media.video(bytes);
      warnings.push(
        "Only the first 15 minutes and at most six frames sampled every 150 seconds are analyzed. Events between samples may be missed.",
      );
    } else
      throw new Error(
        `Unsupported format: ${kind || "unknown"}. Add a parser to the file engine.`,
      );
    if (content.length > MAX_TEXT) {
      content = content.slice(0, MAX_TEXT);
      warnings.push("Extracted text truncated at 80,000 characters.");
    }
    if (!content.trim()) warnings.push("No readable content extracted.");
    return { id: crypto.randomUUID(), name, kind, text: content, warnings };
  }
}
