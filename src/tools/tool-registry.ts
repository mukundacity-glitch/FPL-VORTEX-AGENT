import { PermissionPolicyEngine } from "./permission-policy.js";
import type {
  AnyToolDefinition,
  ApprovalHandler,
  ToolContext,
  ToolResult,
} from "./types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, AnyToolDefinition>();

  public constructor(
    private readonly policy = new PermissionPolicyEngine(),
    private readonly approvalHandler?: ApprovalHandler,
  ) {}

  public register(tool: AnyToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  public registerMany(tools: readonly AnyToolDefinition[]): void {
    for (const tool of tools) this.register(tool);
  }

  public list(): AnyToolDefinition[] {
    return [...this.tools.values()];
  }

  public get(name: string): AnyToolDefinition | undefined {
    return this.tools.get(name);
  }

  public async execute(
    name: string,
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { ok: false, error: `Unknown tool: ${name}` };
    }

    const evaluation = this.policy.evaluate(tool);
    if (!evaluation.allowed) {
      return { ok: false, error: evaluation.reason };
    }

    if (evaluation.requiresApproval) {
      if (!this.approvalHandler) {
        return {
          ok: false,
          error: `Approval required for ${name}, but no approval handler is configured.`,
          metadata: { approvalRequired: true },
        };
      }

      const decision = await this.approvalHandler({
        tool: name,
        permissions: tool.permissions,
        input,
        context,
        reason: evaluation.reason,
      });
      if (decision !== "allow_once") {
        return { ok: false, error: `Execution of ${name} was denied.` };
      }
    }

    let parsedInput: unknown = input;
    try {
      parsedInput = tool.validate ? tool.validate(input) : input;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `Invalid input for ${name}: ${message}` };
    }

    try {
      return await tool.execute(parsedInput, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `Tool ${name} failed: ${message}` };
    }
  }
}
