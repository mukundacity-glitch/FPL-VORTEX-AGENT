import { Buffer } from "node:buffer";
import { getVortexRuntime } from "@/lib/server/vortex-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const form = await request.formData();
    const upload = form.get("file");
    if (!(upload instanceof File)) {
      return Response.json({ error: "A file upload is required." }, { status: 400 });
    }

    const tenantId = String(form.get("tenantId") || "local-user");
    const projectId = String(form.get("projectId") || "default");
    const conversationId = String(form.get("conversationId") || "");
    const bytes = Buffer.from(await upload.arrayBuffer());
    const runtimeState = getVortexRuntime();
    const understanding = await runtimeState.fileIntelligence.analyze({
      name: upload.name,
      bytes,
      ...(upload.type ? { mimeType: upload.type } : {}),
    });

    const memory = await runtimeState.fileMemory.ingest(understanding, {
      tenantId,
      namespace: "vortex",
      projectId,
      ...(conversationId ? { conversationId } : {}),
      importance: 0.72,
    });

    return Response.json({
      file: {
        id: understanding.id,
        name: understanding.name,
        kind: understanding.kind,
        format: understanding.format,
        mimeType: understanding.mimeType,
        sizeBytes: understanding.sizeBytes,
        sectionCount: understanding.sections.length,
        childCount: understanding.children.length,
        textPreview: understanding.text.slice(0, 2_400),
        warnings: understanding.warnings,
      },
      memory: { chunks: memory.chunks, memoryIds: memory.memoryIds.length },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "File analysis failed." },
      { status: 500 },
    );
  }
}
