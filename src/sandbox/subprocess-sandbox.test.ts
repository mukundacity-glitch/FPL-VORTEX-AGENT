import assert from "node:assert/strict";
import test from "node:test";
import { SubprocessSandbox } from "./subprocess-sandbox.js";

test("sandbox runs an allowlisted executable", async () => {
  const sandbox = new SubprocessSandbox({
    workspaceRoot: process.cwd(),
    allowedCommands: [process.execPath],
  });
  const result = await sandbox.execute({
    command: process.execPath,
    args: ["-e", "console.log('vortex-ok')"],
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /vortex-ok/u);
});

test("sandbox rejects commands outside its allowlist", async () => {
  const sandbox = new SubprocessSandbox({
    workspaceRoot: process.cwd(),
    allowedCommands: [process.execPath],
  });
  await assert.rejects(
    sandbox.execute({ command: "not-allowed" }),
    /not allowed/u,
  );
});

test("sandbox keeps cwd inside workspace", async () => {
  const sandbox = new SubprocessSandbox({
    workspaceRoot: process.cwd(),
    allowedCommands: [process.execPath],
  });
  await assert.rejects(
    sandbox.execute({ command: process.execPath, cwd: "../../..", args: ["-e", ""] }),
    /inside the configured workspace/u,
  );
});
