import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { detectFileType } from "./file-type-detector.js";
import { FileHandlerRegistry } from "./file-handler-registry.js";
import type {
  FileExtractionLimits,
  FileHandlerContext,
  FileSource,
  FileUnderstanding,
  MarkdownConversionProvider,
  TranscriptionProvider,
  VideoFrameExtractor,
  VisionAnalyzer,
} from "./types.js";

export const DEFAULT_FILE_LIMITS: FileExtractionLimits = {
  maxFileBytes: 100 * 1024 * 1024,
  maxTextCharacters: 4_000_000,
  maxArchiveDepth: 3,
  maxArchiveEntries: 250,
  maxExpandedArchiveBytes: 300 * 1024 * 1024,
  maxVideoFrames: 8,
};

export interface FileIntelligenceOptions {
  limits?: Partial<FileExtractionLimits>;
  markdownConverter?: MarkdownConversionProvider;
  transcriber?: TranscriptionProvider;
  vision?: VisionAnalyzer;
  videoFrames?: VideoFrameExtractor;
}

interface AnalysisState {
  depth: number;
  archiveEntries: number;
  expandedArchiveBytes: number;
}

function clampText(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit), truncated: true };
}

function fileId(name: string, bytes: Buffer): string {
  return createHash("sha256").update(name).update("\0").update(bytes).digest("hex");
}

export class FileIntelligence {
  private readonly limits: FileExtractionLimits;
  private readonly markdownConverter: MarkdownConversionProvider | undefined;
  private readonly transcriber: TranscriptionProvider | undefined;
  private readonly vision: VisionAnalyzer | undefined;
  private readonly videoFrames: VideoFrameExtractor | undefined;

  public constructor(
    public readonly registry: FileHandlerRegistry,
    options: FileIntelligenceOptions = {},
  ) {
    this.limits = { ...DEFAULT_FILE_LIMITS, ...(options.limits ?? {}) };
    this.markdownConverter = options.markdownConverter;
    this.transcriber = options.transcriber;
    this.vision = options.vision;
    this.videoFrames = options.videoFrames;
  }

  public async analyzePath(filePath: string, mimeType?: string): Promise<FileUnderstanding> {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error(`${filePath} is not a regular file.`);
    if (info.size > this.limits.maxFileBytes) {
      throw new Error(`File exceeds maxFileBytes=${this.limits.maxFileBytes}.`);
    }
    const bytes = await readFile(filePath);
    const source: FileSource = {
      name: path.basename(filePath),
      bytes,
      path: filePath,
      ...(mimeType ? { mimeType } : {}),
    };
    return await this.analyze(source);
  }

  public async analyze(source: FileSource): Promise<FileUnderstanding> {
    return await this.analyzeInternal(source, {
      depth: 0,
      archiveEntries: 0,
      expandedArchiveBytes: source.bytes.length,
    });
  }

  private async analyzeInternal(source: FileSource, state: AnalysisState): Promise<FileUnderstanding> {
    if (source.bytes.length > this.limits.maxFileBytes) {
      throw new Error(`File ${source.name} exceeds maxFileBytes=${this.limits.maxFileBytes}.`);
    }
    if (state.depth > this.limits.maxArchiveDepth) {
      throw new Error(`Archive recursion exceeds maxArchiveDepth=${this.limits.maxArchiveDepth}.`);
    }

    const detection = detectFileType(source.name, source.bytes, source.mimeType);
    const warnings: string[] = [];

    if (this.markdownConverter?.supports(detection)) {
      try {
        const converted = await this.markdownConverter.convert(source, detection);
        const clamped = clampText(converted.text, this.limits.maxTextCharacters);
        if (clamped.truncated) {
          warnings.push(`Extracted text truncated at ${this.limits.maxTextCharacters} characters.`);
        }
        return {
          id: fileId(source.name, source.bytes),
          name: source.name,
          kind: detection.kind,
          format: detection.format,
          mimeType: detection.mimeType,
          sizeBytes: source.bytes.length,
          text: clamped.text,
          sections: [{ id: "markdown", title: "Converted Markdown", kind: "markdown", text: clamped.text }],
          metadata: {
            detectionConfidence: detection.confidence,
            handler: "markdown-converter",
            ...(converted.metadata ?? {}),
          },
          warnings,
          children: [],
        };
      } catch (error) {
        warnings.push(
          `Preferred Markdown conversion failed; used built-in fallback: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const handler = this.registry.resolve(detection);
    if (!handler) {
      return {
        id: fileId(source.name, source.bytes),
        name: source.name,
        kind: detection.kind,
        format: detection.format,
        mimeType: detection.mimeType,
        sizeBytes: source.bytes.length,
        text: "",
        sections: [],
        metadata: { detectionConfidence: detection.confidence },
        warnings: [...warnings, `No file handler is registered for ${detection.kind}/${detection.format}.`],
        children: [],
      };
    }

    const context: FileHandlerContext = {
      detection,
      depth: state.depth,
      limits: this.limits,
      ...(this.transcriber ? { transcriber: this.transcriber } : {}),
      ...(this.vision ? { vision: this.vision } : {}),
      ...(this.videoFrames ? { videoFrames: this.videoFrames } : {}),
      analyzeChild: async (name, bytes, mimeType) => {
        const nextEntries = state.archiveEntries + 1;
        const nextExpanded = state.expandedArchiveBytes + bytes.length;
        if (nextEntries > this.limits.maxArchiveEntries) {
          throw new Error(`Archive exceeds maxArchiveEntries=${this.limits.maxArchiveEntries}.`);
        }
        if (nextExpanded > this.limits.maxExpandedArchiveBytes) {
          throw new Error(`Archive exceeds maxExpandedArchiveBytes=${this.limits.maxExpandedArchiveBytes}.`);
        }
        state.archiveEntries = nextEntries;
        state.expandedArchiveBytes = nextExpanded;
        return await this.analyzeInternal(
          { name, bytes, ...(mimeType ? { mimeType } : {}) },
          { ...state, depth: state.depth + 1 },
        );
      },
    };

    const extracted = await handler.extract(source, context);
    const clamped = clampText(extracted.text ?? "", this.limits.maxTextCharacters);
    if (clamped.truncated) warnings.push(`Extracted text truncated at ${this.limits.maxTextCharacters} characters.`);

    return {
      id: fileId(source.name, source.bytes),
      name: source.name,
      kind: detection.kind,
      format: detection.format,
      mimeType: detection.mimeType,
      sizeBytes: source.bytes.length,
      text: clamped.text,
      sections: extracted.sections ?? [],
      metadata: {
        detectionConfidence: detection.confidence,
        handler: handler.id,
        ...(extracted.metadata ?? {}),
      },
      warnings: [...warnings, ...(extracted.warnings ?? [])],
      children: extracted.children ?? [],
    };
  }
}
