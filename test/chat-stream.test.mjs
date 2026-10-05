import test from "node:test";
import assert from "node:assert/strict";
import { consumeChatEvents } from "../public/chat-stream.js";
function stream(text, chunkSize = 3) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += chunkSize)
          controller.enqueue(bytes.slice(i, i + chunkSize));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
test("chat receives chunked CRLF events, unicode and final buffered result", async () => {
  const events = [];
  await consumeChatEvents(
    stream(
      ': heartbeat\r\n\r\nevent: stage\r\ndata: {"stage":"Working"}\r\n\r\nevent: result\r\ndata: {"answer":"Done ✓"}',
    ),
    (name, data) => events.push({ name, data }),
  );
  assert.deepEqual(events, [
    { name: "stage", data: { stage: "Working" } },
    { name: "result", data: { answer: "Done ✓" } },
  ]);
});
test("normal LF events and multi-line data are decoded", async () => {
  const events = [];
  await consumeChatEvents(
    stream('event: result\ndata: {\ndata: "answer":"OK"}\n\n'),
    (name, data) => events.push([name, data]),
  );
  assert.deepEqual(events, [["result", { answer: "OK" }]]);
});
test("static page fallback gives backend error instead of missing-result message", async () => {
  await assert.rejects(
    consumeChatEvents(
      new Response("<html>preview</html>", {
        headers: { "Content-Type": "text/html" },
      }),
      () => {},
    ),
    /backend is unavailable/,
  );
});
test("setup and streamed server errors preserve the actionable cause", async () => {
  await assert.rejects(
    consumeChatEvents(
      new Response('{"error":"Configure API keys"}', {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
      () => {},
    ),
    /Configure API keys/,
  );
  await assert.rejects(
    consumeChatEvents(
      stream('event: error\ndata: {"error":"Review failed"}\n\n'),
      (_, data) => {
        throw Error(data.error);
      },
    ),
    /Review failed/,
  );
});
