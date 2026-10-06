import { randomUUID } from "node:crypto";
import { getVortexRuntime } from "@/lib/server/vortex-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatRequestBody {
  message?: string;
  tenantId?: string;
  projectId?: string;
  conversationId?: string;
  mode?: "fast" | "balanced" | "deep";
  requireReview?: boolean;
  attachedFiles?: Array<{ id: string; name: string; kind: string; format: string }>;
}

function event(data: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(data)}\n`);
}

export async function POST(request: Request): Promise<Response> {
  let body: ChatRequestBody;
  try {
    body = await request.json() as ChatRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const message = body.message?.trim() ?? "";
  if (!message) return Response.json({ error: "Message is required." }, { status: 400 });
  if (message.length > 80_000) return Response.json({ error: "Message is too large." }, { status: 413 });

  const tenantId = body.tenantId?.trim() || "local-user";
  const projectId = body.projectId?.trim() || "default";
  const conversationId = body.conversationId?.trim() || randomUUID();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(event(data));
      try {
        send({ type: "status", label: "Planning task" });
        const runtimeState = getVortexRuntime();

        const [conversationMemory, projectMemory] = await Promise.all([
          runtimeState.memory.buildContext({
            tenantId,
            namespace: "vortex",
            scopes: ["conversation"],
            conversationId,
            text: message,
            limit: 8,
            maxCharacters: 6_000,
          }),
          runtimeState.memory.buildContext({
            tenantId,
            namespace: "vortex",
            scopes: ["project", "file", "agent"],
            projectId,
            text: message,
            limit: 10,
            maxCharacters: 10_000,
          }),
        ]);

        send({ type: "status", label: "Retrieving project memory" });
        const fileNames = (body.attachedFiles ?? []).map((file) => file.name).join(", ");
        const memoryContext = [conversationMemory, projectMemory].filter(Boolean).join("\n\n");
        const context: Record<string, unknown> = {
          projectId,
          conversationId,
          ...(fileNames ? { attachedFiles: fileNames } : {}),
          ...(memoryContext ? { memory: memoryContext } : {}),
        };

        send({ type: "status", label: "Routing to Vortex intelligence" });
        const result = await runtimeState.core.run({
          id: randomUUID(),
          agent: "vortex-web",
          objective: message,
          context,
          priority: body.mode ?? "deep",
          requireReview: body.requireReview ?? true,
        });

        send({ type: "status", label: "Independent verification complete" });
        await runtimeState.conversationRecorder.recordTurn({
          tenantId,
          namespace: "vortex",
          conversationId,
          projectId,
          userMessage: message,
          assistantMessage: result.candidate.text,
          source: "vortex-web",
        });

        send({
          type: "result",
          text: result.candidate.text,
          provider: result.candidate.provider,
          model: result.candidate.model,
          reviewScore: result.review.score,
          attempts: result.attempts.length,
          conversationId,
        });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Vortex failed to complete the request.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
