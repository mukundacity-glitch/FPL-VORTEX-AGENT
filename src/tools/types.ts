export type ToolPermission =
  | "read"
  | "network"
  | "write"
  | "execute"
  | "external_side_effect";

export interface ToolContext {
  taskId: string;
  agentId: string;
  signal?: AbortSignal;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  permissions: readonly ToolPermission[];
  validate?: (input: unknown) => TInput;
  execute: (input: TInput, context: ToolContext) => Promise<ToolResult<TOutput>>;
}

export type AnyToolDefinition = ToolDefinition<any, any>;

export type ApprovalDecision = "allow_once" | "deny";

export interface ApprovalRequest {
  tool: string;
  permissions: readonly ToolPermission[];
  input: unknown;
  context: ToolContext;
  reason: string;
}

export type ApprovalHandler = (
  request: ApprovalRequest,
) => Promise<ApprovalDecision> | ApprovalDecision;
