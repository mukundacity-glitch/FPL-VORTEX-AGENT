import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../dist/memory/store.js";
import { FileEngine } from "../dist/files/ingest.js";
import { ToolRegistry } from "../dist/tools/registry.js";
import { createApp } from "../dist/web/app.js";
const token = "test-secret-token-with-at-least-32-characters";
async function app(t, options = {}) {
  const store = new Store(":memory:");
  const server = createApp({
    store,
    files: new FileEngine(),
    tools: new ToolRegistry(),
    fpl: { snapshot: async () => ({ source: "official-test-fixture" }) },
    engine: {
      run: async (message, context, n, progress) => {
        progress({ stage: "Test", state: "complete" });
        return {
          id: crypto.randomUUID(),
          answer: "Verified test answer",
          route: { agent: "general", priority: "fast" },
          run: {
            candidate: { model: "test" },
            review: { accepted: true, score: 1, reasons: [] },
          },
        };
      },
    },
    configured: true,
    ...options,
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    store.close();
  });
  return { base: `http://127.0.0.1:${server.address().port}`, store };
}
const post = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
test("static interface and health load", async (t) => {
  const { base } = await app(t);
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Vortex AI/);
  assert.match(
    response.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  const streamModule = await fetch(`${base}/chat-stream.js`);
  assert.equal(streamModule.status, 200);
  assert.match(streamModule.headers.get("content-type"), /javascript/);
});
test("private API requires login and credentials stay in HttpOnly cookie", async (t) => {
  const { base } = await app(t, { authToken: token });
  assert.equal((await fetch(`${base}/api/chats`)).status, 401);
  assert.equal(
    (await fetch(`${base}/api/login`, post({ token: "wrong" }))).status,
    401,
  );
  const login = await fetch(`${base}/api/login`, post({ token }));
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert(!cookie.includes(token));
  const chats = await fetch(`${base}/api/chats`, {
    headers: { Cookie: cookie.split(";")[0] },
  });
  assert.equal(chats.status, 200);
});
test("cross-origin requests and traversal projects rejected", async (t) => {
  const { base } = await app(t);
  assert.equal(
    (
      await fetch(`${base}/api/chats`, {
        ...post({ project: "general" }),
        headers: { Origin: "https://evil.test" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(`${base}/api/chats?project=../private`)).status,
    400,
  );
});
test("uploads are scoped and available to chat context", async (t) => {
  const { base } = await app(t);
  const uploaded = await fetch(
    `${base}/api/files`,
    post({
      project: "general",
      name: "facts.txt",
      base64: Buffer.from("Evidence").toString("base64"),
    }),
  );
  assert.equal(uploaded.status, 201);
  const file = await uploaded.json();
  assert.equal(
    (await (await fetch(`${base}/api/files?project=fpl`)).json()).length,
    0,
  );
  const response = await fetch(
    `${base}/api/chat`,
    post({ message: "Hello", project: "general", fileIds: [file.id] }),
  );
  const text = await response.text();
  assert.match(text, /event: stage/);
  assert.match(text, /event: result/);
  assert.match(text, /Verified test answer/);
  const chats = await (await fetch(`${base}/api/chats`)).json();
  const history = await (
    await fetch(`${base}/api/chats/${chats[0].id}`)
  ).json();
  assert.equal(history.length, 2);
  assert.equal(history[0].role, "user");
  assert.equal(history[1].text, "Verified test answer");
});
test("unconfigured models return explicit setup error", async (t) => {
  const { base } = await app(t, { configured: false });
  const response = await fetch(`${base}/api/chat`, post({ message: "Hello" }));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /provider API key/);
});
test("public server cannot start without strong authentication", () => {
  assert.throws(() => createApp({ publicAccess: true }), /at least 32/);
});

test("local server rejects DNS rebinding hostnames", async (t) => {
  const { base } = await app(t);
  const { request } = await import("node:http");
  const code = await new Promise((resolve, reject) => {
    const req = request(
      `${base}/api/chats`,
      { headers: { Host: "attacker.test" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(code, 403);
});
