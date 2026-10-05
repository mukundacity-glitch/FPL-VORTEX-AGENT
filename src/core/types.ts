export type ProviderName = "openai" | "anthropic";

export type AgentPriority = "fast" | "balanced" | "deep";

export interface AgentTask {
  id: string;
  agent: string;
  objective: string;
  context: Readonly<Record<string, unknown>>;
  priority: AgentPriority;
  requireReview: boolean;
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

export interface AgentRunResult {
  task: AgentTask;
  candidate: ModelResponse;
  review: ReviewResult;
  completedAt: string;
}
