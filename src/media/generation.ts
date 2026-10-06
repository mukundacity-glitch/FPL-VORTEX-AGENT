import OpenAI from "openai";
import type { Store, Scope } from "../memory/store.js";
export type MediaKind = "image" | "video";
export interface Generation {
  id: string;
  kind: MediaKind;
  prompt: string;
  model: string;
  status: "submitting" | "queued" | "in_progress" | "completed" | "failed";
  progress: number;
  createdAt: string;
  error?: string;
  providerId?: string;
}
export interface MediaProvider {
  image(prompt: string): Promise<Buffer>;
  startVideo(prompt: string): Promise<string>;
  video(id: string): Promise<{
    status: "queued" | "in_progress" | "completed" | "failed";
    progress: number;
  }>;
  download(id: string): Promise<Buffer>;
}
export class OpenAIMediaProvider implements MediaProvider {
  private readonly client: OpenAI;
  constructor(
    apiKey: string,
    readonly imageModel: string,
    readonly videoModel: "sora-2" | "sora-2-pro",
  ) {
    // Never automatically repeat a potentially billed creation request.
    this.client = new OpenAI({ apiKey, timeout: 180000, maxRetries: 0 });
  }
  async image(prompt: string) {
    const result = await this.client.images.generate({
      model: this.imageModel,
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "medium",
      output_format: "png",
    });
    if (!result.data?.[0]?.b64_json) throw new Error("Image unavailable.");
    return Buffer.from(result.data[0].b64_json, "base64");
  }
  async startVideo(prompt: string) {
    return (
      await this.client.videos.create({
        model: this.videoModel,
        prompt,
        seconds: "4",
        size: "1280x720",
      })
    ).id;
  }
  async video(id: string) {
    const result = await this.client.videos.retrieve(id);
    return { status: result.status, progress: result.progress };
  }
  async download(id: string) {
    const response = await this.client.videos.downloadContent(id);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Video unavailable.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 64 * 1024 * 1024)
          throw new Error("Video exceeds storage limit.");
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
    }
    return Buffer.concat(chunks);
  }
}
function safeError(error: unknown): string {
  const status = error instanceof OpenAI.APIError ? error.status : undefined;
  if (status === 401)
    return "The API key was rejected. Update the server key and restart.";
  if (status === 403 || status === 404)
    return "This model is unavailable to your API account. Check model access and server settings.";
  if (status === 429)
    return "The provider quota or rate limit was reached. Check API billing and limits.";
  if (status === 400)
    return "The provider rejected this prompt or generation settings. Try a different prompt.";
  return "Generation could not be completed. Check provider access and connection. It was not automatically retried.";
}
export class GenerationService {
  private readonly refreshing = new Map<string, Promise<Generation>>();
  private readonly checked = new Map<string, number>();
  constructor(
    private readonly store: Store,
    private readonly provider: MediaProvider | undefined,
    readonly imageModel: string,
    readonly videoModel: string,
  ) {
    store.interruptGenerations();
  }
  get configured() {
    return !!this.provider;
  }
  list(scope: Scope) {
    return this.store.generations(scope);
  }
  create(
    scope: Scope,
    id: string,
    kind: MediaKind,
    prompt: string,
  ): Generation {
    const existing = this.store.generation(scope, id);
    if (existing) {
      if (existing.kind !== kind || existing.prompt !== prompt)
        throw new Error("Request ID already belongs to another prompt.");
      return existing;
    }
    if (!this.provider)
      throw new Error(
        "Add OPENAI_API_KEY in the server .env file and restart to generate media.",
      );
    if (this.store.activeGenerations(scope.owner) >= 2)
      throw new Error(
        "Two generations are already running. Wait for one to finish.",
      );
    const job: Generation = {
      id,
      kind,
      prompt,
      model: kind === "image" ? this.imageModel : this.videoModel,
      status: "submitting",
      progress: 0,
      createdAt: new Date().toISOString(),
    };
    this.store.saveGeneration(scope, job);
    void this.submit(scope, job);
    return job;
  }
  private async submit(scope: Scope, job: Generation) {
    try {
      if (job.kind === "image") {
        const asset = await this.provider!.image(job.prompt);
        if (asset.length > 64 * 1024 * 1024)
          throw new Error("Image too large.");
        this.store.saveGeneration(
          scope,
          { ...job, status: "completed", progress: 100 },
          asset,
        );
      } else {
        const providerId = await this.provider!.startVideo(job.prompt);
        this.store.saveGeneration(scope, {
          ...job,
          status: "queued",
          providerId,
        });
      }
    } catch (error) {
      this.store.saveGeneration(scope, {
        ...job,
        status: "failed",
        error: safeError(error),
      });
    }
  }
  async get(scope: Scope, id: string): Promise<Generation> {
    const job = this.store.generation(scope, id);
    if (!job) throw new Error("Generation not found in this project.");
    if (
      !job.providerId ||
      !this.provider ||
      !["queued", "in_progress"].includes(job.status)
    )
      return job;
    const pending = this.refreshing.get(id);
    if (pending) return pending;
    if (Date.now() - (this.checked.get(id) ?? 0) < 5000) return job;
    this.checked.set(id, Date.now());
    const task = this.refresh(scope, job);
    this.refreshing.set(id, task);
    try {
      return await task;
    } finally {
      this.refreshing.delete(id);
    }
  }
  private async refresh(scope: Scope, job: Generation) {
    try {
      const state = await this.provider!.video(job.providerId!);
      const next: Generation = {
        ...job,
        ...state,
        progress: Math.max(0, Math.min(100, state.progress)),
      };
      if (state.status === "failed")
        next.error =
          "The provider could not generate this video. Try a different prompt.";
      const asset =
        state.status === "completed"
          ? await this.provider!.download(job.providerId!)
          : undefined;
      this.store.saveGeneration(scope, next, asset);
      return next;
    } catch {
      // A polling/download failure is safe to retry; creation is never repeated.
      return {
        ...job,
        error:
          "Status temporarily unavailable. Open this result later to check again.",
      };
    }
  }
}
export function publicGeneration(job: Generation) {
  const { providerId: _private, ...publicJob } = job;
  return publicJob;
}
