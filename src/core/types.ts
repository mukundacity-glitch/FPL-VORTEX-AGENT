export type ProviderName = "openai" | "anthropic";

export type AgentPriority = "fast" | "balanced" | "deep";
export type TaskDomain = "general" | "coding" | "research" | "analysis" | "fpl";
export type TaskComplexity = "simple" | "moderate" | "complex";

export interface AgentTask {
  id: string;
  agent: string;
  objective: string;
  context: Readonly<Record<string, unknown>>;
  priority: AgentPriority;
  requireReview: boolean;
  domain?: TaskDomain;
}

export interface ModelRequest {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface ModelResponse {
  provider: ProviderName;
  model: string;
  text: string;
  requestId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface ReviewResult {
  accepted: boolean;
  score: number;
  reasons: string[];
  reviewer?: ModelResponse;
}

export interface TaskPlan {
  domain: TaskDomain;
  complexity: TaskComplexity;
  preferredProvider: ProviderName;
  fallbackProvider: ProviderName;
  steps: string[];
  maxAttempts: number;
}

export interface ExecutionAttempt {
  attempt: number;
  provider: ProviderName;
  model?: string;
  startedAt: string;
  completedAt: string;
  accepted: boolean;
  error?: string;
  reviewScore?: number;
  reviewReasons?: string[];
}

export interface AgentRunResult {
  task: AgentTask;
  plan: TaskPlan;
  candidate: ModelResponse;
  review: ReviewResult;
  attempts: ExecutionAttempt[];
  completedAt: string;
}
