export type FileKind =
  | "text"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "archive"
  | "image"
  | "audio"
  | "video"
  | "unknown";

export interface FileDetection {
  kind: FileKind;
  format: string;
  mimeType: string;
  extension: string;
  confidence: number;
}

export interface FileSource {
  name: string;
  bytes: Buffer;
  mimeType?: string;
  path?: string;
}

export interface FileSection {
  id: string;
  title?: string;
  text: string;
  kind?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface FileUnderstanding {
  id: string;
  name: string;
  kind: FileKind;
  format: string;
  mimeType: string;
  sizeBytes: number;
  text: string;
  sections: readonly FileSection[];
  metadata: Readonly<Record<string, unknown>>;
  warnings: readonly string[];
  children: readonly FileUnderstanding[];
}

export interface FileHandlerOutput {
  text?: string;
  sections?: readonly FileSection[];
  metadata?: Readonly<Record<string, unknown>>;
  warnings?: readonly string[];
  children?: readonly FileUnderstanding[];
}

export interface FileExtractionLimits {
  maxFileBytes: number;
  maxTextCharacters: number;
  maxArchiveDepth: number;
  maxArchiveEntries: number;
  maxExpandedArchiveBytes: number;
  maxVideoFrames: number;
}

export interface FileHandlerContext {
  detection: FileDetection;
  depth: number;
  limits: FileExtractionLimits;
  analyzeChild(name: string, bytes: Buffer, mimeType?: string): Promise<FileUnderstanding>;
  transcriber?: TranscriptionProvider;
  vision?: VisionAnalyzer;
  videoFrames?: VideoFrameExtractor;
}

export interface FileHandler {
  readonly id: string;
  supports(detection: FileDetection): boolean;
  extract(source: FileSource, context: FileHandlerContext): Promise<FileHandlerOutput>;
}

export interface TranscriptionSegment {
  startSeconds?: number;
  endSeconds?: number;
  speaker?: string;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  durationSeconds?: number;
  segments?: readonly TranscriptionSegment[];
  metadata?: Readonly<Record<string, unknown>>;
}

export interface TranscriptionProvider {
  transcribe(source: FileSource): Promise<TranscriptionResult>;
}

export interface VisionResult {
  text: string;
  tags?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
}

export interface VisionAnalyzer {
  analyzeImage(source: FileSource, prompt?: string): Promise<VisionResult>;
}

export interface VideoFrame {
  timestampSeconds: number;
  source: FileSource;
}

export interface VideoFrameExtractor {
  extract(source: FileSource, maxFrames: number): Promise<readonly VideoFrame[]>;
}
