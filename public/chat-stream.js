// Decode SSE across arbitrary chunks, CRLF/LF framing and a final buffered event.
export async function consumeChatEvents(response, onEvent) {
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.includes("text/event-stream")) {
    if (type.includes("application/json")) {
      const data = await response.json();
      if (typeof data.error === "string") throw new Error(data.error);
    }
    if (!response.ok)
      throw new Error(`Chat request failed (${response.status}).`);
    throw new Error(
      "The chat backend is unavailable at this address. Open Vortex through its running server, rather than a downloaded page or static preview.",
    );
  }
  if (!response.body)
    throw new Error("The chat backend returned an empty response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    finished = false;
  const dispatch = (block) => {
    let name = "message";
    const data = [];
    for (const line of block.split(/\r\n|\n|\r/)) {
      if (line.startsWith("event:")) name = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (!data.length) return;
    let value;
    try {
      value = JSON.parse(data.join("\n"));
    } catch {
      throw new Error(
        "The chat backend sent an unreadable event. Please retry.",
      );
    }
    onEvent(name, value);
  };
  const drain = () => {
    let boundary;
    while ((boundary = /\r\n\r\n|\n\n|\r\r/.exec(buffer))) {
      dispatch(buffer.slice(0, boundary.index));
      buffer = buffer.slice(boundary.index + boundary[0].length);
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      drain();
    }
    buffer += decoder.decode();
    drain();
    if (buffer.trim()) dispatch(buffer);
  } finally {
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
