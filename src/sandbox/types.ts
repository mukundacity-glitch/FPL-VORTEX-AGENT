export interface SandboxRequest {
  command: string;
  args?: readonly string[];
  cwd?: string;
  timeoutMs?: number;
  env?: Readonly<Record<string, string>>;
}

export interface SandboxResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
}

export interface SandboxExecutor {
  execute(request: SandboxRequest): Promise<SandboxResult>;
}
