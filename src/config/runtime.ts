import type { ProviderName } from "../core/types.js";

export interface RuntimeConfig {
  primaryProvider: ProviderName;
  reviewProvider: ProviderName;
  enableCrossModelReview: boolean;
  minReviewScore: number;
  openai: {
    apiKey: string;
    primaryModel: string;
    reviewModel: string;
  };
  anthropic: {
    apiKey: string;
    primaryModel: string;
    reviewModel: string;
  };
  fplBaseUrl: string;
}

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function parseProvider(value: string, fallback: ProviderName): ProviderName {
  if (!value) return fallback;
  if (value === "openai" || value === "anthropic") return value;
  throw new Error(`${value} is not a supported provider.`);
}

function parseBoolean(value: string, fallback: boolean): boolean {
  if (!value) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Expected boolean value, received: ${value}`);
}

function parseScore(value: string, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error("MIN_REVIEW_SCORE must be between 0 and 1.");
  }
  return parsed;
}

export function loadRuntimeConfig(): RuntimeConfig {
  return {
    primaryProvider: parseProvider(env("PRIMARY_PROVIDER"), "openai"),
    reviewProvider: parseProvider(env("REVIEW_PROVIDER"), "anthropic"),
    enableCrossModelReview: parseBoolean(env("ENABLE_CROSS_MODEL_REVIEW"), true),
    minReviewScore: parseScore(env("MIN_REVIEW_SCORE"), 0.8),
    openai: {
      apiKey: env("OPENAI_API_KEY"),
      primaryModel: env("OPENAI_PRIMARY_MODEL"),
      reviewModel: env("OPENAI_REVIEW_MODEL"),
    },
    anthropic: {
      apiKey: env("ANTHROPIC_API_KEY"),
      primaryModel: env("ANTHROPIC_PRIMARY_MODEL"),
      reviewModel: env("ANTHROPIC_REVIEW_MODEL"),
    },
    fplBaseUrl: env("FPL_BASE_URL") || "https://fantasy.premierleague.com/api",
  };
}
