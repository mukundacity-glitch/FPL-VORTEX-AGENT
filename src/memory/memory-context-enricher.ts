import type {
  AgentContextEnricher,
  AgentDefinition,
  AgentRunInput,
} from "../agents/types.js";
import type { VortexMemory } from "./vortex-memory.js";
import type { MemoryScope, MemorySearchResult } from "./types.js";

function defaultScopes(input: AgentRunInput): MemoryScope[] {
  const scopes: MemoryScope[] = ["agent", "global"];
  if (input.memory?.projectId) scopes.unshift("project");
  if (input.memory?.conversationId) scopes.unshift("conversation");
  if (input.memory?.fileId) scopes.unshift("file");
  return scopes;
}

export class MemoryContextEnricher implements AgentContextEnricher {
  public constructor(private readonly memory: VortexMemory) {}

  private async forScope(
    scope: MemoryScope,
    definition: AgentDefinition,
    input: AgentRunInput,
  ): Promise<MemorySearchResult[]> {
    const reference = input.memory;
    if (!reference) return [];
    if (scope === "conversation" && !reference.conversationId) return [];
    if (scope === "project" && !reference.projectId) return [];
    if (scope === "file" && !reference.fileId) return [];

    return await this.memory.recall({
      tenantId: reference.tenantId,
      namespace: reference.namespace,
      scopes: [scope],
      text: input.objective,
      limit: reference.limit ?? 6,
      ...(scope === "conversation" ? { conversationId: reference.conversationId } : {}),
      ...(scope === "project" ? { projectId: reference.projectId } : {}),
      ...(scope === "file" ? { fileId: reference.fileId } : {}),
      ...(scope === "agent" ? { agentId: definition.id } : {}),
    });
  }

  public async enrich(
    definition: AgentDefinition,
    input: AgentRunInput,
    baseContext: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>> {
    if (!input.memory) return baseContext;
    const scopes = input.memory.scopes ?? defaultScopes(input);
    const batches = await Promise.all(scopes.map((scope) => this.forScope(scope, definition, input)));
    const bestById = new Map<string, MemorySearchResult>();

    for (const result of batches.flat()) {
      const existing = bestById.get(result.record.id);
      if (!existing || result.score > existing.score) bestById.set(result.record.id, result);
    }

    const ranked = [...bestById.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(1, Math.min(input.memory.limit ?? 10, 30)));
    const maxCharacters = Math.max(500, Math.min(input.memory.maxCharacters ?? 12_000, 50_000));
    const sections: string[] = [];
    const matches: Array<{ id: string; scope: MemoryScope; score: number }> = [];
    let used = 0;

    for (const result of ranked) {
      const source = result.record.source ? ` source=${result.record.source}` : "";
      const section = `[memory:${result.record.scope} score=${result.score.toFixed(3)}${source}]\n${result.record.content}`;
      if (used + section.length > maxCharacters) break;
      sections.push(section);
      matches.push({ id: result.record.id, scope: result.record.scope, score: result.score });
      used += section.length + 2;
    }

    return {
      ...baseContext,
      vortexMemory: {
        context: sections.join("\n\n"),
        matches,
      },
    };
  }
}
