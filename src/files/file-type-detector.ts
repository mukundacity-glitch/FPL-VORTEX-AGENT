import path from "node:path";
import type { FileDetection, FileKind } from "./types.js";

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".json": "application/json",
  ".jsonl": "application/x-ndjson",
  ".xml": "application/xml",
  ".html": "text/html",
  ".htm": "text/html",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".webm": "video/webm",
};

const CODE_EXTENSIONS = new Set([
  ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".rb", ".go", ".rs",
  ".java", ".kt", ".kts", ".swift", ".c", ".h", ".cpp", ".hpp", ".cs", ".php",
  ".sh", ".bash", ".zsh", ".ps1", ".sql", ".graphql", ".gql", ".yaml", ".yml",
  ".toml", ".ini", ".cfg", ".conf", ".env", ".dockerfile", ".vue", ".svelte",
]);

function startsWith(bytes: Buffer, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Buffer, start: number, end: number): string {
  return bytes.subarray(start, Math.min(end, bytes.length)).toString("ascii");
}

function formatFromExtension(extension: string): { kind: FileKind; format: string } | undefined {
  if ([".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".jsonl", ".xml", ".html", ".htm"].includes(extension)) {
    return { kind: "text", format: extension.slice(1) };
  }
  if (CODE_EXTENSIONS.has(extension)) return { kind: "text", format: "code" };
  if (extension === ".pdf") return { kind: "document", format: "pdf" };
  if (extension === ".docx") return { kind: "document", format: "docx" };
  if (extension === ".xlsx") return { kind: "spreadsheet", format: "xlsx" };
  if (extension === ".pptx") return { kind: "presentation", format: "pptx" };
  if (extension === ".zip") return { kind: "archive", format: "zip" };
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extension)) return { kind: "image", format: extension.replace(".", "").replace("jpeg", "jpg") };
  if ([".mp3", ".wav", ".m4a", ".flac", ".ogg"].includes(extension)) return { kind: "audio", format: extension.slice(1) };
  if ([".mp4", ".mov", ".m4v", ".webm"].includes(extension)) return { kind: "video", format: extension.slice(1) };
  return undefined;
}

export function detectFileType(name: string, bytes: Buffer, providedMimeType?: string): FileDetection {
  const extension = path.extname(name).toLowerCase();
  const byExtension = formatFromExtension(extension);
  let kind = byExtension?.kind ?? "unknown";
  let format = byExtension?.format ?? (extension ? extension.slice(1) : "binary");
  let confidence = byExtension ? 0.82 : 0.25;

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    kind = "document"; format = "pdf"; confidence = 0.99;
  } else if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    kind = "image"; format = "png"; confidence = 0.99;
  } else if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    kind = "image"; format = "jpg"; confidence = 0.99;
  } else if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") {
    kind = "image"; format = "gif"; confidence = 0.99;
  } else if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    kind = "image"; format = "webp"; confidence = 0.99;
  } else if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE") {
    kind = "audio"; format = "wav"; confidence = 0.99;
  } else if (ascii(bytes, 0, 4) === "OggS") {
    kind = "audio"; format = "ogg"; confidence = 0.95;
  } else if (ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] ?? 0) >= 0xe0)) {
    kind = "audio"; format = "mp3"; confidence = 0.95;
  } else if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    if ([".m4a"].includes(extension)) {
      kind = "audio"; format = "m4a";
    } else {
      kind = "video"; format = extension === ".mov" ? "mov" : "mp4";
    }
    confidence = 0.94;
  } else if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (extension === ".docx") { kind = "document"; format = "docx"; }
    else if (extension === ".xlsx") { kind = "spreadsheet"; format = "xlsx"; }
    else if (extension === ".pptx") { kind = "presentation"; format = "pptx"; }
    else { kind = "archive"; format = "zip"; }
    confidence = 0.94;
  }

  const extensionMime = MIME_BY_EXTENSION[extension];
  const mimeType = providedMimeType?.trim() || extensionMime || (
    kind === "text" ? "text/plain" : "application/octet-stream"
  );

  return { kind, format, mimeType, extension, confidence };
}
