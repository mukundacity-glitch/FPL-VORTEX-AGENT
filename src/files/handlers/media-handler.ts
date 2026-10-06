import type { FileHandler, FileHandlerOutput, FileSection, FileSource } from "../types.js";

export class MediaFileHandler implements FileHandler {
  public readonly id = "media";

  public supports(detection: { kind: string }): boolean {
    return detection.kind === "audio" || detection.kind === "video";
  }

  public async extract(source: FileSource, context: Parameters<FileHandler["extract"]>[1]): Promise<FileHandlerOutput> {
    const sections: FileSection[] = [];
    const warnings: string[] = [];
    const metadata: Record<string, unknown> = {};

    if (context.transcriber) {
      try {
        const transcript = await context.transcriber.transcribe(source);
        sections.push({
          id: "transcript",
          title: "Transcript",
          kind: "transcript",
          text: transcript.text,
          metadata: {
            ...(transcript.language ? { language: transcript.language } : {}),
            ...(transcript.durationSeconds !== undefined ? { durationSeconds: transcript.durationSeconds } : {}),
            ...(transcript.metadata ?? {}),
          },
        });
        if (transcript.language) metadata.language = transcript.language;
        if (transcript.durationSeconds !== undefined) metadata.durationSeconds = transcript.durationSeconds;
      } catch (error) {
        warnings.push(`Transcription failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      warnings.push("No transcription provider configured; speech content was not transcribed.");
    }

    if (context.detection.kind === "video") {
      if (context.videoFrames && context.vision) {
        try {
          const frames = await context.videoFrames.extract(source, context.limits.maxVideoFrames);
          metadata.framesExtracted = frames.length;
          for (const [index, frame] of frames.entries()) {
            const result = await context.vision.analyzeImage(
              frame.source,
              `This is a representative video frame at ${frame.timestampSeconds.toFixed(2)} seconds. Describe visible people, objects, text, actions, charts, UI, and scene context precisely.`,
            );
            sections.push({
              id: `frame-${index + 1}`,
              title: `Frame ${index + 1} @ ${frame.timestampSeconds.toFixed(2)}s`,
              kind: "video-frame",
              text: result.text,
              metadata: { timestampSeconds: frame.timestampSeconds, ...(result.metadata ?? {}) },
            });
          }
        } catch (error) {
          warnings.push(`Video frame analysis failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        warnings.push("Visual video analysis requires both a video-frame extractor and vision analyzer.");
      }
    }

    return {
      text: sections.map((section) => `# ${section.title ?? section.id}\n${section.text}`).join("\n\n"),
      sections,
      metadata,
      warnings,
    };
  }
}
