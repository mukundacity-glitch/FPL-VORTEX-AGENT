import type {
  AgentRunResult,
  AgentTask,
  ExecutionAttempt,
  ModelResponse,
  ReviewResult,
  TaskPlan,
} from "./types.js";
import { ProviderRouter } from "./provider-router.js";
import { TaskPlanner } from "./task-planner.js";
import type { ModelProvider } from "../providers/model-provider.js";
import type { AnswerReviewer } from "../verification/reviewer.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function maxOutputTokens(plan: TaskPlan): number {
  if (plan.complexity === "complex") return 10_000;
  if (plan.complexity === "moderate") return 6_000;
  return 3_000;
}

function buildSystemPrompt(task: AgentTask, plan: TaskPlan): string {
  return [
    `You are the ${task.agent} agent inside Vortex AI.`,
    `Task domain: ${plan.domain}. Complexity: ${plan.complexity}.`,
    "Use supplied evidence carefully and distinguish facts from inference.",
    "Do not invent unavailable data. State material uncertainty explicitly.",
    "For coding tasks, prefer root-cause fixes and validate side effects.",
    "For analytical tasks, prefer quantified reasoning when evidence supports it.",
    "Return a decisive answer that directly satisfies the objective.",
    "Execution plan:",
    ...plan.steps.map((step, index) => `${index + 1}. ${step}`),
  ].join("\n");
}

function buildUserPrompt(task: AgentTask, critique: readonly string[]): string {
  const sections = [
    `OBJECTIVE: ${task.objective}`,
    `PRIORITY: ${task.priority}`,
    `CONTEXT: ${JSON.stringify(task.context)}`,
  ];

  if (critique.length > 0) {
    sections.push(
      [
        "PREVIOUS ATTEMPT FEEDBACK:",
        ...critique.map((reason) => `- ${reason}`),
        "Produce a corrected answer that directly addresses every material issue above.",
      ].join("\n"),
    );
  }

  return sections.join("\n\n");
}

function noReviewRequired(): ReviewResult {
  return {
    accepted: true,
    score: 1,
    reasons: ["Independent review was not required for this task."],
  };
}

export class TaskOrchestrator {
  public constructor(
    private readonly router: ProviderRouter,
    private readonly reviewer?: AnswerReviewer,
    private readonly planner: TaskPlanner = new TaskPlanner(),
  ) {}

  public async run(task: AgentTask): Promise<AgentRunResult> {
    const plan = this.planner.plan(task);
    const providers = this.router.candidates(plan);
    const attempts: ExecutionAttempt[] = [];
    let critique: string[] = [];
    let lastCandidate: ModelResponse | undefined;
    let lastReview: ReviewResult | undefined;

    for (let attemptNumber = 1; attemptNumber <= plan.maxAttempts; attemptNumber += 1) {
      const provider = providers[(attemptNumber - 1) % providers.length];
      if (!provider) {
        throw new Error("Provider routing produced no candidate provider.");
      }

      const startedAt = new Date().toISOString();
      let candidate: ModelResponse;

      try {
        candidate = await this.generateCandidate(provider, task, plan, critique);
      } catch (error) {
        const completedAt = new Date().toISOString();
        const message = errorMessage(error);
        attempts.push({
          attempt: attemptNumber,
          provider: provider.name,
          startedAt,
          completedAt,
          accepted: false,
          error: message,
        });
        critique = [`Provider ${provider.name} failed: ${message}`];
        continue;
      }

      lastCandidate = candidate;
      let review: ReviewResult;

      if (!task.requireReview) {
        review = noReviewRequired();
      } else if (!this.reviewer) {
        review = {
          accepted: false,
          score: 0,
          reasons: ["Task requires independent review but no reviewer is configured."],
        };
      } else {
        try {
          review = await this.reviewer.review(task, candidate);
        } catch (error) {
          review = {
            accepted: false,
            score: 0,
            reasons: [`Independent reviewer failed: ${errorMessage(error)}`],
          };
        }
      }

      lastReview = review;
      attempts.push({
        attempt: attemptNumber,
        provider: candidate.provider,
        model: candidate.model,
        startedAt,
        completedAt: new Date().toISOString(),
        accepted: review.accepted,
        reviewScore: review.score,
        reviewReasons: [...review.reasons],
      });

      if (review.accepted) {
        return {
          task,
          plan,
          candidate,
          review,
          attempts,
          completedAt: new Date().toISOString(),
        };
      }

      critique = [...review.reasons];
    }

    if (lastCandidate && lastReview) {
      return {
        task,
        plan,
        candidate: lastCandidate,
        review: lastReview,
        attempts,
        completedAt: new Date().toISOString(),
      };
    }

    const failures = attempts
      .map((attempt) => attempt.error)
      .filter((message): message is string => Boolean(message));
    throw new Error(
      failures.length > 0
        ? `All Vortex providers failed: ${failures.join(" | ")}`
        : "All Vortex providers failed without returning a candidate.",
    );
  }

  private async generateCandidate(
    provider: ModelProvider,
    task: AgentTask,
    plan: TaskPlan,
    critique: readonly string[],
  ): Promise<ModelResponse> {
    return provider.generate({
      systemPrompt: buildSystemPrompt(task, plan),
      userPrompt: buildUserPrompt(task, critique),
      maxOutputTokens: maxOutputTokens(plan),
      temperature: plan.domain === "coding" ? 0.1 : 0.2,
    });
  }
}
