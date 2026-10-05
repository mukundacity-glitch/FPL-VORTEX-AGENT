import type { AgentRunResult, AgentTask, ReviewResult } from "./types.js";
import type { ModelProvider } from "../providers/model-provider.js";
import { CrossModelReviewer } from "../verification/cross-model-reviewer.js";

export class TaskOrchestrator {
  public constructor(
    private readonly primary: ModelProvider,
    private readonly reviewer?: CrossModelReviewer,
  ) {}

  public async run(task: AgentTask): Promise<AgentRunResult> {
    if (!task.objective.trim()) {
      throw new Error("Task objective cannot be empty.");
    }

    const candidate = await this.primary.generate({
      systemPrompt: [
        `You are the ${task.agent} agent inside FPL VORTEX AGENT.`,
        "Use supplied evidence carefully. Distinguish facts from inference.",
        "Do not invent unavailable data. Prefer quantified reasoning when the evidence supports it.",
        "Return a decisive answer that directly satisfies the objective.",
      ].join("\n"),
      userPrompt: [
        `OBJECTIVE: ${task.objective}`,
        `PRIORITY: ${task.priority}`,
        `CONTEXT: ${JSON.stringify(task.context)}`,
      ].join("\n\n"),
      maxOutputTokens: task.priority === "deep" ? 8000 : 4000,
    });

    let review: ReviewResult = {
      accepted: true,
      score: 1,
      reasons: ["Cross-model review not required for this task."],
    };

    if (task.requireReview) {
      if (!this.reviewer) {
        throw new Error("Task requires review but no reviewer is configured.");
      }
      review = await this.reviewer.review(task, candidate);
    }

    return {
      task,
      candidate,
      review,
      completedAt: new Date().toISOString(),
    };
  }
}
