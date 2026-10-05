import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MediaParser } from "../dist/files/media.js";
const installed = spawnSync("ffmpeg", ["-version"]).status === 0;
test(
  "short silent video retains its first frame and does not require audio",
  { skip: !installed },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "vortex-test-"));
    try {
      const path = join(dir, "silent.mp4");
      const result = spawnSync("ffmpeg", [
        "-nostdin",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=64x64:d=1",
        "-c:v",
        "mpeg4",
        path,
      ]);
      assert.equal(result.status, 0);
      const parser = new MediaParser("test-placeholder", "test-model");
      let images = 0;
      parser.image = async () => {
        images++;
        return "Blue frame";
      };
      parser.audio = async () => {
        throw Error("Silent video must not transcribe");
      };
      const text = await parser.video(await readFile(path));
      assert.match(text, /No audio stream detected/);
      assert.match(text, /Blue frame/);
      assert.equal(images, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
