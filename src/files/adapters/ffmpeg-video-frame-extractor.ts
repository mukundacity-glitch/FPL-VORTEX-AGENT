import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FileSource, VideoFrame, VideoFrameExtractor } from "../types.js";

interface ProcessResult { stdout: string; stderr: string; code: number; }

function run(command: string, args: readonly string[], timeoutMs = 60_000): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} exceeded timeout ${timeoutMs}ms.`));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });
}

function safeExtension(name: string): string {
  const extension = path.extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/u.test(extension) ? extension : ".mp4";
}

export interface FfmpegVideoFrameExtractorOptions {
  ffmpegPath?: string;
  ffprobePath?: string;
  timeoutMs?: number;
}

export class FfmpegVideoFrameExtractor implements VideoFrameExtractor {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly timeoutMs: number;

  public constructor(options: FfmpegVideoFrameExtractorOptions = {}) {
    this.ffmpegPath = options.ffmpegPath ?? "ffmpeg";
    this.ffprobePath = options.ffprobePath ?? "ffprobe";
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  public async extract(source: FileSource, maxFrames: number): Promise<readonly VideoFrame[]> {
    const directory = await mkdtemp(path.join(os.tmpdir(), "vortex-video-"));
    try {
      const inputPath = path.join(directory, `input${safeExtension(source.name)}`);
      await writeFile(inputPath, source.bytes);
      const probe = await run(this.ffprobePath, [
        "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", inputPath,
      ], this.timeoutMs);
      if (probe.code !== 0) throw new Error(`ffprobe failed: ${probe.stderr.slice(0, 600)}`);
      const duration = Number(probe.stdout.trim());
      const count = Math.max(1, Math.min(Math.max(1, maxFrames), Number.isFinite(duration) && duration > 0 ? maxFrames : 1));
      const frames: VideoFrame[] = [];

      for (let index = 0; index < count; index += 1) {
        const timestamp = Number.isFinite(duration) && duration > 0
          ? Math.min(duration, duration * ((index + 0.5) / count))
          : 0;
        const outputPath = path.join(directory, `frame-${index + 1}.jpg`);
        const result = await run(this.ffmpegPath, [
          "-hide_banner", "-loglevel", "error", "-ss", timestamp.toFixed(3),
          "-i", inputPath, "-frames:v", "1", "-q:v", "3", outputPath,
        ], this.timeoutMs);
        if (result.code !== 0) throw new Error(`ffmpeg failed: ${result.stderr.slice(0, 600)}`);
        frames.push({
          timestampSeconds: timestamp,
          source: { name: `frame-${index + 1}.jpg`, bytes: await readFile(outputPath), mimeType: "image/jpeg" },
        });
      }
      return frames;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
