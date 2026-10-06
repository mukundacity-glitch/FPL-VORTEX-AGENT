import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../dist/memory/store.js";
import {
  GenerationService,
  publicGeneration,
} from "../dist/media/generation.js";
import { generationKind } from "../public/generation-intent.js";
const scope = { owner: "personal", project: "general" };
const scope2 = { ...scope, project: "other" };
const settle = () => new Promise((resolve) => setImmediate(resolve));
function fake() {
  return {
    image: async () => Buffer.from("png-fixture"),
    startVideo: async () => "provider-video-private",
    video: async () => ({ status: "completed", progress: 100 }),
    download: async () => Buffer.from("mp4-fixture"),
  };
}
test("generation intent separates creation from analysis and respects explicit modes", () => {
  assert.equal(generationKind("Please create an image of a forest"), "image");
  assert.equal(generationKind("Generate a video of rain"), "video");
  assert.equal(generationKind("Analyze this video"), null);
  assert.equal(generationKind("Write code to generate an image"), null);
  assert.equal(generationKind("Create an image of rain", "chat"), null);
  assert.equal(generationKind("A forest", "video"), "video");
});
test("creation is idempotent, scoped and stores completed image bytes", async (t) => {
  const store = new Store(":memory:");
  t.after(() => store.close());
  let calls = 0;
  const provider = {
    ...fake(),
    image: async () => {
      calls++;
      return Buffer.from("png-fixture");
    },
  };
  const service = new GenerationService(
    store,
    provider,
    "image-test",
    "video-test",
  );
  const id = crypto.randomUUID();
  service.create(scope, id, "image", "A forest");
  service.create(scope, id, "image", "A forest");
  assert.throws(
    () => service.create(scope, id, "image", "Different"),
    /another prompt/,
  );
  assert.throws(
    () => service.create(scope2, id, "image", "A forest"),
    /another project/,
  );
  await settle();
  assert.equal(calls, 1);
  assert.equal((await service.get(scope, id)).status, "completed");
  assert.equal(store.generationAsset(scope, id).toString(), "png-fixture");
  assert.equal(store.generation(scope2, id), undefined);
  assert.equal(store.generationAsset(scope2, id), undefined);
});
test("video job resumes after database reopen without repeating paid creation", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "vortex-generations-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "test.sqlite");
  let store = new Store(path),
    calls = 0;
  const provider = {
    ...fake(),
    startVideo: async () => {
      calls++;
      return "provider-video-private";
    },
  };
  let service = new GenerationService(
    store,
    provider,
    "image-test",
    "video-test",
  );
  const id = crypto.randomUUID();
  service.create(scope, id, "video", "Rain");
  await settle();
  store.close();
  store = new Store(path);
  t.after(() => store.close());
  service = new GenerationService(store, provider, "image-test", "video-test");
  const result = await service.get(scope, id);
  assert.equal(result.status, "completed");
  assert.equal(calls, 1);
  assert.equal(store.generationAsset(scope, id).toString(), "mp4-fixture");
  assert(!("providerId" in publicGeneration(result)));
});
test("interrupted creations are marked failed and never replayed", (t) => {
  const store = new Store(":memory:");
  t.after(() => store.close());
  const id = crypto.randomUUID();
  store.saveGeneration(scope, {
    id,
    kind: "image",
    prompt: "x",
    model: "test",
    status: "submitting",
    progress: 0,
    createdAt: new Date().toISOString(),
  });
  new GenerationService(store, fake(), "image-test", "video-test");
  assert.equal(store.generation(scope, id).status, "failed");
  assert.match(store.generation(scope, id).error, /not repeated/);
});
test("failed provider payload does not expose secrets or repeat creation", async (t) => {
  const store = new Store(":memory:");
  t.after(() => store.close());
  let calls = 0;
  const service = new GenerationService(
    store,
    {
      ...fake(),
      image: async () => {
        calls++;
        throw new Error("secret-api-key");
      },
    },
    "image-test",
    "video-test",
  );
  const id = crypto.randomUUID();
  service.create(scope, id, "image", "x");
  await settle();
  const result = await service.get(scope, id);
  assert.equal(result.status, "failed");
  assert(!JSON.stringify(result).includes("secret-api-key"));
  service.create(scope, id, "image", "x");
  assert.equal(calls, 1);
});
test("active generations are limited across an owner's projects", (t) => {
  const store = new Store(":memory:");
  t.after(() => store.close());
  const service = new GenerationService(
    store,
    { ...fake(), image: () => new Promise(() => {}) },
    "image-test",
    "video-test",
  );
  service.create(scope, crypto.randomUUID(), "image", "x");
  service.create(scope2, crypto.randomUUID(), "image", "x");
  assert.throws(
    () => service.create(scope, crypto.randomUUID(), "image", "x"),
    /already running/,
  );
});
