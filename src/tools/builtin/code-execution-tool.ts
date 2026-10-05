import type { SandboxExecutor, SandboxRequest } from "../../sandbox/types.js";
import type { ToolDefinition } from "../types.js";

function validateSandboxRequest(input: unknown): SandboxRequest {
  if (typeof input !== "object" || input === null) {
    throw new Error("Expected an object input.");
  }
  const value = input as Record<string, unknown>;
  if (typeof value.command !== "string" || !value.command.trim()) {
    throw new Error("command must be a non-empty string.");
  }
  if (value.args !== undefined && (!Array.isArray(value.args) || !value.args.every((item) => typeof item === "string"))) {
    throw new Error("args must be an array of strings.");
  }
  if (value.cwd !== undefined && typeof value.cwd !== "string") {
    throw new Error("cwd must be a string.");
  }
  if (value.timeoutMs !== undefined && (typeof value.timeoutMs !== "number" || !Number.isFinite(value.timeoutMs))) {
    throw new Error("timeoutMs must be a finite number.");
  }

  return {
    command: value.command,
    ...(value.args === undefined ? {} : { args: value.args as string[] }),
    ...(value.cwd === undefined ? {} : { cwd: value.cwd as string }),
    ...(value.timeoutMs === undefined ? {} : { timeoutMs: value.timeoutMs as number }),
  };
}

export function createCodeExecutionTool(sandbox: SandboxExecutor): ToolDefinition<SandboxRequest> {
  return {
    name: "code.execute",
    description: "Run an allowlisted command inside the configured Vortex workspace sandbox.",
    permissions: ["execute"],
    validate: validateSandboxRequest,
    execute: async (input) => {
      const result = await sandbox.execute(input);
      return {
        ok: result.exitCode === 0 && !result.timedOut,
        data: result,
        ...(result.exitCode === 0 && !result.timedOut
          ? {}
          : { error: result.timedOut ? "Sandbox command timed out." : `Command exited with code ${result.exitCode}.` }),
      };
    },
  };
}
