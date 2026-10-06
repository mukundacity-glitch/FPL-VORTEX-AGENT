# Prompt generation and API setup

## Start with one provider key

Create a project key in [the OpenAI dashboard](https://platform.openai.com/api-keys), enable API billing, then put it in the server's ignored `.env` file as `OPENAI_API_KEY=...`. Never paste a key into the chat or commit it. Restart Vortex after changing configuration. The [official quickstart](https://developers.openai.com/api/docs/quickstart) explains server-side key setup.

With blank `PRIMARY_PROVIDER` and `REVIEW_PROVIDER`, Vortex chooses OpenAI when its key is present, otherwise Anthropic. The OpenAI defaults use different primary/review models so a single provider key can support independent review. All selected models require account access. An Anthropic-only configuration can chat and analyze extracted documents/code; online research and media require OpenAI. A configured key is not proof of valid billing or live model access.

## Generate from a prompt

In Chat, choose **Image** or **Video** next to Send and describe the result. **Auto** recognizes requests starting with phrases such as “Create an image of…” and “Generate a video of…”. Choose **Chat** to discuss generation without running it. Uploaded attachments are not used as generation references in this version.

Default images are one 1024 × 1024 PNG at medium quality, using `OPENAI_IMAGE_MODEL=gpt-image-2.5-flare`. Default videos are four seconds at 1280 × 720, using `OPENAI_VIDEO_MODEL=sora-2`; `sora-2-pro` is configurable. These defaults follow the [Images guide](https://developers.openai.com/api/docs/guides/image-generation) and [Video guide](https://developers.openai.com/api/docs/guides/video-generation). Account availability and provider restrictions still apply.

A result appears in the conversation and in **Files → Generated images & videos**. That gallery survives restarts; generated results are stored separately from conversation history. Downloads and playback require the same authenticated project scope. Video jobs are refreshed while the page is visible. Open the gallery again after a restart to resume checking a saved video job. Transient status/download failures do not start another creation request.

Each creation has a unique request ID; reuse of the same ID and prompt returns the saved job. Creation requests are never automatically retried. If a network connection fails, check the gallery and provider activity before creating again. A server interruption before saving the creation response is marked failed, because the provider may already have billed it. At most two active jobs run per owner. Assets are capped at 64 MiB each and stored in SQLite; this is a personal-workspace design rather than high-volume media hosting. Review provider costs before running generation.

## Your own API

Vortex already exposes its own authenticated API around model providers:

- `POST /api/chat`: existing chat and specialist orchestration, with SSE responses.
- `POST /api/generations`: JSON `{ "id": "<UUID>", "project": "general", "kind": "image", "prompt": "A forest at sunrise" }` returns an accepted job.
- `GET /api/generations?project=general`: saved jobs.
- `GET /api/generations/<UUID>?project=general`: current progress.
- `GET /api/generations/<UUID>/asset?project=general`: private image/video; add `&download=1` for download. Video playback supports byte ranges.

Use the login endpoint and HttpOnly session cookie when access protection is enabled. This API wraps the provider's models; creating an endpoint does not train a new model. Running an open model on your own hardware is another option, but an Ollama/local-model adapter is not implemented here.

## Opening link

On the computer running `npm start`, open [Vortex locally](http://127.0.0.1:3000). This address is not a public phone link. For phone access, deploy the backend with HTTPS and persistent storage; see [deployment instructions](DEPLOYMENT.md). A GitHub pull-request URL is a code review, not the running application.
