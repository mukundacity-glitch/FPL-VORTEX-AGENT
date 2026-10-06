# Phase 4 — Universal File Intelligence

Phase 4 turns files into structured, searchable Vortex knowledge instead of treating uploads as opaque attachments.

## Supported extraction paths

- Plain text, Markdown, source code, JSON/JSONL, CSV/TSV, XML and HTML
- PDF text by page using PDF.js
- DOCX semantic text using Mammoth
- XLSX worksheets with row/cell text preserved by sheet
- PPTX slide text preserved by slide
- ZIP archives with recursive child analysis
- PNG/JPEG/GIF/WebP metadata plus optional multimodal vision analysis
- MP3/WAV/M4A/FLAC/OGG transcription through a pluggable transcription provider
- MP4/MOV/M4V/WebM transcription plus optional representative-frame vision analysis

## Safety boundaries

The pipeline enforces maximum file size, extracted text size, archive depth, archive member count, total expanded archive bytes and video-frame count. Archive paths containing traversal segments are rejected. The `file.analyze` agent tool resolves real paths and only reads files beneath configured roots.

## Multimodal adapters

`OpenAITranscriptionProvider` defaults to `gpt-transcribe`. `OpenAIVisionAnalyzer` is configurable and defaults to `gpt-6-astra`. `FfmpegVideoFrameExtractor` invokes `ffmpeg` and `ffprobe` without a shell and samples bounded representative frames. All adapters are interfaces, so Anthropic or future providers can be added without changing file handlers.

## Memory integration

`FileMemoryBridge` sends extracted file knowledge into the Phase-3 `KnowledgeIngestor` under `scope: file`. Each root or archive child retains its own file ID and source metadata. This lets Vortex retrieve relevant portions later without re-sending an entire large file on every prompt.

## Production deployment notes

- API keys stay in deployment secrets, never Git.
- FFmpeg is optional; video transcription still works without frame extraction when a transcription provider supports the video container.
- The browser upload layer should stream to controlled temporary/object storage, then pass bytes or a safe path into `FileIntelligence`.
- Malformed or unsupported files return warnings instead of being silently treated as valid text.
