import { spawn } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import type { SandboxExecutor, SandboxRequest, SandboxResult } from "./types.js";

export interface SubprocessSandboxOptions {
  workspaceRoot: string;
  allowedCommands: readonly string[];
  defaultTimeoutMs?: number;
  maxOutputBytes?: number;
}

function ensureInsideWorkspace(root: string, candidate: string): string {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(resolvedRoot, candidate);
  const rel = relative(resolvedRoot, resolvedCandidate);
  if (rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rel)) {
    throw new Error("Sandbox cwd must stay inside the configured workspace.");
  }
  return resolvedCandidate;
}

export class SubprocessSandbox implements SandboxExecutor {
  private readonly allowedCommands: ReadonlySet<string>;
  private readonly defaultTimeoutMs: number;
  private readonly maxOutputBytes: number;

  public constructor(private readonly options: SubprocessSandboxOptions) {
    this.allowedCommands = new Set(options.allowedCommands);
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
    this.maxOutputBytes = options.maxOutputBytes ?? 1_000_000;
  }

  public async execute(request: SandboxRequest): Promise<SandboxResult> {
    if (!this.allowedCommands.has(request.command)) {
      throw new Error(`Command ${request.command} is not allowed by sandbox policy.`);
    }

    const cwd = ensureInsideWorkspace(this.options.workspaceRoot, request.cwd ?? ".");
    const timeoutMs = Math.max(1, request.timeoutMs ?? this.defaultTimeoutMs);
    const args = [...(request.args ?? [])];

    return await new Promise<SandboxResult>((resolvePromise, reject) => {
      const child = spawn(request.command, args, {
        cwd,
        shell: false,
        windowsHide: true,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          TMPDIR: process.env.TMPDIR ?? "/tmp",
          ...request.env,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let outputBytes = 0;
      let truncated = false;
      let timedOut = false;

      const append = (target: "stdout" | "stderr", chunk: Buffer): void => {
        const remaining = this.maxOutputBytes - outputBytes;
        if (remaining <= 0) {
          truncated = true;
          return;
        }
        const text = chunk.subarray(0, remaining).toString("utf8");
        outputBytes += Buffer.byteLength(text);
        if (target === "stdout") stdout += text;
        else stderr += text;
        if (chunk.byteLength > remaining) truncated = true;
      };

      child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
      child.on("error", reject);

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      child.on("close", (exitCode) => {
        clearTimeout(timer);
        resolvePromise({
          command: [request.command, ...args].join(" "),
          exitCode,
          stdout,
          stderr,
          timedOut,
          truncated,
        });
      });
    });
  }
}
