export { createVortexCore, VortexCore } from "./core/vortex-core.js";
export { ProviderPool } from "./core/provider-pool.js";
export { ProviderRouter } from "./core/provider-router.js";
export { TaskPlanner } from "./core/task-planner.js";
export type {
  AgentPriority,
  AgentRunResult,
  AgentTask,
  ExecutionAttempt,
  ModelRequest,
  ModelResponse,
  ProviderName,
  ReviewResult,
  TaskComplexity,
  TaskDomain,
  TaskPlan,
} from "./core/types.js";
export type { ModelProvider } from "./providers/model-provider.js";
export type { AnswerReviewer } from "./verification/reviewer.js";

export { PermissionPolicyEngine } from "./tools/permission-policy.js";
export type { PermissionMode, PermissionPolicy, PermissionEvaluation } from "./tools/permission-policy.js";
export { ToolRegistry } from "./tools/tool-registry.js";
export type {
  AnyToolDefinition,
  ApprovalDecision,
  ApprovalHandler,
  ApprovalRequest,
  ToolContext,
  ToolDefinition,
  ToolPermission,
  ToolResult,
} from "./tools/types.js";
export { createCodeExecutionTool } from "./tools/builtin/code-execution-tool.js";
export { createBrowserTools } from "./tools/adapters/browser-tools.js";
export { createGitHubTools, GitHubRestClient } from "./tools/adapters/github-tools.js";
export type { GitHubClientOptions } from "./tools/adapters/github-tools.js";

export { SubprocessSandbox } from "./sandbox/subprocess-sandbox.js";
export type {
  SandboxExecutor,
  SandboxRequest,
  SandboxResult,
} from "./sandbox/types.js";

export { McpClientAdapter } from "./mcp/mcp-client-adapter.js";
export { registerMcpTools } from "./mcp/mcp-tool-bridge.js";
export type {
  McpClientOptions,
  McpRemoteTool,
  McpToolCallResult,
} from "./mcp/mcp-client-adapter.js";
export type { McpToolBridgeOptions } from "./mcp/mcp-tool-bridge.js";

export { ModelAgentBrain } from "./agents/model-agent-brain.js";
export { ParallelAgentRunner } from "./agents/parallel-agent-runner.js";
export { ToolAgent } from "./agents/tool-agent.js";
export { VortexAgentRuntime } from "./agents/vortex-agent-runtime.js";
export type { VortexAgentRuntimeOptions } from "./agents/vortex-agent-runtime.js";
export type {
  AgentAction,
  AgentBrain,
  AgentBrainInput,
  AgentContextEnricher,
  AgentDefinition,
  AgentExecutionResult,
  AgentExecutor,
  AgentHistoryEntry,
  AgentMemoryContext,
  AgentRunInput,
  AgentStep,
} from "./agents/types.js";
export type { ParallelAgentRequest } from "./agents/parallel-agent-runner.js";

export { InMemoryMemoryStore } from "./memory/memory-store.js";
export type { MemoryStore } from "./memory/memory-store.js";
export { JsonMemoryStore } from "./memory/json-memory-store.js";
export {
  LocalTokenEmbeddingProvider,
  OpenAIEmbeddingProvider,
} from "./memory/embedding-provider.js";
export type { EmbeddingProvider } from "./memory/embedding-provider.js";
export { MemoryRetriever } from "./memory/memory-retriever.js";
export { VortexMemory } from "./memory/vortex-memory.js";
export { KnowledgeIngestor } from "./memory/knowledge-ingestor.js";
export type { KnowledgeIngestorOptions } from "./memory/knowledge-ingestor.js";
export { MemoryContextEnricher } from "./memory/memory-context-enricher.js";
export {
  AgentExperienceRecorder,
  ConversationMemoryRecorder,
} from "./memory/memory-recorders.js";
export type {
  AgentExperienceInput,
  ConversationTurnInput,
} from "./memory/memory-recorders.js";
export type {
  KnowledgeDocument,
  KnowledgeIngestResult,
  MemoryAddress,
  MemoryContextOptions,
  MemoryFilter,
  MemoryQuery,
  MemoryRecord,
  MemoryScope,
  MemorySearchResult,
  MemoryWriteInput,
} from "./memory/types.js";
