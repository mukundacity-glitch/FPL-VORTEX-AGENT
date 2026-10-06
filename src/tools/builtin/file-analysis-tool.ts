import { realpath } from "node:fs/promises";
import path from "node:path";
import type { FileIntelligence } from "../../files/file-intelligence.js";
import type { AnyToolDefinition } from "../types.js";

export interface FileAnalysisToolOptions {
  intelligence: FileIntelligence;
  allowedRoots: readonly string[];
}

function objectInput(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null) throw new Error("Expected object input.");
  return input as Record<string, unknown>;
}

function requiredPath(input: unknown): string {
  const value = objectInput(input).path;
  if (typeof value !== "string" || !value.trim()) throw new Error("path must be a non-empty string.");
  return value;
}

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function createFileAnalysisTool(options: FileAnalysisToolOptions): AnyToolDefinition {
  return {
    name: "file.analyze",
    description: "Analyze an allowlisted local file and return structured Vortex file understanding.",
    permissions: ["read", "network"],
    validate: (input) => ({ path: requiredPath(input) }),
    execute: async ({ path: requestedPath }) => {
      const candidate = await realpath(requestedPath);
      const roots = await Promise.all(options.allowedRoots.map(async (root) => await realpath(root)));
      if (!roots.some((root) => inside(root, candidate))) {
        return { ok: false, error: "File path is outside the configured Vortex file roots." };
      }
      const result = await options.intelligence.analyzePath(candidate);
      return { ok: true, data: result };
    },
  };
}
