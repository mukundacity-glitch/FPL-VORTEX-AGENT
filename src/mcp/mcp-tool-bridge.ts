import type { ToolDefinition } from "../tools/types.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import { McpClientAdapter } from "./mcp-client-adapter.js";

export interface McpToolBridgeOptions {
  namespace: string;
  readOnlyTools?: readonly string[];
}

function asObject(input: unknown): Readonly<Record<string, unknown>> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("MCP tool input must be an object.");
  }
  return input as Readonly<Record<string, unknown>>;
}

export async function registerMcpTools(
  registry: ToolRegistry,
  client: McpClientAdapter,
  options: McpToolBridgeOptions,
): Promise<ToolDefinition[]> {
  const readOnly = new Set(options.readOnlyTools ?? []);
  const remoteTools = await client.listTools();
  const tools = remoteTools.map<ToolDefinition>((remote) => ({
    name: `mcp.${options.namespace}.${remote.name}`,
    description: remote.description,
    permissions: readOnly.has(remote.name)
      ? ["read", "network"]
      : ["network", "external_side_effect"],
    validate: asObject,
    execute: async (input) => {
      const result = await client.callTool(remote.name, input as Readonly<Record<string, unknown>>);
      return {
        ok: !result.isError,
        data: result.content,
        ...(result.isError ? { error: `Remote MCP tool ${remote.name} returned an error.` } : {}),
        metadata: { inputSchema: remote.inputSchema },
      };
    },
  }));

  registry.registerMany(tools);
  return tools;
}
