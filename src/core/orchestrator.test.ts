import assert from "node:assert/strict";
import test from "node:test";
import type {
  AgentTask,
  ModelRequest,
  ModelResponse,
  ProviderName,
  ReviewResult,
} from "./types.js";
import { ProviderPool } from "./provider-pool.js";
import { ProviderRouter } from "./provider-router.js";
import { TaskOrchestrator } from "./orchestrator.js";
import { TaskPlanner } from "./task-planner.js";
import type { ModelProvider } from "../providers/model-provider.js";
import type { AnswerReviewer } from "../verification/reviewer.js";

class FakeProvider implements ModelProvider {
  public readonly requests: ModelRequest[] = [];

  public constructor(
    public readonly name: ProviderName,
    public readonly model: string,
    private readonly outcomes: Array<string | Error>,
  ) {}

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    const outcome = this.outcomes.shift();
    if (outcome instanceof Error) throw outcome;
    if (typeof outcome !== "string") {
      throw new Error(`No fake outcome configured for ${this.name}.`);
    }
    return {
      provider: this.name,
      model: this.model,
      text: outcome,
    };
  }
}

class SequenceReviewer implements AnswerReviewer {
  public constructor(private readonly reviews: ReviewResult[]) {}

  public async review(): Promise<ReviewResult> {
    const review = this.reviews.shift();
    if (!review) throw new Error("No fake review configured.");
    return review;
  }
}

function codingTask(): AgentTask {
  return {
    id: "task-code",
    agent: "coding-agent",
    objective: "Debug the repository and implement the root-cause fix.",
    context: {},
    priority: "balanced",
    requireReview: true,
  };
}

test("rejected first answer falls back to another provider with critique", async () => {
  const openai = new FakeProvider("openai", "codex-test", ["first answer"]);
  const anthropic = new FakeProvider("anthropic", "claude-test", ["corrected answer"]);
  const router = new ProviderRouter(new ProviderPool([openai, anthropic]));
  const reviewer = new SequenceReviewer([
    { accepted: false, score: 0.55, reasons: ["Missing regression test coverage."] },
    { accepted: true, score: 0.96, reasons: ["Correct and verified."] },
  ]);

  const orchestrator = new TaskOrchestrator(
    router,
    reviewer,
    new TaskPlanner("anthropic"),
  );
  const result = await orchestrator.run(codingTask());

  assert.equal(result.review.accepted, true);
  assert.equal(result.candidate.provider, "anthropic");
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0]?.provider, "openai");
  assert.equal(result.attempts[1]?.provider, "anthropic");
  assert.match(
    anthropic.requests[0]?.userPrompt ?? "",
    /Missing regression test coverage/u,
  );
});

test("provider execution failure falls back instead of aborting task", async () => {
  const openai = new FakeProvider("openai", "codex-test", [new Error("sandbox unavailable")]);
  const anthropic = new FakeProvider("anthropic", "claude-test", ["fallback answer"]);
  const router = new ProviderRouter(new ProviderPool([openai, anthropic]));
  const reviewer = new SequenceReviewer([
    { accepted: true, score: 0.91, reasons: ["Fallback answer is valid."] },
  ]);

  const orchestrator = new TaskOrchestrator(router, reviewer);
  const result = await orchestrator.run(codingTask());

  assert.equal(result.candidate.provider, "anthropic");
  assert.equal(result.attempts.length, 2);
  assert.match(result.attempts[0]?.error ?? "", /sandbox unavailable/u);
  assert.equal(result.attempts[1]?.accepted, true);
});
