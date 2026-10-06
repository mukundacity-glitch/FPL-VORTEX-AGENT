# Phase 6 — Vortex AI Browser Interface

Phase 6 adds an undeployed browser application under `apps/vortex-web`.

## Included

- Next.js 16 / React 19 browser workspace
- Vortex AI dark chat interface with local projects and new-chat history boundaries
- server-only use of the existing `VortexCore`
- streamed NDJSON run-status events and final verified response metadata
- Phase 3 conversation/project/file memory retrieval and conversation recording
- Phase 4 multipart upload analysis for documents, spreadsheets, presentations, archives, images, audio and video
- optional OpenAI vision/transcription and FFmpeg video-frame analysis when configured
- AI Elements-compatible `MessageResponse` markdown rendering via Streamdown
- no provider secrets shipped to browser JavaScript
- `/api/health`, `/api/chat`, and `/api/files` route handlers
- CI typecheck and production build for the web application

## Local run

Build the core first, install the web app, then start it:

```bash
npm install
npm run build
npm run web:install
npm --prefix apps/vortex-web run dev
```

Provider keys stay in server environment variables. Phase 6 does not deploy or publish the application.

## Production follow-ups

Before public deployment, replace local JSON memory with a durable database/vector store, add authentication and tenant identity, move uploaded bytes to object storage, add rate limits and abuse controls, configure observability, and add resumable background media processing for very large files.
