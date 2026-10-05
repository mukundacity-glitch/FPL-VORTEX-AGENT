import assert from "node:assert/strict";
import test from "node:test";
import { ToolRegistry } from "../tools/tool-registry.js";
import { ParallelAgentRunner } from "./parallel-agent-runner.js";
import { ToolAgent } from "./tool-agent.js";
import type { AgentAction, AgentBrain, AgentBrainInput, AgentExecutor } from "./types.js";

class ScriptedBrain implements AgentBrain {
  public constructor(private readonly actions: AgentAction[]) {}
  public async next(_input: AgentBrainInput): Promise<AgentAction> {
    const action = this.actions.shift();
    if (!action) throw new Error("No scripted action remains.");
    return action;
  }
}

test("agent uses an allowed tool then returns a final answer", async () => {
  const registry = new ToolRegistry();
  registry.register({
    name: "read.echo",
    description: "echo",
    permissions: ["read"],
    execute: async (input) => ({ ok: true, data: input }),
  });

  const agent = new ToolAgent(
    {
      id: "researcher",
      name: "Researcher",
      description: "test agent",
      systemPrompt: "Work carefully.",
      allowedTools: ["read.echo"],
      maxToolCalls: 2,
    },
    new ScriptedBrain([
      { type: "tool", tool: "read.echo", input: { value: 7 } },
      { type: "final", answer: "done" },
    ]),
    registry,
  );

  const result = await agent.run({ objective: "test" });
  assert.equal(result.status, "success");
  assert.equal(result.answer, "done");
  assert.equal(result.steps.length, 1);
});

test("agent cannot call a tool outside its allowlist", async () => {
  const registry = new ToolRegistry();
  registry.register({
    name: "read.echo",
    description: "echo",
    permissions: ["read"],
    execute: async () => ({ ok: true }),
  });
  const agent = new ToolAgent(
    {
      id: "limited",
      name: "Limited",
      description: "test",
      systemPrompt: "test",
      allowedTools: [],
      maxToolCalls: 1,
    },
    new ScriptedBrain([{ type: "tool", tool: "read.echo", input: {} }]),
    registry,
  );
  const result = await agent.run({ objective: "test" });
  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /disallowed/u);
});

test("parallel runner preserves request order", async () => {
  const makeAgent = (id: string, delay: number): AgentExecutor => ({
    run: async () => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return { agentId: id, status: "success", answer: id, steps: [] };
    },
  });
  const runner = new ParallelAgentRunner(2);
  const results = await runner.runAll([
    { agent: makeAgent("first", 20), input: { objective: "a" } },
    { agent: makeAgent("second", 1), input: { objective: "b" } },
  ]);
  assert.deepEqual(results.map((result) => result.agentId), ["first", "second"]);
});
