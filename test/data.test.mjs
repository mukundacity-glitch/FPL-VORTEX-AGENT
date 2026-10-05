import test from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { z } from "zod";
import { Store } from "../dist/memory/store.js";
import { FileEngine } from "../dist/files/ingest.js";
import { ToolRegistry } from "../dist/tools/registry.js";
import {
  optimizeLineup,
  simulate,
  bestSingleTransfer,
} from "../dist/fpl/optimizer.js";
const scope = { owner: "alice", project: "fpl" };
test("memory, files and chats cannot cross owner or project boundaries", () => {
  const store = new Store(":memory:");
  try {
    const chat = store.createChat(scope);
    store.append(scope, chat.id, "user", "Hi");
    store.remember(scope, "knowledge", "captain evidence", "official");
    store.addFile(scope, {
      id: "f",
      name: "x.txt",
      kind: "txt",
      text: "private",
      warnings: [],
    });
    assert.equal(store.search(scope, "captain").length, 1);
    for (const s of [
      { owner: "bob", project: "fpl" },
      { owner: "alice", project: "coding" },
    ]) {
      assert.equal(store.search(s, "captain").length, 0);
      assert.throws(() => store.file(s, "f"), /not found/);
      assert.throws(() => store.messages(s, chat.id), /not found/);
      assert.equal(store.chats(s).length, 0);
    }
    store.deleteChat(scope, chat.id);
    assert.throws(() => store.messages(scope, chat.id));
  } finally {
    store.close();
  }
});
test("experience is not retrieved as verified knowledge", () => {
  const store = new Store(":memory:");
  store.remember(scope, "experience", "captain invented fact", "model");
  assert.equal(store.search(scope, "captain").length, 0);
  store.close();
});
test("file parser validates JSON, binary files, unknown types and sizes", async () => {
  const engine = new FileEngine();
  assert.equal(
    (await engine.ingest("code.ts", strToU8("const value = 1;"))).text,
    "const value = 1;",
  );
  await assert.rejects(engine.ingest("bad.json", strToU8("{")), SyntaxError);
  await assert.rejects(
    engine.ingest("bad.txt", new Uint8Array([0, 2])),
    /Binary/,
  );
  await assert.rejects(
    engine.ingest("file.exe", strToU8("abc")),
    /Unsupported/,
  );
  await assert.rejects(
    engine.ingest("../file.txt", strToU8("abc")),
    /filename/,
  );
  await assert.rejects(
    engine.ingest("huge.txt", new Uint8Array(11 * 1024 * 1024)),
    /size/,
  );
});
test("office text keeps slide and spreadsheet cell provenance", async () => {
  const engine = new FileEngine();
  const docx = zipSync({
    "word/document.xml": strToU8(
      '<w:document xmlns:w="x"><w:p><w:r><w:t>Hello &amp; world</w:t></w:r></w:p></w:document>',
    ),
  });
  assert.match((await engine.ingest("x.docx", docx)).text, /Hello & world/);
  const pptx = zipSync({
    "ppt/slides/slide2.xml": strToU8('<a:t xmlns:a="x">Second</a:t>'),
    "ppt/slides/slide1.xml": strToU8('<a:t xmlns:a="x">First</a:t>'),
  });
  const ppt = await engine.ingest("x.pptx", pptx);
  assert(ppt.text.indexOf("First") < ppt.text.indexOf("Second"));
  const xlsx = zipSync({
    "xl/workbook.xml": strToU8(
      '<workbook><sheets><sheet name="Budget" r:id="rId1"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      '<worksheet><sheetData><row><c r="A1"><v>42</v></c><c r="B1"><f>A1*2</f><v>84</v></c></row></sheetData></worksheet>',
    ),
  });
  const sheet = await engine.ingest("x.xlsx", xlsx);
  assert.match(sheet.text, /Sheet Budget/);
  assert.match(sheet.text, /A1: 42/);
  assert.match(sheet.text, /formula: A1\*2/);
  assert(sheet.warnings.some((w) => w.includes("not recalculated")));
});
test("archives reject traversal and decompression bombs before extraction", async () => {
  const engine = new FileEngine();
  await assert.rejects(
    engine.ingest("bad.zip", zipSync({ "../secret.txt": strToU8("bad") })),
    /Unsafe archive/,
  );
  await assert.rejects(
    engine.ingest(
      "bomb.zip",
      zipSync({ "huge.txt": new Uint8Array(31 * 1024 * 1024) }),
    ),
    /extraction limits/,
  );
});
test("archives skip .env files and carry unsupported-file warnings", async () => {
  const result = await new FileEngine().ingest(
    "repo.zip",
    zipSync({
      "src/a.ts": strToU8("const a=1;"),
      ".env": strToU8("secret"),
      "bad.bin": strToU8("x"),
    }),
  );
  assert.match(result.text, /File src\/a.ts/);
  assert(!result.text.includes("secret"));
  assert(result.warnings.length >= 2);
});
test("media without configured service reports requirements", async () => {
  await assert.rejects(
    new FileEngine().ingest("a.mp3", strToU8("x")),
    /requires/,
  );
});
test("tool input and write permissions validated before execution", async () => {
  const tools = new ToolRegistry();
  let called = false;
  tools.register({
    name: "write",
    description: "x",
    effect: "write",
    input: z.object({ value: z.number() }),
    execute: async () => {
      called = true;
      return 1;
    },
  });
  const ctx = { ...scope, signal: new AbortController().signal };
  await assert.rejects(tools.call("write", { value: 1 }, ctx), /permission/);
  await assert.rejects(tools.call("write", { value: "x" }, ctx, true));
  assert.equal(called, false);
  assert.equal(await tools.call("write", { value: 1 }, ctx, true), 1);
});
const squad = () =>
  Array.from({ length: 15 }, (_, i) => ({
    id: i + 1,
    name: `P${i + 1}`,
    position: i < 2 ? 1 : i < 7 ? 2 : i < 12 ? 3 : 4,
    team: Math.floor(i / 3) + 1,
    price: 5,
    points: [i + 1, 2],
    availability: 1,
  }));
test("lineup has legal formation and captain is a starter", () => {
  const players = squad(),
    result = optimizeLineup(players);
  assert.equal(result.lineup.length, 11);
  assert.equal(result.bench.length, 4);
  assert(result.lineup.includes(result.captain));
  assert.notEqual(result.captain, result.viceCaptain);
  const starters = players.filter((p) => result.lineup.includes(p.id));
  assert.equal(starters.filter((p) => p.position === 1).length, 1);
  assert(starters.filter((p) => p.position === 2).length >= 3);
  assert(starters.filter((p) => p.position === 4).length >= 1);
});
test("optimizer rejects duplicate players, club and position violations", () => {
  const players = squad();
  players[1].id = 1;
  assert.throws(() => optimizeLineup(players), /Duplicate/);
  assert.throws(
    () => optimizeLineup(squad().map((p) => ({ ...p, team: 1 }))),
    /three players/,
  );
  assert.throws(
    () => optimizeLineup(squad().map((p) => ({ ...p, position: 1 }))),
    /Squad/,
  );
});
test("simulation is reproducible and rejects missing horizon data", () => {
  const players = squad();
  assert.deepEqual(
    simulate(players, 2, 100, 42),
    simulate(players, 2, 100, 42),
  );
  assert.throws(() => simulate(players, 8), /projection/);
  assert.equal(
    simulate([{ ...players[0], availability: 0 }], 1, 100).results[0].mean,
    0,
  );
});
test("transfer search uses actual selling price, club limits and hit cost", () => {
  const players = squad(),
    sale = Object.fromEntries(players.map((p) => [p.id, 4]));
  const candidate = {
    ...players[0],
    id: 100,
    name: "Upgrade",
    team: 6,
    price: 5,
    points: [10, 10],
  };
  assert.equal(
    bestSingleTransfer(players, [candidate], 0, sale).transfer,
    null,
  );
  const result = bestSingleTransfer(players, [candidate], 1, sale, 0);
  assert.equal(result.transfer.in, 100);
  assert.equal(result.transfer.netGain, 5);
  assert.equal(result.transfer.remainingBank, 0);
  assert.throws(
    () => bestSingleTransfer(players, [candidate], 1, {}),
    /selling prices/,
  );
});

test("PDF embedded text is extracted with page provenance", async () => {
  const parts = ["%PDF-1.4\n"],
    offsets = [0];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = "BT /F1 12 Tf 20 200 Td (Evidence from a PDF document.) Tj ET";
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(parts.join("")));
    parts.push(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`);
  }
  const xref = Buffer.byteLength(parts.join(""));
  parts.push(
    `xref\n0 6\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
      .join("")}trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${xref}\n%%EOF`,
  );
  const result = await new FileEngine().ingest(
    "evidence.pdf",
    Buffer.from(parts.join("")),
  );
  assert.match(result.text, /Page 1/);
  assert.match(result.text, /Evidence from a PDF document/);
});
