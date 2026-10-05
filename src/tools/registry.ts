import { z } from "zod";
export interface ToolContext {
  owner: string;
  project: string;
  signal: AbortSignal;
}
export interface Tool<T = unknown> {
  name: string;
  description: string;
  input: z.ZodType<T>;
  effect: "read" | "write";
  execute(input: T, context: ToolContext): Promise<unknown>;
}
export class ToolRegistry {
  private readonly tools = new Map<string, Tool<any>>();
  register<T>(tool: Tool<T>): void {
    if (this.tools.has(tool.name)) throw new Error("Duplicate tool.");
    this.tools.set(tool.name, tool);
  }
  list() {
    return [...this.tools.values()].map(
      ({ name, description, effect, input }) => ({
        name,
        description,
        effect,
        inputSchema: z.toJSONSchema(input),
      }),
    );
  }
  async call(
    name: string,
    input: unknown,
    context: ToolContext,
    allowWrite = false,
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error("Unknown tool.");
    if (tool.effect === "write" && !allowWrite)
      throw new Error("Tool requires write permission.");
    context.signal.throwIfAborted();
    return tool.execute(tool.input.parse(input), context);
  }
}
