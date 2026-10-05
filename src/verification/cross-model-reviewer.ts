import type { AgentTask, ModelResponse, ReviewResult } from "../core/types.js";
import type { ModelProvider } from "../providers/model-provider.js";
import type { AnswerReviewer } from "./reviewer.js";

interface ParsedReview {
  accepted: boolean;
  score: number;
  reasons: string[];
}

function parseReview(text: string): ParsedReview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("Reviewer returned invalid JSON.", { cause: error });
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Reviewer response must be a JSON object.");
  }

  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.accepted !== "boolean") {
    throw new Error("Reviewer JSON is missing boolean accepted.");
  }
  if (
    typeof candidate.score !== "number"
    || !Number.isFinite(candidate.score)
    || candidate.score < 0
    || candidate.score > 1
  ) {
    throw new Error("Reviewer score must be a number between 0 and 1.");
  }
  if (
    !Array.isArray(candidate.reasons)
    || !candidate.reasons.every((reason) => typeof reason === "string")
  ) {
    throw new Error("Reviewer reasons must be an array of strings.");
  }

  return {
    accepted: candidate.accepted,
    score: candidate.score,
    reasons: candidate.reasons,
  };
}

export class CrossModelReviewer implements AnswerReviewer {
  public constructor(
    private readonly provider: ModelProvider,
    private readonly minimumScore: number,
  ) {
    if (minimumScore < 0 || minimumScore > 1 || !Number.isFinite(minimumScore)) {
      throw new Error("minimumScore must be between 0 and 1.");
    }
  }

  public async review(task: AgentTask, answer: ModelResponse): Promise<ReviewResult> {
    const reviewer = await this.provider.generate({
      systemPrompt: [
        "You are the independent verification layer inside Vortex AI.",
        "Evaluate factual grounding, internal consistency, missing constraints, unsafe assumptions, and whether the answer satisfies the objective.",
        "For coding work, also check likely regressions, tests, error handling, and whether the answer addresses root cause rather than symptoms.",
        "Return ONLY strict JSON with this exact shape:",
        '{"accepted":true,"score":0.95,"reasons":["reason"]}',
        "score must be between 0 and 1.",
      ].join("\n"),
      userPrompt: [
        `TASK: ${task.objective}`,
        `AGENT: ${task.agent}`,
        `DOMAIN: ${task.domain ?? "auto"}`,
        `CONTEXT: ${JSON.stringify(task.context)}`,
        `CANDIDATE_PROVIDER: ${answer.provider}`,
        `CANDIDATE_MODEL: ${answer.model}`,
        `CANDIDATE_ANSWER:\n${answer.text}`,
      ].join("\n\n"),
      maxOutputTokens: 1_500,
      temperature: 0,
    });

    const parsed = parseReview(reviewer.text);
    return {
      accepted: parsed.accepted && parsed.score >= this.minimumScore,
      score: parsed.score,
      reasons: parsed.reasons,
      reviewer,
    };
  }
}
