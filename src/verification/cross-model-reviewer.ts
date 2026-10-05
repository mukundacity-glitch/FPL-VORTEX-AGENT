import type { AgentTask, ModelResponse, ReviewResult } from "../core/types.js";
import type { ModelProvider } from "../providers/model-provider.js";

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

export class CrossModelReviewer {
  public constructor(
    private readonly provider: ModelProvider,
    private readonly minimumScore: number,
  ) {}

  public async review(task: AgentTask, answer: ModelResponse): Promise<ReviewResult> {
    const reviewer = await this.provider.generate({
      systemPrompt: [
        "You are an independent verification model.",
        "Check factual grounding, internal consistency, missing constraints, unsafe assumptions, and whether the answer satisfies the stated objective.",
        "Return ONLY strict JSON with this exact shape:",
        '{"accepted":true,"score":0.95,"reasons":["reason"]}',
        "score must be between 0 and 1.",
      ].join("\n"),
      userPrompt: [
        `TASK: ${task.objective}`,
        `AGENT: ${task.agent}`,
        `CONTEXT: ${JSON.stringify(task.context)}`,
        `CANDIDATE_PROVIDER: ${answer.provider}`,
        `CANDIDATE_MODEL: ${answer.model}`,
        `CANDIDATE_ANSWER:\n${answer.text}`,
      ].join("\n\n"),
      maxOutputTokens: 1200,
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
