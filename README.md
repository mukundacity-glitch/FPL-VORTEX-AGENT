# Vortex AI

Vortex AI turns the original FPL agent scaffold into a personal browser workspace with model routing, bounded specialist orchestration, independent review, project memory, file ingestion and FPL tools.

This is a working foundation for the larger vision. It is not yet the complete autonomous engineering platform or a production service. See [the eight-stage implementation ledger](docs/BUILD_PROGRESS.md) for implemented behavior, limitations and remaining gates.

## Run locally

Requires Node.js 24 LTS. Video also requires ffmpeg.

```sh
npm ci
cp .env.example .env
# Edit .env: add provider keys and choose accessible model IDs.
npm run check
npm start
```

Open http://127.0.0.1:3000. Without API keys, the interface, text/document uploads, storage and deterministic tools work; chat returns an explicit setup error. Nothing silently generates a fake AI answer.

The default configuration uses Claude Haiku for short routine chat, Sonnet for balanced requests, Fable for deep reasoning and OpenAI for independent review. Coding and research use OpenAI; when its configured review model matches the candidate model, the configured Anthropic reviewer is used instead. Both providers are therefore needed for the default full workflow. Set model IDs to ones available to your account. `CODING_MODE=agents` opts into an OpenAI-hosted coding session; access, repository mounts and GitHub authorization still need provisioning.

Provider API keys belong only in `.env` or hosting secrets. This application's access token is separate from those keys. File contents and conversation context selected for a task are sent to its model providers.

## Use the workspace

- **Chat:** type a message and attach files. Complex requests plan up to three specialists, run up to three allowlisted read tools, synthesize and pass an independent review. Rejected candidates are withheld from the displayed answer but retained in the private run ledger.
- **Projects:** choose General, Coding or create a named project. Conversations, uploaded file text, searchable evidence and run records use the project scope.
- **Files:** upload and select evidence. Extraction warnings explain omissions, sampling and truncation. Delete uploads to remove their file text and indexed evidence.
- **Agents & tools:** inspect the specialist registry and run validated tools directly. The input is JSON; see [tool examples](docs/TOOLS.md).
- **Settings:** inspect setup status and delete the current conversation. Model configuration stays on the server.

Progress events stream over SSE. The final answer is sent after synthesis and review; this version does not stream unverified model tokens into the chat.

## File support

| Input                                                   | Implemented behavior                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| TXT, Markdown, CSV, TSV, JSON, XML, common source files | UTF-8 text ingestion; JSON/XML validation                                      |
| PDF                                                     | Embedded text with page markers, up to 100 pages; scanned-page OCR pending     |
| DOCX                                                    | Main document text; layout, notes and embedded images may be omitted           |
| XLSX                                                    | Sheet/cell markers, formulas and cached values; no formula recalculation       |
| PPTX                                                    | Slide text with slide markers; embedded visuals may be omitted                 |
| ZIP                                                     | Bounded in-memory extraction, traversal rejection, secret/generated-path skips |
| PNG, JPEG, WebP, GIF                                    | OpenAI visual description and visible-text extraction                          |
| MP3, WAV, M4A, OGG, FLAC                                | OpenAI transcript with segment timestamps                                      |
| MP4, MOV, WebM, MKV                                     | ffmpeg audio extraction and up to six sampled frames over the first 15 minutes |

Each upload is limited to 10 MiB. Archives allow 200 entries and 30 MiB expanded data; nested archives stop after two levels. Extracted text is capped at 80,000 characters per file, and selected file context at 150,000. Unsupported formats produce an explanation. File text is persistent; raw upload binaries are discarded after extraction. Media requires credentials and has not been live-tested without them.

## Tools and FPL

The dashboard presents general-purpose agents and tools. FPL remains available through explicit requests and the authenticated tool API, without dashboard cards or controls. Backend read tools include `fpl.snapshot`, `fpl.lineup`, `fpl.transfer`, `fpl.simulate`, `github.read` and `memory.search`. An administrator can configure an HTTPS MCP endpoint and an exact read-tool allowlist. Neither the planner nor the tool endpoint can invoke write tools. Managed coding sessions are a separate opt-in capability.

FPL snapshots include provenance, a retrieval timestamp, official next-event expected points and up to eight fixture rounds. Public entry picks are the latest published squad, not pending private transfers. The simulator requires supplied projections; it is explicitly an illustrative uncertainty model. Eight-week forecasting, chip optimization, news feeds and calibrated backtesting remain future work.

## Verification and maintenance

```sh
npm run check
npm run format:check
npm audit --omit=dev --audit-level=high
npm run updates:check
npm run backup
```

Tests cover routing, review gates, isolation, file extraction, archive bounds, FPL constraints, tool permissions and HTTP flows. CI uses `npm ci` and the committed lockfile. Dependabot proposes dependency PRs. Ruflo monitoring creates deduplicated issues; update reports detect dependency/upstream changes. Production code is never overwritten automatically, and automatic update integration/merging is not implemented.

## Deployment

The Dockerfile packages the server and interface with ffmpeg. Follow [deployment and recovery instructions](docs/DEPLOYMENT.md). A persistent disk and HTTPS are required. Binding beyond loopback requires a random access token of at least 32 characters. This is personal shared-token authentication, not multi-user identity management. Docker and production hosting remain unverified until those services are configured.

Do not deploy this SQLite/media backend directly as an ephemeral Vercel function. A Vercel frontend would need a same-origin proxy to a separately hosted persistent backend. A container host can serve the complete application.

## Ruflo reference

This is an independent implementation inspired by [Ruflo](https://github.com/ruvnet/ruflo): orchestration, scoped memory, specialist agents, tool boundaries and controlled maintenance. Ruflo is not installed or running inside Vortex. No Ruflo implementation source was copied in this change. Existing attribution remains in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
