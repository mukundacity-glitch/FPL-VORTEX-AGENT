export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    name: "Vortex AI",
    phase: 6,
    deployed: false,
    timestamp: new Date().toISOString(),
  });
}
