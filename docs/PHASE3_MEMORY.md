# Phase 3 — Vortex Memory and Project Knowledge

Phase 3 gives Vortex AI a persistent, scoped memory layer that can be used by the future browser chat, file ingestion pipeline, FPL specialists, coding agents, and project workspaces.

## Design goals

1. **Tenant isolation first** — every record requires a `tenantId`.
2. **Scoped memory** — conversation, project, file, agent, and user-global knowledge are distinct scopes.
3. **Bounded retrieval** — agents receive only a small ranked context, never the full database.
4. **Hybrid search** — semantic similarity can be combined with lexical overlap, importance, and recency.
5. **Deliberate learning** — conversation and agent-experience recording is explicit rather than automatic.
6. **Replaceable infrastructure** — storage and embedding providers are interfaces so production can move to a database/vector store later.

## Memory scopes

- `conversation`: knowledge tied to one chat thread.
- `project`: durable facts, decisions, constraints, and summaries for a project.
- `file`: chunks extracted from a specific uploaded file.
- `agent`: successful patterns and experience for a specialist agent.
- `global`: durable user-level knowledge inside a tenant/namespace.

`global` does **not** mean shared across users. Tenant isolation always applies.

## Main components

### `VortexMemory`

The main write/read API. It validates scope coordinates, hashes normalized content, deduplicates repeated facts in the same address, merges tags and metadata, stores optional embeddings, and exposes recall/forget/context operations.

### `MemoryStore`

Storage contract. Phase 3 includes:

- `InMemoryMemoryStore` for tests and ephemeral runtimes.
- `JsonMemoryStore` for small local/self-hosted persistent deployments. Writes use a temporary file and atomic rename.

A production cloud deployment can later implement this interface with PostgreSQL, pgvector, or another durable service without changing agent code.

### Embeddings

`EmbeddingProvider` is provider-neutral.

- `LocalTokenEmbeddingProvider` provides an offline deterministic fallback.
- `OpenAIEmbeddingProvider` uses an explicitly configured embedding model and API key. No embedding model ID is hardcoded into Vortex.

### Hybrid retrieval

`MemoryRetriever` ranks candidates with:

- semantic similarity when compatible embeddings are available,
- lexical overlap,
- importance,
- recency.

Metadata filters are applied before ranking, including tenant, namespace, scope, project, conversation, file, agent, and tags.

### `KnowledgeIngestor`

Splits long extracted text into overlapping chunks and saves each chunk with source metadata. Phase 4's PDF/DOCX/XLSX/image/audio/video extraction pipeline can feed this component directly.

### Agent integration

`MemoryContextEnricher` can enrich a `ToolAgent` run with relevant memory. `VortexAgentRuntime` accepts an optional `VortexMemory` instance and injects the enricher automatically.

The caller supplies a memory reference per run:

```ts
{
  tenantId: "user-123",
  namespace: "vortex-ai",
  projectId: "project-42",
  conversationId: "chat-7"
}
```

The enricher queries scopes separately and then merges/ranks results. This prevents a project filter from accidentally excluding global memory or a conversation filter from leaking into another scope.

### Deliberate recorders

- `ConversationMemoryRecorder` persists user/assistant turns when the application decides they should be retained.
- `AgentExperienceRecorder` stores only successful agent outcomes when explicitly requested by orchestration logic.

## Security and privacy

- Tenant ID is mandatory on every memory record and every recall query.
- Memory is never automatically shared between tenants.
- File/project/conversation IDs are hard retrieval filters, not prompt instructions.
- APIs expose explicit deletion through `forget`.
- Local persistent memory files are written with owner-only file permissions where supported.
- The future production deployment should add encrypted storage, authentication-bound tenant IDs, retention controls, audit logs, and database row-level security.

## What Phase 4 can build on this

The universal file engine can now follow this pipeline:

```text
Upload
  -> detect file type
  -> extract/transcribe/understand
  -> normalize text + metadata
  -> KnowledgeIngestor
  -> scoped file/project memory
  -> hybrid retrieval
  -> Vortex agents
```

This keeps large uploaded files out of every prompt while still making their relevant contents retrievable on demand.
