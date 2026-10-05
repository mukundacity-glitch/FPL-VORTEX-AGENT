import assert from "node:assert/strict";
import test from "node:test";
import { ToolRegistry } from "./tool-registry.js";

const context = { taskId: "task-1", agentId: "agent-1" };

test("read tool runs automatically", async () => {
  const registry = new ToolRegistry();
  registry.register({
    name: "read.echo",
    description: "echo",
    permissions: ["read"],
    execute: async (input) => ({ ok: true, data: input }),
  });
  const result = await registry.execute("read.echo", { value: 1 }, context);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { value: 1 });
});

test("privileged tool is blocked without approval", async () => {
  const registry = new ToolRegistry();
  registry.register({
    name: "change.test",
    description: "change",
    permissions: ["write"],
    execute: async () => ({ ok: true }),
  });
  const result = await registry.execute("change.test", {}, context);
  assert.equal(result.ok, false);
  assert.equal(result.metadata?.approvalRequired, true);
});

test("approval handler can allow a privileged call", async () => {
  let approvals = 0;
  const registry = new ToolRegistry(undefined, () => {
    approvals += 1;
    return "allow_once";
  });
  registry.register({
    name: "change.test",
    description: "change",
    permissions: ["write"],
    execute: async () => ({ ok: true, data: "done" }),
  });
  const result = await registry.execute("change.test", {}, context);
  assert.equal(result.ok, true);
  assert.equal(result.data, "done");
  assert.equal(approvals, 1);
});
