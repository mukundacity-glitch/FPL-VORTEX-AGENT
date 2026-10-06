import { McpClientAdapter } from "../../mcp/mcp-client-adapter.js";
import type {
  FileDetection,
  FileSource,
  MarkdownConversionProvider,
  MarkdownConversionResult,
} from "../types.js";

export interface MarkItDownMcpConverterOptions {
  url: string;
  maxBytes?: number;
  toolName?: string;
}

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const SUPPORTED_KINDS = new Set(["document", "spreadsheet", "presentation"]);

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) throw new Error("MarkItDown MCP returned an unsupported response shape.");

  const text = content
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      if (!("text" in item) || typeof item.text !== "string") return "";
      return item.text;
    })
    .filter(Boolean)
    .join("\n\n");

  if (!text.trim()) throw new Error("MarkItDown MCP returned no Markdown text.");
  return text;
}

export class MarkItDownMcpConverter implements MarkdownConversionProvider {
  private readonly client: McpClientAdapter;
  private readonly maxBytes: number;
  private readonly toolName: string;

  public constructor(private readonly options: MarkItDownMcpConverterOptions) {
    const url = options.url.trim();
    if (!url) throw new Error("MarkItDown MCP URL is required.");
    this.client = new McpClientAdapter({ url, name: "vortex-markitdown", version: "0.1.0" });
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.toolName = options.toolName ?? "convert_to_markdown";
  }

  public supports(detection: FileDetection): boolean {
    return SUPPORTED_KINDS.has(detection.kind);
  }

  public async convert(source: FileSource, detection: FileDetection): Promise<MarkdownConversionResult> {
    if (source.bytes.length > this.maxBytes) {
      throw new Error(`File exceeds MarkItDown maxBytes=${this.maxBytes}.`);
    }

    const mediaType = detection.mimeType || source.mimeType || "application/octet-stream";
    const uri = `data:${mediaType};base64,${source.bytes.toString("base64")}`;
    const result = await this.client.callTool(this.toolName, { uri });
    if (result.isError) throw new Error("MarkItDown MCP reported a conversion error.");

    return {
      text: extractTextContent(result.content),
      metadata: {
        converter: "microsoft/markitdown-mcp",
        transport: "streamable-http",
        inputMimeType: mediaType,
      },
    };
  }

  public async close(): Promise<void> {
    await this.client.close();
  }
}
