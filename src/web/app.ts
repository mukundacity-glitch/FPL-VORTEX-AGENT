import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Store, type Scope } from "../memory/store.js";
import { FileEngine } from "../files/ingest.js";
import { FplClient } from "../fpl/client.js";
import { VortexEngine } from "../core/engine.js";
import { ToolRegistry } from "../tools/registry.js";
import { agents, route } from "../agents/registry.js";
export interface AppOptions {
  store: Store;
  files: FileEngine;
  fpl: FplClient;
  engine: VortexEngine;
  tools: ToolRegistry;
  authToken?: string;
  publicAccess?: boolean;
  configured: boolean;
}
const scopeInput = z.object({
  project: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,64}$/)
    .default("general"),
});
const chatInput = scopeInput.extend({
  message: z.string().trim().min(1).max(12000),
  chatId: z.string().uuid().optional(),
  fileIds: z.array(z.string().uuid()).max(12).default([]),
  entry: z.number().int().positive().optional(),
});
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function send(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}
async function body(
  req: IncomingMessage,
  limit = 15 * 1024 * 1024,
): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const part of req) {
    size += part.length;
    if (size > limit) throw new Error("Request body too large.");
    chunks.push(part);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
export function createApp(options: AppOptions) {
  if (
    options.publicAccess &&
    (!options.authToken || options.authToken.length < 32)
  )
    throw new Error(
      "Public hosting requires VORTEX_AUTH_TOKEN with at least 32 characters.",
    );
  const secret = randomBytes(32);
  const inflight = new Set<string>();
  const rate = new Map<string, { count: number; at: number }>();
  const authenticated = (req: IncomingMessage): boolean => {
    if (!options.authToken) return !options.publicAccess;
    const cookie = req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("vortex_session="))
      ?.slice(15);
    if (!cookie) return false;
    const [expiry, signature] = cookie.split(".");
    if (
      !expiry ||
      !signature ||
      Number(expiry) < Date.now() ||
      Number(expiry) > Date.now() + 13 * 3600000
    )
      return false;
    return equal(
      signature,
      createHmac("sha256", secret).update(expiry).digest("hex"),
    );
  };
  const publicDir = fileURLToPath(new URL("../../public/", import.meta.url));
  const scope = (url: URL): Scope => ({
    owner: "personal",
    ...scopeInput.parse({
      project: url.searchParams.get("project") ?? "general",
    }),
  });
  return createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    res.setHeader("X-Request-ID", requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    try {
      const host = req.headers.host;
      if (!host) {
        send(res, 400, { error: "Host required" });
        return;
      }
      const url = new URL(req.url ?? "/", `http://${host}`),
        path = url.pathname;
      if (
        !options.publicAccess &&
        !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      ) {
        send(res, 403, {
          error: "Local workspace requires a loopback hostname.",
        });
        return;
      }
      if (req.headers.origin && new URL(req.headers.origin).host !== host) {
        send(res, 403, { error: "Cross-origin requests are not allowed." });
        return;
      }
      const mutating = ["POST", "DELETE", "PUT", "PATCH"].includes(
        req.method ?? "",
      );
      if (mutating && req.headers["sec-fetch-site"] === "cross-site") {
        send(res, 403, { error: "Cross-site request rejected." });
        return;
      }
      if (
        ["/", "/app.js", "/style.css"].includes(path) &&
        req.method === "GET"
      ) {
        const file = path === "/" ? "index.html" : path.slice(1);
        res.setHeader(
          "Content-Type",
          file.endsWith("html")
            ? "text/html; charset=utf-8"
            : file.endsWith("css")
              ? "text/css"
              : "text/javascript",
        );
        res.end(await readFile(`${publicDir}${file}`));
        return;
      }
      if (path === "/api/health" && req.method === "GET") {
        send(res, 200, { status: "ok", service: "Vortex AI" });
        return;
      }
      if (path === "/api/session" && req.method === "GET") {
        send(res, 200, {
          authenticated: authenticated(req),
          authRequired: !!options.authToken,
        });
        return;
      }
      const key = req.socket.remoteAddress ?? "unknown";
      if (rate.size > 10000) rate.clear();
      let bucket = rate.get(key);
      if (!bucket || Date.now() - bucket.at > 60000) {
        bucket = { count: 0, at: Date.now() };
        rate.set(key, bucket);
      }
      if (++bucket.count > 60) {
        send(res, 429, {
          error: "Too many requests. Try again in one minute.",
        });
        return;
      }
      if (path === "/api/login" && req.method === "POST") {
        const input = z
          .object({ token: z.string().max(512) })
          .parse(await body(req, 2048));
        if (!options.authToken || !equal(input.token, options.authToken)) {
          send(res, 401, { error: "Invalid access token." });
          return;
        }
        const expiry = String(Date.now() + 12 * 3600000);
        res.setHeader(
          "Set-Cookie",
          `vortex_session=${expiry}.${createHmac("sha256", secret).update(expiry).digest("hex")}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${options.publicAccess ? "; Secure" : ""}`,
        );
        send(res, 200, { authenticated: true });
        return;
      }
      if (!authenticated(req)) {
        send(res, 401, { error: "Sign in to Vortex AI." });
        return;
      }
      if (path === "/api/logout" && req.method === "POST") {
        res.setHeader(
          "Set-Cookie",
          "vortex_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
        );
        send(res, 200, { ok: true });
        return;
      }
      if (path === "/api/status" && req.method === "GET") {
        send(res, 200, {
          configured: options.configured,
          agents,
          tools: options.tools.list(),
          storage: "SQLite · personal workspace",
          review: "Required for complex tasks",
        });
        return;
      }
      if (path === "/api/chats" && req.method === "GET") {
        send(res, 200, options.store.chats(scope(url)));
        return;
      }
      if (path === "/api/chats" && req.method === "POST") {
        const input = scopeInput.parse(await body(req, 4096));
        send(
          res,
          201,
          options.store.createChat({ owner: "personal", ...input }),
        );
        return;
      }
      const chatMatch = path.match(/^\/api\/chats\/([a-f0-9-]{36})$/);
      if (chatMatch && req.method === "GET") {
        send(res, 200, options.store.messages(scope(url), chatMatch[1]!));
        return;
      }
      if (chatMatch && req.method === "DELETE") {
        options.store.deleteChat(scope(url), chatMatch[1]!);
        send(res, 200, { ok: true });
        return;
      }
      if (path === "/api/files" && req.method === "GET") {
        send(res, 200, options.store.files(scope(url)));
        return;
      }
      if (path === "/api/files" && req.method === "POST") {
        const input = scopeInput
          .extend({
            name: z.string().min(1).max(200),
            base64: z
              .string()
              .min(1)
              .max(14 * 1024 * 1024)
              .regex(/^[A-Za-z0-9+/]*={0,2}$/),
          })
          .parse(await body(req));
        const file = await options.files.ingest(
          input.name,
          Buffer.from(input.base64, "base64"),
        );
        options.store.addFile(
          { owner: "personal", project: input.project },
          file,
        );
        options.store.remember(
          { owner: "personal", project: input.project },
          "knowledge",
          file.text,
          `file:${file.id} (${file.name}, uploaded evidence)`,
        );
        const { text, ...metadata } = file;
        send(res, 201, { ...metadata, characters: text.length });
        return;
      }
      const fileMatch = path.match(/^\/api\/files\/([a-f0-9-]{36})$/);
      if (fileMatch && req.method === "DELETE") {
        options.store.deleteFile(scope(url), fileMatch[1]!);
        send(res, 200, { ok: true });
        return;
      }
      if (path === "/api/tools" && req.method === "POST") {
        const input = scopeInput
          .extend({ name: z.string().max(100), input: z.unknown() })
          .parse(await body(req, 128000));
        const result = await options.tools.call(input.name, input.input, {
          owner: "personal",
          project: input.project,
          signal: AbortSignal.timeout(300000),
        });
        send(res, 200, result);
        return;
      }
      if (path === "/api/chat" && req.method === "POST") {
        const input = chatInput.parse(await body(req, 20000));
        const workspace = { owner: "personal", project: input.project };
        if (!options.configured) {
          send(res, 503, {
            error:
              "Add a provider API key to .env and restart. Complex tasks also require an independent review provider.",
          });
          return;
        }
        if (inflight.has(workspace.owner)) {
          send(res, 409, {
            error: "A Vortex task is already running. Wait for it to finish.",
          });
          return;
        }
        const chat = input.chatId ?? options.store.createChat(workspace).id;
        options.store.assertChat(workspace, chat);
        const files = input.fileIds.map((id) =>
          options.store.file(workspace, id),
        );
        if (files.reduce((n, f) => n + f.text.length, 0) > 150000)
          throw new Error(
            "Selected file context exceeds 150,000 characters. Select fewer files.",
          );
        const history = options.store.messages(workspace, chat).slice(-12);
        inflight.add(workspace.owner);
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        const event = (name: string, value: unknown) => {
          if (!res.destroyed)
            res.write(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`);
        };
        const heartbeat = setInterval(() => {
          if (!res.destroyed) res.write(": keepalive\n\n");
        }, 15000);
        try {
          event("chat", { id: chat });
          const context: Record<string, unknown> = {
            files,
            conversation: history,
            memory: options.store.search(workspace, input.message),
          };
          if (route(input.message, files.length).agent === "fpl") {
            event("stage", { stage: "Official FPL data", state: "running" });
            context.fpl = await options.fpl.snapshot(input.entry);
            event("stage", { stage: "Official FPL data", state: "complete" });
          }
          options.store.append(workspace, chat, "user", input.message);
          const result = await options.engine.run(
            input.message,
            context,
            files.length,
            (e) => event("stage", e),
            { ...workspace, signal: AbortSignal.timeout(300000) },
          );
          options.store.record(workspace, chat, result);
          options.store.append(workspace, chat, "assistant", result.answer);
          options.store.remember(
            workspace,
            "experience",
            JSON.stringify({
              objective: input.message,
              accepted: result.run.review.accepted,
              reasons: result.run.review.reasons,
            }),
            `run:${result.id}`,
          );
          event("result", {
            id: result.id,
            answer: result.answer,
            route: result.route,
            review: result.run.review,
            model: result.run.candidate.model,
          });
        } catch (error) {
          console.error(
            JSON.stringify({
              requestId,
              chat,
              error: error instanceof Error ? error.name : "UnknownError",
            }),
          );
          event("error", {
            error:
              "Task failed. Check provider configuration, available models, and supplied evidence. No verified answer was saved.",
            requestId,
          });
        } finally {
          clearInterval(heartbeat);
          inflight.delete(workspace.owner);
          res.end();
        }
        return;
      }
      send(res, 404, { error: "Endpoint not found." });
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? "Invalid request."
          : error instanceof Error
            ? error.message
            : "Request failed.";
      console.error(
        JSON.stringify({
          requestId,
          error: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      if (!res.headersSent) send(res, 400, { error: message, requestId });
      else res.end();
    }
  });
}
