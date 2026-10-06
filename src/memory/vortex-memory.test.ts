import assert from "node:assert/strict";
import test from "node:test";
import { LocalTokenEmbeddingProvider } from "./embedding-provider.js";
import { InMemoryMemoryStore } from "./memory-store.js";
import { VortexMemory } from "./vortex-memory.js";

function createMemory(): VortexMemory {
  return new VortexMemory(
    new InMemoryMemoryStore(),
    new LocalTokenEmbeddingProvider(128),
  );
}

test("memory is isolated by tenant and project", async () => {
  const memory = createMemory();
  await memory.remember({
    tenantId: "tenant-a",
    namespace: "vortex",
    scope: "project",
    projectId: "project-a",
    content: "The deployment target is a private staging environment.",
    tags: ["deployment"],
  });
  await memory.remember({
    tenantId: "tenant-b",
    namespace: "vortex",
    scope: "project",
    projectId: "project-b",
    content: "The deployment target is public production.",
    tags: ["deployment"],
  });

  const results = await memory.recall({
    tenantId: "tenant-a",
    namespace: "vortex",
    scopes: ["project"],
    projectId: "project-a",
    text: "deployment target",
  });

  assert.equal(results.length, 1);
  assert.match(results[0]?.record.content ?? "", /private staging/u);
});

test("remember deduplicates equivalent content in the same address", async () => {
  const memory = createMemory();
  const first = await memory.remember({
    tenantId: "tenant-a",
    namespace: "vortex",
    scope: "global",
    content: "Prefer concise answers.",
    tags: ["preference"],
    importance: 0.4,
  });
  const second = await memory.remember({
    tenantId: "tenant-a",
    namespace: "vortex",
    scope: "global",
    content: "  prefer   concise answers.  ",
    tags: ["style"],
    importance: 0.9,
  });

  assert.equal(second.id, first.id);
  assert.deepEqual(second.tags, ["preference", "style"]);
  assert.equal(second.importance, 0.9);
});

test("hybrid retrieval ranks relevant memory above unrelated memory", async () => {
  const memory = createMemory();
  await memory.remember({
    tenantId: "tenant-a",
    namespace: "vortex",
    scope: "global",
    content: "The preferred database for production is PostgreSQL.",
    importance: 0.8,
  });
  await memory.remember({
    tenantId: "tenant-a",
    namespace: "vortex",
    scope: "global",
    content: "The design system uses rounded cards and compact spacing.",
    importance: 0.8,
  });

  const results = await memory.recall({
    tenantId: "tenant-a",
    namespace: "vortex",
    scopes: ["global"],
    text: "Which production database should we use?",
    limit: 2,
  });

  assert.match(results[0]?.record.content ?? "", /PostgreSQL/u);
});
