# Phase 2 — Tool + Agent Framework

Phase 2 turns Vortex Core into an execution platform instead of a model-only orchestrator.

## What is included

- Typed tool registry with duplicate protection and input validation.
- Permission policy with five capabilities: `read`, `network`, `write`, `execute`, and `external_side_effect`.
- Conservative defaults: reads/network may run automatically; writes, code execution, and external changes require approval.
- Allowlisted subprocess sandbox with workspace confinement, no shell interpolation, timeouts, and output caps.
- `code.execute` tool backed by the sandbox.
- Browser tool adapter for `agent-browser` sessions: open, snapshot, click, and fill.
- GitHub REST adapter with repository allowlisting, read-file, and create-issue tools.
- MCP v2 client using `@modelcontextprotocol/client`, with Streamable HTTP transport.
- MCP bridge that imports remote tools into the same Vortex registry.
- Remote MCP tools are treated as side-effecting by default unless explicitly marked read-only.
- Provider-neutral model brain that chooses a tool call or final answer through a strict JSON action contract.
- Bounded agent tool loop with per-agent tool allowlists and maximum tool-call limits.
- Parallel agent runner with bounded concurrency and stable result ordering.
- `VortexAgentRuntime` composition API for future web/API layers.

## Safety model

Every tool call passes through the same path:

```text
Agent
  ↓
Allowed-tool check
  ↓
Tool registry
  ↓
Permission policy
  ↓
Approval gate (when required)
  ↓
Input validation
  ↓
Tool adapter / sandbox / MCP
  ↓
Observation returned to agent
```

A model never receives direct shell, GitHub, browser, or MCP authority. Authority is granted to tools, and tools are constrained independently of the model.

## Browser and code execution

The browser adapter expects the `agent-browser` executable to be installed in the runtime that enables browser tools. The sandbox must explicitly allow `agent-browser` before those tools can run.

Code execution is also opt-in: the deployment chooses the allowed executable list and workspace root. Commands are spawned directly with `shell: false`.

## GitHub

`GitHubRestClient` requires a token supplied at runtime and an explicit repository allowlist. Secrets must come from environment/deployment secret storage and must never be committed.

## MCP

Phase 2 targets the current split MCP TypeScript client package rather than the older monolithic SDK. A remote MCP server can expose new tools dynamically; imported tools still pass through Vortex permissions and approvals.

## What Phase 2 intentionally does not do

- It does not give models unrestricted operating-system access.
- It does not automatically approve writes or external actions.
- It does not provide persistent memory yet; that is Phase 3.
- It does not expose the browser chat UI yet; that comes after memory/file infrastructure.
- It does not assume one model provider. Claude, OpenAI/Codex, and future providers can drive the same agent loop.

## Next phase

Phase 3 is the persistent memory and project knowledge layer: conversations, project-scoped memory, retrieval, artifact/file knowledge, agent learning records, and safe memory boundaries.
