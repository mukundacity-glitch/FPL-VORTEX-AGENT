# Deployment and recovery

This application needs a long-lived Node.js 24 server, HTTPS and persistent SQLite storage. The browser uses relative same-origin API paths. The simplest target is container hosting with a persistent disk. No production deployment has been created by this branch.

## Local validation

```sh
npm ci
cp .env.example .env
npm run check
npm run format:check
npm audit --omit=dev --audit-level=high
npm start
```

Edit `.env` in your editor. Do not paste provider keys into chat, commit them, put them in frontend variables or store them in browser local storage. Local project names alone use browser local storage.

The default needs OpenAI and Anthropic keys. Verify account access to each configured model. Test routine chat, complex independent review, research, a published FPL entry, document comparison and media before calling those capabilities verified.

## Container

The Dockerfile has not been built in an environment with Docker yet.

```sh
docker build -t vortex-ai .
docker volume create vortex-data
docker run --rm --name vortex-ai -p 127.0.0.1:3000:3000 \
  --env-file .env \
  -e HOST=0.0.0.0 -e VORTEX_DB_PATH=/data/vortex.sqlite \
  -v vortex-data:/data vortex-ai
```

Set `VORTEX_AUTH_TOKEN` to at least 32 random characters before running. Place an HTTPS reverse proxy in front of the container; the public configuration issues Secure cookies, so authentication through plain HTTP is intentionally unavailable. The proxy must preserve the external Host and allow SSE connections and upload bodies up to 15 MiB. Do not cache private API responses.

Keep one server replica for this SQLite configuration. This is personal shared-token access, not isolated accounts for multiple people. Session signatures are reset on process restart. For a public multi-user product, first integrate an identity provider, derive owner IDs from authenticated identities, replace the per-process limiter with a shared quota system and add audited storage policies.

## Vercel option

Host the persistent backend elsewhere. Serve the frontend through Vercel with a same-origin reverse proxy to the backend for `/api/*`. Configure forwarded Host/origin handling, authentication cookies, SSE duration and upload limits, then verify the complete flow. This branch does not contain a verified Vercel proxy configuration and does not publish to the example domain in the brief.

## Backup and restore

```sh
npm run backup
```

The command uses SQLite's online backup API, checks source integrity and writes a private timestamped file under `backups/`. For a custom location, set `VORTEX_DB_PATH`. Backups contain private conversation/file evidence and require protected offsite storage. No automated offsite upload is configured.

Restore to a separate test directory first and run `PRAGMA integrity_check` on the restored database. For actual recovery: stop the server, preserve the current database and WAL/SHM files, restore the selected consistent backup to the configured database path, remove stale WAL/SHM companions after preserving them, then restart and verify chats/files. Never replace an open database.

## Release gates

- Local and remote CI pass, dependency audit is clean and changes are reviewed.
- Real model access, independent review, media processing and configured MCP tools are validated.
- Container builds and runs with HTTPS, authentication and persistent storage.
- A backup/restore drill succeeds; secrets and storage have a rotation/recovery plan.
- Logs, latency/error monitoring and usage limits are configured for the chosen host.

Promote a specific tested commit or container digest. Keep the prior image and a consistent pre-migration database backup. Future schema migrations must be versioned and reversible before automatic deployment is added.
