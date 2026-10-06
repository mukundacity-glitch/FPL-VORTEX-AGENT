# MarkItDown sidecar

This private sidecar adds Microsoft MarkItDown document conversion to Vortex AI through MCP.

## Start locally

```bash
docker compose -f docker-compose.markitdown.yml up --build -d
```

Then configure Vortex:

```bash
VORTEX_MARKITDOWN_MCP_URL=http://127.0.0.1:3001/mcp
VORTEX_MARKITDOWN_MAX_BYTES=26214400
```

Vortex sends uploaded PDF, Word, Excel, and PowerPoint content to MarkItDown as in-memory `data:` URIs. The sidecar is only published on host loopback by the provided Compose file. Do not expose this unauthenticated MCP service directly to the public Internet.

If MarkItDown is unavailable or rejects a file, Vortex automatically falls back to its built-in file handlers.
