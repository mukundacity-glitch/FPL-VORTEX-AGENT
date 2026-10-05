import { loadRuntimeConfig } from "./config/runtime.js";
import { TaskOrchestrator } from "./core/orchestrator.js";
import type { AgentTask } from "./core/types.js";
import { createProvider } from "./providers/factory.js";
import { CrossModelReviewer } from "./verification/cross-model-reviewer.js";

function buildTaskFromCli(): AgentTask {
  const objective = process.argv.slice(2).join(" ").trim();
  if (!objective) {
    throw new Error(
      'Provide an objective, for example: npm start -- "Compare three captain candidates."',
    );
  }

  return {
    id: crypto.randomUUID(),
    agent: "general-fpl-reasoner",
    objective,
    context: {},
    priority: "deep",
    requireReview: loadRuntimeConfig().enableCrossModelReview,
  };
}

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const primary = createProvider(config.primaryProvider, "primary", config);

  const reviewer = config.enableCrossModelReview
    ? new CrossModelReviewer(
        createProvider(config.reviewProvider, "review", config),
        config.minReviewScore,
      )
    : undefined;

  const orchestrator = new TaskOrchestrator(primary, reviewer);
  const result = await orchestrator.run(buildTaskFromCli());

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.review.accepted) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`FPL VORTEX AGENT failed: ${message}\n`);
  process.exitCode = 1;
});
