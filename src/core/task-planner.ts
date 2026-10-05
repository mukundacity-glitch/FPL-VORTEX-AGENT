import type {
  AgentTask,
  TaskComplexity,
  TaskDomain,
  TaskPlan,
} from "./types.js";

const CODING_TERMS = [
  "code",
  "bug",
  "debug",
  "repository",
  "repo",
  "implement",
  "refactor",
  "test",
  "typescript",
  "javascript",
  "python",
  "github",
  "api",
  "database",
  "deploy",
];

const RESEARCH_TERMS = [
  "research",
  "compare",
  "investigate",
  "sources",
  "evidence",
  "report",
  "summarize",
  "analyse",
  "analyze",
];

const FPL_TERMS = [
  "fpl",
  "fantasy premier league",
  "captain",
  "wildcard",
  "free hit",
  "bench boost",
  "triple captain",
  "gameweek",
  "transfer",
  "fixture",
];

function containsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function inferDomain(task: AgentTask): TaskDomain {
  if (task.domain) return task.domain;

  const text = `${task.agent} ${task.objective}`.toLowerCase();
  if (containsAny(text, FPL_TERMS)) return "fpl";
  if (containsAny(text, CODING_TERMS)) return "coding";
  if (containsAny(text, RESEARCH_TERMS)) return "research";
  if (Object.keys(task.context).length > 0) return "analysis";
  return "general";
}

function inferComplexity(task: AgentTask): TaskComplexity {
  if (task.priority === "deep") return "complex";
  if (task.priority === "balanced") return "moderate";

  const objectiveWords = task.objective.trim().split(/\s+/u).filter(Boolean).length;
  const contextSize = JSON.stringify(task.context).length;
  if (objectiveWords > 80 || contextSize > 8_000) return "complex";
  if (objectiveWords > 30 || contextSize > 2_000) return "moderate";
  return "simple";
}

function buildSteps(domain: TaskDomain, requireReview: boolean): string[] {
  const common = ["Understand the objective and constraints"];

  if (domain === "coding") {
    common.push(
      "Inspect relevant code and identify root cause",
      "Implement the smallest correct change",
      "Validate with tests and static checks",
    );
  } else if (domain === "research") {
    common.push(
      "Collect and reconcile evidence",
      "Separate verified facts from inference",
      "Synthesize the answer with uncertainty called out",
    );
  } else if (domain === "fpl") {
    common.push(
      "Evaluate current FPL evidence and constraints",
      "Compare candidate decisions quantitatively",
      "Return a ranked recommendation with risks",
    );
  } else {
    common.push(
      "Break the problem into the smallest useful subproblems",
      "Solve each subproblem with explicit assumptions",
      "Synthesize a direct final answer",
    );
  }

  if (requireReview) common.push("Run independent verification before accepting");
  return common;
}

export class TaskPlanner {
  public plan(task: AgentTask): TaskPlan {
    if (!task.objective.trim()) {
      throw new Error("Task objective cannot be empty.");
    }

    const domain = inferDomain(task);
    const complexity = inferComplexity(task);
    const preferredProvider = domain === "coding" ? "openai" : "anthropic";

    return {
      domain,
      complexity,
      preferredProvider,
      fallbackProvider: preferredProvider === "openai" ? "anthropic" : "openai",
      steps: buildSteps(domain, task.requireReview),
      maxAttempts: complexity === "complex" ? 3 : 2,
    };
  }
}
