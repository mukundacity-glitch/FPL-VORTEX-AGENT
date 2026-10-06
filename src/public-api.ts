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
export { createFileAnalysisTool } from "./tools/builtin/file-analysis-tool.js";
export type { FileAnalysisToolOptions } from "./tools/builtin/file-analysis-tool.js";
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

export { detectFileType } from "./files/file-type-detector.js";
export { FileHandlerRegistry } from "./files/file-handler-registry.js";
export { FileIntelligence, DEFAULT_FILE_LIMITS } from "./files/file-intelligence.js";
export type { FileIntelligenceOptions } from "./files/file-intelligence.js";
export { createDefaultFileIntelligence } from "./files/default-file-intelligence.js";
export { FileMemoryBridge } from "./files/file-memory-bridge.js";
export type { FileMemoryCoordinates, FileMemoryIngestResult } from "./files/file-memory-bridge.js";
export { OpenAITranscriptionProvider, OpenAIVisionAnalyzer } from "./files/adapters/openai-media.js";
export type { OpenAITranscriptionOptions, OpenAIVisionOptions } from "./files/adapters/openai-media.js";
export { FfmpegVideoFrameExtractor } from "./files/adapters/ffmpeg-video-frame-extractor.js";
export type { FfmpegVideoFrameExtractorOptions } from "./files/adapters/ffmpeg-video-frame-extractor.js";
export type {
  FileDetection,
  FileExtractionLimits,
  FileHandler,
  FileHandlerContext,
  FileHandlerOutput,
  FileKind,
  FileSection,
  FileSource,
  FileUnderstanding,
  TranscriptionProvider,
  TranscriptionResult,
  TranscriptionSegment,
  VideoFrame,
  VideoFrameExtractor,
  VisionAnalyzer,
  VisionResult,
} from "./files/types.js";

export { FplApiClient } from "./fpl/fpl-api-client.js";
export { FplProjectionEngine } from "./fpl/projection-engine.js";
export type { ProjectionEngineOptions } from "./fpl/projection-engine.js";
export { LineupOptimizer } from "./fpl/lineup-optimizer.js";
export { CaptainEngine } from "./fpl/captain-engine.js";
export type { CaptainMode } from "./fpl/captain-engine.js";
export { TransferOptimizer } from "./fpl/transfer-optimizer.js";
export type { TransferOptimizerOptions } from "./fpl/transfer-optimizer.js";
export { SquadOptimizer } from "./fpl/squad-optimizer.js";
export type { OptimizedSquad, SquadOptimizerOptions } from "./fpl/squad-optimizer.js";
export { ChipPlanner } from "./fpl/chip-planner.js";
export type { ChipPlannerInput } from "./fpl/chip-planner.js";
export { FplMonteCarloSimulator } from "./fpl/simulator.js";
export { PriceTracker } from "./fpl/price-tracker.js";
export { ProjectionBacktester } from "./fpl/backtester.js";
export type { BacktestObservation } from "./fpl/backtester.js";
export { FplDataValidator } from "./fpl/data-validator.js";
export type { FplDataValidation } from "./fpl/data-validator.js";
export { BootstrapNewsSignalProvider, FplSignalAggregator } from "./fpl/signals.js";
export type { FplSignal, FplSignalKind, FplSignalProvider } from "./fpl/signals.js";
export { FplVortexIntelligence } from "./fpl/fpl-intelligence.js";
export type { FplAnalyzeOptions } from "./fpl/fpl-intelligence.js";
export { createFplAnalysisTool } from "./fpl/fpl-tool.js";
export { FplReportMemoryBridge } from "./fpl/fpl-memory-bridge.js";
export type { FplMemoryCoordinates } from "./fpl/fpl-memory-bridge.js";
export { FPL_RULES_2026_27, chipRemaining, freshChipInventory } from "./fpl/rules.js";
export type {
  BacktestResult,
  CaptainCandidate,
  ChipCandidate,
  ChipInventory,
  ChipName,
  ChipPlan,
  FplAnalysisReport,
  FplDataSnapshot,
  FplFixture,
  FplPlayer,
  FplPosition,
  FplSeasonRules,
  FplTeam,
  GameweekInfo,
  HorizonProjection,
  LineupPlan,
  PlayerProjection,
  PriceMovementSignal,
  ProjectionComponents,
  SimulationSummary,
  SquadState,
  TransferMove,
  TransferPlan,
} from "./fpl/types.js";
