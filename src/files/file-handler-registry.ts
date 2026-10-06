import type { FileDetection, FileHandler } from "./types.js";

export class FileHandlerRegistry {
  private readonly handlers: FileHandler[] = [];

  public register(handler: FileHandler): void {
    if (this.handlers.some((candidate) => candidate.id === handler.id)) {
      throw new Error(`File handler ${handler.id} is already registered.`);
    }
    this.handlers.push(handler);
  }

  public registerMany(handlers: readonly FileHandler[]): void {
    for (const handler of handlers) this.register(handler);
  }

  public list(): readonly FileHandler[] {
    return [...this.handlers];
  }

  public resolve(detection: FileDetection): FileHandler | undefined {
    return this.handlers.find((handler) => handler.supports(detection));
  }
}
