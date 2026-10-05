import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

export interface McpClientOptions {
  url: string;
  name?: string;
  version?: string;
}

export interface McpRemoteTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface McpToolCallResult {
  content: unknown;
  isError: boolean;
}

export class McpClientAdapter {
  private readonly client: Client;
  private connected = false;

  public constructor(private readonly options: McpClientOptions) {
    this.client = new Client({
      name: options.name ?? "vortex-ai",
      version: options.version ?? "0.2.0",
    });
  }

  public async connect(): Promise<void> {
    if (this.connected) return;
    await this.client.connect(new StreamableHTTPClientTransport(new URL(this.options.url)));
    this.connected = true;
  }

  public async listTools(): Promise<McpRemoteTool[]> {
    await this.connect();
    const result = await this.client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "Remote MCP tool",
      inputSchema: tool.inputSchema,
    }));
  }

  public async callTool(name: string, args: Readonly<Record<string, unknown>>): Promise<McpToolCallResult> {
    await this.connect();
    const result = await this.client.callTool({ name, arguments: { ...args } });
    return {
      content: result.content,
      isError: result.isError === true,
    };
  }

  public async close(): Promise<void> {
    if (!this.connected) return;
    await this.client.close();
    this.connected = false;
  }
}
