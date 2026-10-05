import assert from "node:assert/strict";
import test from "node:test";
import type { AgentTask } from "./types.js";
import { TaskPlanner } from "./task-planner.js";

function task(objective: string, overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-1",
    agent: "vortex-general-reasoner",
    objective,
    context: {},
    priority: "fast",
    requireReview: true,
    ...overrides,
  };
}

test("coding tasks prefer OpenAI/Codex", () => {
  const plan = new TaskPlanner("anthropic").plan(
    task("Debug this TypeScript repository and implement the root-cause fix."),
  );

  assert.equal(plan.domain, "coding");
  assert.equal(plan.preferredProvider, "openai");
  assert.equal(plan.fallbackProvider, "anthropic");
});

test("FPL tasks prefer Anthropic deep reasoning", () => {
  const plan = new TaskPlanner("openai").plan(
    task("Compare my FPL captain options for the next gameweek."),
  );

  assert.equal(plan.domain, "fpl");
  assert.equal(plan.preferredProvider, "anthropic");
});

test("general tasks honor the configured default provider", () => {
  const plan = new TaskPlanner("openai").plan(task("Explain this idea clearly."));

  assert.equal(plan.domain, "general");
  assert.equal(plan.preferredProvider, "openai");
});
