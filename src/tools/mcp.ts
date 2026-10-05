import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
// Only administrator-configured servers and exact tool allowlists are accepted.
export async function callMcp(
  url: string,
  allowlist: readonly string[],
  name: string,
  args: Record<string, unknown>,
  token?: string,
): Promise<unknown> {
  if (!allowlist.includes(name))
    throw new Error("MCP tool is not allowlisted.");
  const endpoint = new URL(url);
  if (
    endpoint.protocol !== "https:" &&
    endpoint.hostname !== "localhost" &&
    endpoint.hostname !== "127.0.0.1"
  )
    throw new Error("MCP requires HTTPS.");
  // SDK transport declares sessionId as string | undefined, unlike its Transport interface under exact optional types.
  const client = new Client({ name: "vortex-ai", version: "0.2.0" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(
        endpoint,
        token
          ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } }
          : {},
      ) as unknown as Transport,
    );
    return await client.callTool({ name, arguments: args }, undefined, {
      timeout: 30000,
    });
  } finally {
    await client.close();
  }
}
