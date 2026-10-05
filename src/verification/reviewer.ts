import type { AgentTask, ModelResponse, ReviewResult } from "../core/types.js";

export interface AnswerReviewer {
  review(task: AgentTask, answer: ModelResponse): Promise<ReviewResult>;
}
