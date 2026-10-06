import assert from "node:assert/strict";
import test from "node:test";
import AdmZip from "adm-zip";
import { InMemoryMemoryStore } from "../memory/memory-store.js";
import { KnowledgeIngestor } from "../memory/knowledge-ingestor.js";
import { VortexMemory } from "../memory/vortex-memory.js";
import { createDefaultFileIntelligence } from "./default-file-intelligence.js";
import { detectFileType } from "./file-type-detector.js";
import { FileMemoryBridge } from "./file-memory-bridge.js";
import type { FileSource, TranscriptionProvider, VideoFrameExtractor, VisionAnalyzer } from "./types.js";

function minimalPng(width = 32, height = 16): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function syntheticXlsx(): Buffer {
  const zip = new AdmZip();
  zip.addFile("xl/workbook.xml", Buffer.from(`<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Players" sheetId="1" r:id="rId1"/></sheets></workbook>`));
  zip.addFile("xl/_rels/workbook.xml.rels", Buffer.from(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`));
  zip.addFile("xl/worksheets/sheet1.xml", Buffer.from(`<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Points</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Haaland</t></is></c><c r="B2"><v>77</v></c></row></sheetData></worksheet>`));
  return zip.toBuffer();
}

function syntheticPptx(): Buffer {
  const zip = new AdmZip();
  zip.addFile("ppt/slides/slide1.xml", Buffer.from(`<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Captain Strategy</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`));
  zip.addFile("ppt/slides/slide2.xml", Buffer.from(`<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Fixture Analysis</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`));
  return zip.toBuffer();
}

test("detects signatures and common extensions", () => {
  assert.equal(detectFileType("report.pdf", Buffer.from("%PDF-1.7")).format, "pdf");
  assert.equal(detectFileType("image.png", minimalPng()).kind, "image");
  assert.equal(detectFileType("code.ts", Buffer.from("export const x = 1")).format, "code");
});

test("extracts structured text and recursively analyzes ZIP members", async () => {
  const engine = createDefaultFileIntelligence();
  const json = await engine.analyze({ name: "data.json", bytes: Buffer.from('{"captain":"Salah","score":12}') });
  assert.match(json.text, /Salah/u);

  const zip = new AdmZip();
  zip.addFile("notes/plan.txt", Buffer.from("Bench boost in gameweek 34"));
  const archive = await engine.analyze({ name: "bundle.zip", bytes: zip.toBuffer() });
  assert.equal(archive.children.length, 1);
  assert.match(archive.text, /Bench boost/u);
});

test("preserves XLSX sheets and PPTX slides", async () => {
  const engine = createDefaultFileIntelligence();
  const workbook = await engine.analyze({ name: "players.xlsx", bytes: syntheticXlsx() });
  assert.equal(workbook.sections.length, 1);
  assert.equal(workbook.sections[0]?.title, "Players");
  assert.match(workbook.text, /Haaland/u);
  assert.match(workbook.text, /77/u);

  const deck = await engine.analyze({ name: "strategy.pptx", bytes: syntheticPptx() });
  assert.equal(deck.sections.length, 2);
  assert.match(deck.text, /Captain Strategy/u);
  assert.match(deck.text, /Fixture Analysis/u);
});

test("combines audio transcript and visual video frame understanding", async () => {
  const transcriber: TranscriptionProvider = {
    transcribe: async () => ({ text: "The speaker recommends captaining Salah.", language: "en", durationSeconds: 60 }),
  };
  const vision: VisionAnalyzer = {
    analyzeImage: async () => ({ text: "A chart shows Salah leading expected points." }),
  };
  const videoFrames: VideoFrameExtractor = {
    extract: async () => [{
      timestampSeconds: 30,
      source: { name: "frame.jpg", bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), mimeType: "image/jpeg" },
    }],
  };
  const engine = createDefaultFileIntelligence({ transcriber, vision, videoFrames });
  const result = await engine.analyze({ name: "analysis.mp4", bytes: Buffer.from("synthetic video") });
  assert.match(result.text, /captaining Salah/u);
  assert.match(result.text, /expected points/u);
  assert.equal(result.sections.length, 2);
});

test("analyzes image metadata and vision content", async () => {
  const vision: VisionAnalyzer = { analyzeImage: async () => ({ text: "Screenshot of the Vortex dashboard." }) };
  const engine = createDefaultFileIntelligence({ vision });
  const result = await engine.analyze({ name: "screen.png", bytes: minimalPng(640, 480), mimeType: "image/png" });
  assert.equal(result.metadata.width, 640);
  assert.equal(result.metadata.height, 480);
  assert.match(result.text, /Vortex dashboard/u);
});

test("bridges extracted file knowledge into tenant-scoped Phase 3 memory", async () => {
  const store = new InMemoryMemoryStore();
  const memory = new VortexMemory(store);
  const bridge = new FileMemoryBridge(new KnowledgeIngestor(memory, { chunkCharacters: 500, overlapCharacters: 50 }));
  const engine = createDefaultFileIntelligence();
  const file = await engine.analyze({ name: "plan.txt", bytes: Buffer.from("Wildcard plan: prioritize Arsenal attackers and preserve two free transfers.") });
  const ingested = await bridge.ingest(file, { tenantId: "tenant-a", namespace: "fpl", projectId: "vortex" });
  assert.ok(ingested.memoryIds.length > 0);
  const results = await memory.recall({ tenantId: "tenant-a", namespace: "fpl", scopes: ["file"], projectId: "vortex", text: "Arsenal wildcard", limit: 5 });
  assert.ok(results.length > 0);
  assert.match(results[0]?.record.content ?? "", /Arsenal attackers/u);
});
