import type { SandboxExecutor } from "../../sandbox/types.js";
import type { AnyToolDefinition } from "../types.js";

function objectInput(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null) throw new Error("Expected object input.");
  return input as Record<string, unknown>;
}

function requiredString(input: unknown, key: string): string {
  const value = objectInput(input)[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must be a non-empty string.`);
  return value;
}

async function runBrowser(
  sandbox: SandboxExecutor,
  session: string,
  args: readonly string[],
) {
  return await sandbox.execute({
    command: "agent-browser",
    args: ["--session", session, ...args],
    timeoutMs: 30_000,
  });
}

export function createBrowserTools(
  sandbox: SandboxExecutor,
  session = "vortex",
): AnyToolDefinition[] {
  return [
    {
      name: "browser.open",
      description: "Open a URL in the Vortex browser session.",
      permissions: ["network"],
      validate: (input: unknown) => ({ url: requiredString(input, "url") }),
      execute: async ({ url }: { url: string }) => {
        const result = await runBrowser(sandbox, session, ["open", url]);
        return { ok: result.exitCode === 0, data: result, ...(result.exitCode === 0 ? {} : { error: result.stderr }) };
      },
    },
    {
      name: "browser.snapshot",
      description: "Read the current browser page as an interactive accessibility snapshot.",
      permissions: ["read", "network"],
      execute: async () => {
        const result = await runBrowser(sandbox, session, ["snapshot", "-i"]);
        return { ok: result.exitCode === 0, data: result.stdout, ...(result.exitCode === 0 ? {} : { error: result.stderr }) };
      },
    },
    {
      name: "browser.click",
      description: "Click an interactive browser element reference such as @e1.",
      permissions: ["network", "external_side_effect"],
      validate: (input: unknown) => ({ ref: requiredString(input, "ref") }),
      execute: async ({ ref }: { ref: string }) => {
        const result = await runBrowser(sandbox, session, ["click", ref]);
        return { ok: result.exitCode === 0, data: result.stdout, ...(result.exitCode === 0 ? {} : { error: result.stderr }) };
      },
    },
    {
      name: "browser.fill",
      description: "Fill a browser field. Requires approval because it changes external page state.",
      permissions: ["network", "external_side_effect"],
      validate: (input: unknown) => ({
        ref: requiredString(input, "ref"),
        value: requiredString(input, "value"),
      }),
      execute: async ({ ref, value }: { ref: string; value: string }) => {
        const result = await runBrowser(sandbox, session, ["fill", ref, value]);
        return { ok: result.exitCode === 0, data: result.stdout, ...(result.exitCode === 0 ? {} : { error: result.stderr }) };
      },
    },
  ];
}
