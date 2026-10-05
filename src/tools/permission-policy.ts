import type { ToolDefinition, ToolPermission } from "./types.js";

export type PermissionMode = "auto" | "ask" | "deny";

export type PermissionPolicy = Readonly<Partial<Record<ToolPermission, PermissionMode>>>;

export interface PermissionEvaluation {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
}

const DEFAULT_POLICY: Readonly<Record<ToolPermission, PermissionMode>> = {
  read: "auto",
  network: "auto",
  write: "ask",
  execute: "ask",
  external_side_effect: "ask",
};

export class PermissionPolicyEngine {
  private readonly policy: Readonly<Record<ToolPermission, PermissionMode>>;

  public constructor(policy: PermissionPolicy = {}) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  public evaluate(tool: ToolDefinition): PermissionEvaluation {
    const modes = tool.permissions.map((permission) => this.policy[permission]);

    if (modes.includes("deny")) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: `Tool ${tool.name} requests a permission denied by policy.`,
      };
    }

    if (modes.includes("ask")) {
      return {
        allowed: true,
        requiresApproval: true,
        reason: `Tool ${tool.name} requires approval for privileged permissions.`,
      };
    }

    return {
      allowed: true,
      requiresApproval: false,
      reason: `Tool ${tool.name} is allowed automatically by policy.`,
    };
  }
}
