import { GenerationService, OpenAIMediaProvider } from "../media/generation.js";
import { z } from "zod";
import { loadRuntimeConfig } from "../config/runtime.js";
import { createProvider } from "../providers/factory.js";
import { OpenAIProvider } from "../providers/openai-provider.js";
import { OpenAIAgentProvider } from "../providers/openai-agent-provider.js";
import { AnthropicProvider } from "../providers/anthropic-provider.js";
import { VortexEngine } from "../core/engine.js";
import { Store } from "../memory/store.js";
import { FileEngine } from "../files/ingest.js";
import { MediaParser } from "../files/media.js";
import { FplClient } from "../fpl/client.js";
import { ToolRegistry } from "../tools/registry.js";
import { callMcp } from "../tools/mcp.js";
import {
  optimizeLineup,
  simulate,
  bestSingleTransfer,
} from "../fpl/optimizer.js";
import { createApp } from "./app.js";
const config = loadRuntimeConfig();
const store = new Store(process.env.VORTEX_DB_PATH ?? ".vortex/vortex.sqlite");
const fpl = new FplClient(config.fplBaseUrl);
const tools = new ToolRegistry();
const projection = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  position: z.number().int().min(1).max(4),
  team: z.number().int().positive(),
  price: z.number().nonnegative(),
  points: z.array(z.number().nonnegative()).min(1).max(8),
  availability: z.number().min(0).max(1),
});
tools.register({
  name: "fpl.snapshot",
  description: "Official FPL players and next eight fixture rounds.",
  effect: "read",
  input: z.object({ entry: z.number().int().positive().optional() }),
  execute: async (input) => fpl.snapshot(input.entry),
});
tools.register({
  name: "fpl.lineup",
  description: "Optimize a legal 15-player squad and select captain/vice.",
  effect: "read",
  input: z.object({ players: z.array(projection).length(15) }),
  execute: async (input) => optimizeLineup(input.players),
});
tools.register({
  name: "fpl.simulate",
  description: "Seeded uncertainty simulation over supplied projections.",
  effect: "read",
  input: z.object({
    players: z.array(projection).min(1).max(100),
    horizon: z.number().int().min(1).max(8).default(1),
    iterations: z.number().int().min(100).max(10000).default(2000),
    seed: z.number().int().default(42),
  }),
  execute: async (input) =>
    simulate(input.players, input.horizon, input.iterations, input.seed),
});
tools.register({
  name: "fpl.transfer",
  description: "Budget and club constrained single-transfer search.",
  effect: "read",
  input: z.object({
    squad: z.array(projection).length(15),
    candidates: z.array(projection).max(1000),
    bank: z.number().nonnegative(),
    salePrices: z.record(z.string(), z.number().nonnegative()),
    freeTransfers: z.number().int().nonnegative().default(1),
    horizon: z.number().int().min(1).max(8).default(1),
  }),
  execute: async (input) =>
    bestSingleTransfer(
      input.squad,
      input.candidates,
      input.bank,
      input.salePrices,
      input.freeTransfers,
      input.horizon,
    ),
});
tools.register({
  name: "memory.search",
  description: "Search knowledge within the current project.",
  effect: "read",
  input: z.object({ query: z.string().max(1000) }),
  execute: async (input, context) => store.search(context, input.query),
});
tools.register({
  name: "github.read",
  description:
    "Read one public GitHub source file; does not write or execute code.",
  effect: "read",
  input: z.object({
    owner: z.string().regex(/^[\w-]+$/),
    repo: z.string().regex(/^[\w.-]+$/),
    ref: z
      .string()
      .regex(/^[\w./-]+$/)
      .default("main"),
    path: z
      .string()
      .max(300)
      .regex(/^[\w./-]+$/),
  }),
  execute: async (input, context) => {
    if (input.path.split("/").includes(".."))
      throw new Error("Invalid repository path.");
    const response = await fetch(
      `https://raw.githubusercontent.com/${input.owner}/${input.repo}/${input.ref}/${input.path}`,
      { signal: context.signal },
    );
    if (!response.ok) throw new Error(`GitHub returned ${response.status}.`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty GitHub response.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 1000000) {
        await reader.cancel();
        throw new Error("Source file exceeds 1 MB.");
      }
      chunks.push(value);
    }
    return {
      source: response.url,
      text: Buffer.concat(chunks).toString("utf8"),
    };
  },
});
if (process.env.MCP_SERVER_URL) {
  const url = process.env.MCP_SERVER_URL,
    allowlist = (process.env.MCP_READ_TOOLS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  for (const name of allowlist)
    tools.register({
      name: `mcp.${name}`,
      description: "Administrator allowlisted MCP tool.",
      effect: "read",
      input: z.record(z.string(), z.unknown()),
      execute: async (input) =>
        callMcp(url, allowlist, name, input, process.env.MCP_TOKEN),
    });
}
const providers = {
  fast: () =>
    config.anthropic.apiKey
      ? new AnthropicProvider(
          process.env.ANTHROPIC_FAST_MODEL ?? "claude-haiku-4-5",
          config.anthropic.apiKey,
        )
      : new OpenAIProvider(
          process.env.OPENAI_FAST_MODEL ?? config.openai.primaryModel,
          config.openai.apiKey,
        ),
  balanced: () =>
    config.primaryProvider === "anthropic"
      ? new AnthropicProvider(
          process.env.ANTHROPIC_BALANCED_MODEL ?? "claude-sonnet-5-5",
          config.anthropic.apiKey,
        )
      : new OpenAIProvider(config.openai.primaryModel, config.openai.apiKey),
  deep: () => createProvider(config.primaryProvider, "primary", config),
  coding: () =>
    !config.openai.apiKey
      ? createProvider(config.primaryProvider, "primary", config)
      : process.env.CODING_MODE === "agents"
        ? new OpenAIAgentProvider(
            config.openai.primaryModel,
            config.openai.apiKey,
          )
        : new OpenAIProvider(config.openai.primaryModel, config.openai.apiKey),
  research: () =>
    config.openai.apiKey
      ? new OpenAIProvider(
          config.openai.primaryModel,
          config.openai.apiKey,
          true,
        )
      : createProvider(config.primaryProvider, "primary", config),
  review: (primary: import("../providers/model-provider.js").ModelProvider) => {
    const selected = createProvider(config.reviewProvider, "review", config);
    return selected.name === primary.name &&
      selected.model === primary.model &&
      config.anthropic.apiKey &&
      primary.name === "openai"
      ? createProvider("anthropic", "review", config)
      : selected;
  },
};
const port = Number(process.env.PORT ?? 3000),
  host = process.env.HOST ?? "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid PORT.");
const imageModel = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2.5-flare";
const videoModel = process.env.OPENAI_VIDEO_MODEL ?? "sora-2";
if (videoModel !== "sora-2" && videoModel !== "sora-2-pro")
  throw new Error("Unsupported OPENAI_VIDEO_MODEL.");
const app = createApp({
  generations: new GenerationService(
    store,
    config.openai.apiKey
      ? new OpenAIMediaProvider(config.openai.apiKey, imageModel, videoModel)
      : undefined,
    imageModel,
    videoModel,
  ),
  store,
  files: new FileEngine(
    new MediaParser(
      config.openai.apiKey,
      config.openai.primaryModel,
      process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1",
    ),
  ),
  fpl,
  engine: new VortexEngine(
    providers,
    config.minReviewScore,
    config.enableCrossModelReview,
    tools,
  ),
  tools,
  configured: !!(config.primaryProvider === "openai"
    ? config.openai.apiKey
    : config.anthropic.apiKey),
  ...(process.env.VORTEX_AUTH_TOKEN
    ? { authToken: process.env.VORTEX_AUTH_TOKEN }
    : {}),
  publicAccess: host !== "127.0.0.1" && host !== "localhost",
});
app.requestTimeout = 30000;
app.headersTimeout = 10000;
app.listen(port, host, () =>
  console.log(`Vortex AI listening on http://${host}:${port}`),
);
const shutdown = () => {
  app.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
