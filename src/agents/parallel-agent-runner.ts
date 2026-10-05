import type { AgentExecutionResult, AgentExecutor, AgentRunInput } from "./types.js";

export interface ParallelAgentRequest {
  agent: AgentExecutor;
  input: AgentRunInput;
}

export class ParallelAgentRunner {
  public constructor(private readonly maxConcurrency = 4) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new Error("maxConcurrency must be a positive integer.");
    }
  }

  public async runAll(requests: readonly ParallelAgentRequest[]): Promise<AgentExecutionResult[]> {
    if (requests.length === 0) return [];

    const results = new Array<AgentExecutionResult | undefined>(requests.length);
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= requests.length) return;
        const request = requests[index];
        if (!request) return;
        results[index] = await request.agent.run(request.input);
      }
    };

    const workerCount = Math.min(this.maxConcurrency, requests.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    return results.map((result, index) => {
      if (!result) throw new Error(`Missing parallel agent result at index ${index}.`);
      return result;
    });
  }
}
