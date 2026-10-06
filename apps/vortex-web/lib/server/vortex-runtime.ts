import os from "node:os";
import path from "node:path";
import {
  ConversationMemoryRecorder,
  FileMemoryBridge,
  FfmpegVideoFrameExtractor,
  JsonMemoryStore,
  KnowledgeIngestor,
  OpenAITranscriptionProvider,
  OpenAIVisionAnalyzer,
  VortexMemory,
  createDefaultFileIntelligence,
  createVortexCore,
  loadRuntimeConfig,
} from "fpl-vortex-agent";

export interface VortexWebRuntime {
  core: ReturnType<typeof createVortexCore>;
  memory: VortexMemory;
  conversationRecorder: ConversationMemoryRecorder;
  fileMemory: FileMemoryBridge;
  fileIntelligence: ReturnType<typeof createDefaultFileIntelligence>;
}

declare global {
  // eslint-disable-next-line no-var
  var __vortexWebRuntime: VortexWebRuntime | undefined;
}

function createRuntime(): VortexWebRuntime {
  const config = loadRuntimeConfig();
  const memoryPath = process.env.VORTEX_MEMORY_PATH?.trim()
    || path.join(os.tmpdir(), "vortex-ai", "memory.json");
  const memory = new VortexMemory(new JsonMemoryStore(memoryPath));
  const fileOptions: Parameters<typeof createDefaultFileIntelligence>[0] = {};

  if (config.openai.apiKey) {
    fileOptions.transcriber = new OpenAITranscriptionProvider({
      apiKey: config.openai.apiKey,
      model: process.env.VORTEX_TRANSCRIPTION_MODEL?.trim() || "gpt-transcribe",
    });
    fileOptions.vision = new OpenAIVisionAnalyzer({
      apiKey: config.openai.apiKey,
      model: process.env.VORTEX_VISION_MODEL?.trim() || config.openai.reviewModel,
    });
  }

  if (process.env.VORTEX_ENABLE_VIDEO_FRAMES === "true") {
    fileOptions.videoFrames = new FfmpegVideoFrameExtractor({
      ffmpegPath: process.env.FFMPEG_PATH?.trim() || "ffmpeg",
      ffprobePath: process.env.FFPROBE_PATH?.trim() || "ffprobe",
    });
  }

  return {
    core: createVortexCore(config),
    memory,
    conversationRecorder: new ConversationMemoryRecorder(memory),
    fileMemory: new FileMemoryBridge(new KnowledgeIngestor(memory)),
    fileIntelligence: createDefaultFileIntelligence(fileOptions),
  };
}

export function getVortexRuntime(): VortexWebRuntime {
  if (!globalThis.__vortexWebRuntime) globalThis.__vortexWebRuntime = createRuntime();
  return globalThis.__vortexWebRuntime;
}
