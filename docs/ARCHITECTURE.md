# Vortex AI architecture

The browser and Node.js HTTP backend use the same origin. Server-side adapters own provider credentials. This implementation serves one personal owner with multiple projects.

```text
Browser chat / uploads / tool runner
                 |
       Auth + origin + request limits
                 |
       SQLite project-scoped context
                 |
     Heuristic capability/complexity router
        |                     |
  Routine provider       Planner (bounded)
                              |
                     Read tools (max three)
                              |
                 Specialists (one to three)
                              |
                          Synthesis
                              |
                   Independent review gate
                              |
                    Run ledger + final answer
```

`src/core/engine.ts` is the general orchestrator. Simple requests avoid planning and review. Complex requests must have a reviewer with a different provider or model before primary inference begins. The configured reviewer can fall back to Anthropic for OpenAI coding/research candidates when the configured OpenAI reviewer is the same model. The threshold is validated; invalid JSON, missing fields, out-of-range scores or rejected reviews cannot produce an accepted answer.

Planning has a bounded fan-out. Tool requests carry server-created scope, never user-selected ownership. Tool names, argument schemas and permission effects are checked by the registry. Independent specialists may run concurrently; tool calls run sequentially. Coding/research specialists use their corresponding adapters. There is no arbitrary host shell execution tool.

Provider adapters expose a consistent request/response interface. OpenAI Responses supports research web search. The existing OpenAI Agents adapter consumes managed-session events; it is opt-in and does not mount uploaded ZIP files into a repository or supply GitHub credentials. A generated code answer is a proposal unless session artifacts prove implementation and tests. Provider requests have finite SDK timeouts and limited retries; full run deadlines and client-disconnect cancellation remain pending.

The file engine routes by extension and validates content where supported. Office and generic archives are expanded in memory with pre-decompression entry/size/path checks. Extracted evidence retains page/sheet/slide/file markers where possible. Raw binary uploads are not persisted. Audio produces timestamped transcripts; video combines that transcript with sampled visual observations and reports its coverage limits.

SQLite stores conversations, files, uploaded evidence, model experience and run records. Owner and project scope are required on every lookup. Keyword retrieval ranks recent scoped knowledge; it is not vector RAG. Uploaded evidence carries source provenance. Model experience is not promoted to verified knowledge. Run records retain rejected candidates and their review reasons for audit.

The FPL client validates official data and uses a five-minute cache. Deterministic tools enforce squad composition, club limits, budget and actual selling prices. The uncertainty simulation is reproducible and explicitly uncalibrated. Official next-event estimates must not be stretched into eight-week predictions.

Maintenance uses reviewable proposals. Dependabot opens dependency PRs; Ruflo monitoring opens update issues; a scheduled workflow stores a report artifact. No automatic merge, production deployment or baseline advancement takes place.
