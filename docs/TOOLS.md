# Tool examples

Open **Agents & tools** for general-purpose tools. FPL tools are intentionally hidden from the dashboard; invoke them through the authenticated `POST /api/tools` endpoint with `{ "project": "general", "name": "fpl.snapshot", "input": {} }`, or request FPL analysis explicitly in chat. The same validated read tools are available to the complex-task planner.

## Official FPL snapshot

Tool: `fpl.snapshot`

```json
{}
```

For a public entry: `{"entry": 123456}`. Replace the example with your actual ID. Picks come from the latest published gameweek. Invalid/unavailable data produces an error; no synthetic squad is substituted.

## Seeded simulation

Tool: `fpl.simulate`

```json
{
  "players": [
    {
      "id": 1,
      "name": "Illustrative player",
      "position": 3,
      "team": 1,
      "price": 8,
      "points": [5.2, 4.8],
      "availability": 0.9
    }
  ],
  "horizon": 2,
  "iterations": 2000,
  "seed": 42
}
```

Points are supplied conditional-on-availability forecasts, not live FPL data. The model applies availability once. Simulations use independent nonnegative normal samples and do not simulate captain fallback, automatic substitutions or fixture correlations.

## Lineup and transfers

`fpl.lineup` expects `{"players": [...]}` with exactly 15 unique players: 2 goalkeepers, 5 defenders, 5 midfielders and 3 forwards. Position IDs are 1 through 4 in that order; at most three players can share a club. Every player has the same fields as the simulation example. The result includes an XI, bench, captain, vice and assumptions.

`fpl.transfer` expects `squad`, `candidates`, `bank`, `salePrices`, `freeTransfers` and `horizon`. `salePrices` maps each owned player ID to the actual selling price; it is not necessarily the market price. Only a single transfer is searched; club composition, position and budget are respected. No transfer is recommended when net projected gain is nonpositive.

## Repository context

Tool: `github.read`

```json
{
  "owner": "mukundacity-glitch",
  "repo": "FPL-VORTEX-AGENT",
  "ref": "main",
  "path": "README.md"
}
```

This fetches one public source file of at most 1 MB. It does not clone, mount, write to or execute the repository.

## Scoped retrieval

Tool: `memory.search`

```json
{ "query": "captain fixtures" }
```

Returns recent matching uploaded evidence within the selected project. Model experience is excluded from knowledge retrieval.

## MCP

Set `MCP_SERVER_URL`, `MCP_READ_TOOLS` and optionally `MCP_TOKEN` on the server, then restart. The tool name appears as `mcp.<name>`. An administrator must check that each allowlisted tool is read-only; the protocol alone cannot prove that. User requests cannot replace the configured endpoint or widen the allowlist.
