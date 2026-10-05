import { loadRuntimeConfig } from "./config/runtime.js";
import type { AgentTask } from "./core/types.js";
import { createVortexCore } from "./core/vortex-core.js";

function buildTaskFromCli(): AgentTask {
  const objective = process.argv.slice(2).join(" ").trim();
  if (!objective) {
    throw new Error(
      'Provide an objective, for example: npm start -- "Compare three captain candidates."',
    );
  }

  return {
    id: crypto.randomUUID(),
    agent: "vortex-general-reasoner",
    objective,
    context: {},
    priority: "deep",
    requireReview: true,
  };
}

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const vortex = createVortexCore(config);
  const result = await vortex.run(buildTaskFromCli());

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.review.accepted) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Vortex AI failed: ${message}\n`);
  process.exitCode = 1;
});
