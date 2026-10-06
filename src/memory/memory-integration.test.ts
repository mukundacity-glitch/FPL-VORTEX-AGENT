import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { AgentDefinition, AgentRunInput } from "../agents/types.js";
import { JsonMemoryStore } from "./json-memory-store.js";
import { KnowledgeIngestor } from "./knowledge-ingestor.js";
import { MemoryContextEnricher } from "./memory-context-enricher.js";
import { VortexMemory } from "./vortex-memory.js";

test("JSON memory store persists records across instances", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vortex-memory-"));
  const file = join(directory, "memory.json");
  try {
    const first = new VortexMemory(new JsonMemoryStore(file));
    const record = await first.remember({
      tenantId: "tenant-a",
      namespace: "vortex",
      scope: "global",
      content: "Persistent memory survives a process restart.",
    });

    const second = new VortexMemory(new JsonMemoryStore(file));
    const loaded = await second.get("tenant-a", record.id);
    assert.equal(loaded?.content, record.content);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("knowledge ingestor chunks long file knowledge", async () => {
  const memory = new VortexMemory(new JsonMemoryStore(join(await mkdtemp(join(tmpdir(), "vortex-ingest-")), "memory.json")));
  const ingestor = new KnowledgeIngestor(memory, { chunkCharacters: 600, overlapCharacters: 60 });
  const content = Array.from({ length: 30 }, (_, index) => `Paragraph ${index}: Vortex file knowledge section with useful facts.`).join("\n\n");
  const result = await ingestor.ingest({
    tenantId: "tenant-a",
    namespace: "vortex",
    scope: "file",
    fileId: "file-1",
    projectId: "project-a",
    content,
    source: "sample.txt",
  });
  assert.ok(result.chunks > 1);
  assert.equal(result.memoryIds.length, result.chunks);
});

test("context enricher combines only requested scoped memories", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vortex-context-"));
  try {
    const memory = new VortexMemory(new JsonMemoryStore(join(directory, "memory.json")));
    await memory.remember({
      tenantId: "tenant-a",
      namespace: "vortex",
      scope: "project",
      projectId: "project-a",
      content: "Project A uses PostgreSQL for persistence.",
    });
    await memory.remember({
      tenantId: "tenant-a",
      namespace: "vortex",
      scope: "project",
      projectId: "project-b",
      content: "Project B uses SQLite for persistence.",
    });

    const definition: AgentDefinition = {
      id: "architect",
      name: "Architect",
      description: "Designs systems",
      systemPrompt: "Design carefully.",
      allowedTools: [],
      maxToolCalls: 0,
    };
    const input: AgentRunInput = {
      objective: "Which database does this project use?",
      memory: {
        tenantId: "tenant-a",
        namespace: "vortex",
        projectId: "project-a",
        scopes: ["project"],
      },
    };
    const enriched = await new MemoryContextEnricher(memory).enrich(definition, input, {});
    const serialized = JSON.stringify(enriched);
    assert.match(serialized, /PostgreSQL/u);
    assert.doesNotMatch(serialized, /SQLite/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
