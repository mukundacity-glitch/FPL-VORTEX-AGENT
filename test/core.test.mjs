import test from "node:test";
import assert from "node:assert/strict";
import { VortexEngine } from "../dist/core/engine.js";
import { TaskOrchestrator } from "../dist/core/orchestrator.js";
import { CrossModelReviewer } from "../dist/verification/cross-model-reviewer.js";
import { route } from "../dist/agents/registry.js";
import { loadRuntimeConfig } from "../dist/config/runtime.js";
const provider = (name, model, generate) => ({ name, model, generate });
const primary = provider("anthropic", "test-primary", async (req) => ({
  provider: "anthropic",
  model: "test-primary",
  text: req.systemPrompt.includes("Decompose")
    ? JSON.stringify({
        tasks: [{ agent: "documents", objective: "Compare evidence" }],
      })
    : "Grounded answer",
}));
const judge = (answer) =>
  provider("openai", "test-review", async () => ({
    provider: "openai",
    model: "test-review",
    text: JSON.stringify(answer),
  }));
const providers = (review) => ({
  fast: () => primary,
  deep: () => primary,
  coding: () => primary,
  research: () => primary,
  review: () => review,
});
const task = {
  id: "1",
  agent: "general",
  objective: "Answer",
  context: {},
  priority: "deep",
  requireReview: true,
};
test("routes simple, FPL, coding, files and complex requests", () => {
  assert.deepEqual(route("Hello", 0), { agent: "general", priority: "fast" });
  assert.equal(route("Analyze my FPL team", 0).agent, "fpl");
  assert.equal(route("Debug this repository", 0).agent, "coding");
  assert.equal(route("Compare documents", 2).agent, "documents");
  assert.equal(route("Compare documents", 2).priority, "deep");
});
test("fast tasks use only the fast model", async () => {
  const unused = () => {
    throw Error("Should not be called");
  };
  const engine = new VortexEngine({
    fast: () => primary,
    deep: unused,
    coding: unused,
    research: unused,
    review: unused,
  });
  const result = await engine.run("Hello", {});
  assert.equal(result.specialists.length, 0);
  assert.equal(result.answer, "Grounded answer");
});
test("complex tasks plan, analyze and independently verify", async () => {
  const stages = [];
  const engine = new VortexEngine(
    providers(judge({ accepted: true, score: 0.9, reasons: ["Grounded"] })),
  );
  const result = await engine.run(
    "Compare the documents",
    { files: [] },
    3,
    (e) => stages.push(e),
  );
  assert.equal(result.specialists.length, 1);
  assert.equal(result.run.review.accepted, true);
  assert(stages.some((e) => e.stage === "Planner"));
  assert(stages.some((e) => e.stage === "Independent review"));
});
test("rejected candidate is withheld from user answer", async () => {
  const engine = new VortexEngine(
    providers(
      judge({ accepted: false, score: 0.3, reasons: ["Missing evidence"] }),
    ),
  );
  const result = await engine.run("Analyze the evidence", {});
  assert.match(result.answer, /rejected/);
  assert(!result.answer.includes("Grounded answer"));
  assert.equal(result.run.candidate.text, "Grounded answer");
});
test("low reviewer score fails the gate", async () => {
  const reviewer = new CrossModelReviewer(
    judge({ accepted: true, score: 0.2, reasons: [] }),
    0.8,
  );
  assert.equal(
    (
      await reviewer.review(task, {
        provider: "anthropic",
        model: "x",
        text: "answer",
      })
    ).accepted,
    false,
  );
});
test("malformed review fails closed", async () => {
  const reviewer = new CrossModelReviewer(
    provider("openai", "review", async () => ({
      provider: "openai",
      model: "review",
      text: "not JSON",
    })),
    0.8,
  );
  await assert.rejects(
    reviewer.review(task, {
      provider: "anthropic",
      model: "x",
      text: "answer",
    }),
    /invalid JSON/,
  );
});
test("invalid review scores and thresholds rejected", async () => {
  assert.throws(() => new CrossModelReviewer(primary, 2), /threshold/);
  const reviewer = new CrossModelReviewer(
    judge({ accepted: true, score: 2, reasons: [] }),
    0.8,
  );
  await assert.rejects(
    reviewer.review(task, {
      provider: "anthropic",
      model: "x",
      text: "answer",
    }),
    /score/,
  );
});
test("same model cannot independently review itself", async () => {
  const reviewer = new CrossModelReviewer(primary, 0.8);
  const orchestrator = new TaskOrchestrator(primary, reviewer);
  await assert.rejects(orchestrator.run(task), /different provider or model/);
});
test("missing reviewer fails before primary inference", async () => {
  let called = false;
  const p = provider("openai", "test", async () => {
    called = true;
    throw Error("bad");
  });
  await assert.rejects(new TaskOrchestrator(p).run(task), /no reviewer/);
  assert.equal(called, false);
});
test("invalid planner and disabled review stop complex tasks", async () => {
  const broken = provider("anthropic", "planner", async () => ({
    provider: "anthropic",
    model: "planner",
    text: '{"tasks":[]}',
  }));
  await assert.rejects(
    new VortexEngine({
      ...providers(judge({ accepted: true, score: 1, reasons: [] })),
      deep: () => broken,
    }).run("Analyze documents", {}),
    /task budget/,
  );
  await assert.rejects(
    new VortexEngine(providers(primary), 0.8, false).run(
      "Analyze documents",
      {},
    ),
    /Enable/,
  );
});
test("invalid environment configuration rejects", () => {
  const old = process.env.MIN_REVIEW_SCORE;
  process.env.MIN_REVIEW_SCORE = "NaN";
  try {
    assert.throws(() => loadRuntimeConfig(), /between/);
  } finally {
    if (old === undefined) delete process.env.MIN_REVIEW_SCORE;
    else process.env.MIN_REVIEW_SCORE = old;
  }
});

test("planned read-tool evidence reaches specialists and independent judge", async () => {
  const { ToolRegistry } = await import("../dist/tools/registry.js");
  const { z } = await import("zod");
  const tools = new ToolRegistry();
  tools.register({
    name: "evidence.read",
    description: "Read source",
    effect: "read",
    input: z.object({ query: z.string() }),
    execute: async (_, ctx) => ({
      fact: "Verified source fact",
      project: ctx.project,
    }),
  });
  const model = provider("anthropic", "primary", async (req) => ({
    provider: "anthropic",
    model: "primary",
    text: req.systemPrompt.includes("Decompose")
      ? JSON.stringify({
          tasks: [{ agent: "general", objective: "Analyze source" }],
          tools: [{ name: "evidence.read", input: { query: "source" } }],
        })
      : "Source-based answer",
  }));
  let reviewedContext = "";
  const review = provider("openai", "judge", async (req) => {
    reviewedContext = req.userPrompt;
    return {
      provider: "openai",
      model: "judge",
      text: '{"accepted":true,"score":1,"reasons":["grounded"]}',
    };
  });
  const engine = new VortexEngine(
    { ...providers(review), deep: () => model },
    0.8,
    true,
    tools,
  );
  const result = await engine.run("Analyze source", {}, 0, () => {}, {
    owner: "alice",
    project: "private-project",
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(result.run.review.accepted, true);
  assert.match(reviewedContext, /Verified source fact/);
  assert.match(reviewedContext, /private-project/);
});
test("planner cannot execute write tools", async () => {
  const { ToolRegistry } = await import("../dist/tools/registry.js");
  const { z } = await import("zod");
  let called = false;
  const tools = new ToolRegistry();
  tools.register({
    name: "dangerous",
    description: "write",
    effect: "write",
    input: z.object({}),
    execute: async () => {
      called = true;
    },
  });
  const model = provider("anthropic", "primary", async () => ({
    provider: "anthropic",
    model: "primary",
    text: JSON.stringify({
      tasks: [{ agent: "general", objective: "Analyze" }],
      tools: [{ name: "dangerous", input: {} }],
    }),
  }));
  const engine = new VortexEngine(
    {
      ...providers(judge({ accepted: true, score: 1, reasons: [] })),
      deep: () => model,
    },
    0.8,
    true,
    tools,
  );
  await assert.rejects(
    engine.run("Analyze source", {}, 0, () => {}, {
      owner: "alice",
      project: "p",
      signal: AbortSignal.timeout(5000),
    }),
    /write permission/,
  );
  assert.equal(called, false);
});
