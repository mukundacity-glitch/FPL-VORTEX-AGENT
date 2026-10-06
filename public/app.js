import { generationKind } from "./generation-intent.js";
import { consumeChatEvents } from "./chat-stream.js";
const $ = (s) => document.querySelector(s);
let project = "general",
  chatId = null,
  busy = false,
  selectedFiles = new Map(),
  status = null;
const generationCards = new Map();
const galleryCards = new Map();
let mediaRefreshing = false;
const api = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(
      "Vortex needs its running backend. A downloaded page or static preview cannot send chat requests.",
    );
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
};
const scoped = (path) => `${path}?project=${encodeURIComponent(project)}`;
function notice(text) {
  $("#notice").textContent = text;
  $("#notice").hidden = false;
  setTimeout(() => ($("#notice").hidden = true), 9000);
}
function show(view) {
  $("#mobile-view").value = view;
  for (const el of document.querySelectorAll(".view"))
    el.hidden = el.id !== `${view}-view`;
  for (const el of document.querySelectorAll("nav button"))
    el.classList.toggle("active", el.dataset.view === view);
}
function appendMessage(role, text, meta = "") {
  const el = document.createElement("article");
  el.className = `message ${role}`;
  const label = document.createElement("small");
  label.textContent =
    role === "user" ? "YOU" : role === "error" ? "CHAT NOTICE" : "VORTEX AI";
  el.append(label);
  const content = document.createElement("div");
  content.textContent = text;
  el.append(content);
  if (meta) {
    const small = document.createElement("div");
    small.className = "meta";
    small.textContent = meta;
    el.append(small);
  }
  $("#messages").append(el);
  $("#welcome").hidden = true;
  const messages = $("#messages");
  messages.scrollTop = messages.scrollHeight;
  return el;
}
function attachments() {
  const area = $("#attachments");
  area.replaceChildren();
  for (const [id, file] of selectedFiles) {
    const button = document.createElement("button");
    button.textContent = `▤ ${file.name} ×`;
    button.onclick = () => {
      selectedFiles.delete(id);
      attachments();
    };
    area.append(button);
  }
}
async function chats() {
  const list = await api(scoped("/api/chats"));
  $("#chats").replaceChildren();
  for (const chat of list) {
    const button = document.createElement("button");
    button.textContent = chat.title;
    button.classList.toggle("selected", chat.id === chatId);
    button.onclick = async () => {
      if (busy) return;
      try {
        chatId = chat.id;
        $("#messages").replaceChildren();
        for (const m of await api(scoped(`/api/chats/${chat.id}`)))
          appendMessage(m.role, m.text);
        $("#welcome").hidden = $("#messages").children.length > 0;
        $("#page-title").textContent = chat.title;
        show("chat");
        await chats();
      } catch (e) {
        notice(e.message);
      }
    };
    $("#chats").append(button);
  }
}
async function files() {
  const list = await api(scoped("/api/files"));
  $("#file-list").replaceChildren();
  for (const file of list) {
    const card = document.createElement("div");
    card.className = "card";
    const title = document.createElement("strong");
    title.textContent = file.name;
    card.append(title);
    const small = document.createElement("small");
    small.textContent =
      file.warnings.join(" · ") || `${file.kind.toUpperCase()} · ready`;
    card.append(small);
    const select = document.createElement("button");
    select.textContent = "Use in chat";
    select.onclick = () => {
      selectedFiles.set(file.id, file);
      attachments();
      show("chat");
    };
    card.append(select);
    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.onclick = async () => {
      try {
        await api(scoped(`/api/files/${file.id}`), { method: "DELETE" });
        selectedFiles.delete(file.id);
        attachments();
        await files();
      } catch (e) {
        notice(e.message);
      }
    };
    card.append(remove);
    $("#file-list").append(card);
  }
}
async function refresh() {
  status = await api("/api/status");
  $("#connection").textContent = status.configured
    ? "● Ready"
    : "● Setup needed";
  $("#connection").classList.toggle("setup", !status.configured);
  $("#settings-info").textContent =
    `Models: ${status.configured ? "Provider key configured; live access unverified" : "API keys needed"} · ${status.storage} · ${status.review}`;
  $("#agent-list").replaceChildren();
  for (const agent of status.agents.filter((agent) => agent.id !== "fpl")) {
    const card = document.createElement("div");
    card.className = "card";
    const title = document.createElement("strong");
    title.textContent = agent.name;
    const small = document.createElement("small");
    small.textContent = agent.description;
    card.append(title, small);
    $("#agent-list").append(card);
  }
  $("#tool-name").replaceChildren();
  for (const tool of status.tools.filter(
    (tool) => !tool.name.startsWith("fpl."),
  )) {
    const option = document.createElement("option");
    option.value = tool.name;
    option.textContent = tool.name;
    $("#tool-name").append(option);
  }
  $("#media-status").textContent = status.media?.configured
    ? `Media key configured; model access unverified. Image: ${status.media.imageModel}. Video: ${status.media.videoModel}.`
    : "Image and video generation need OPENAI_API_KEY on the server.";
  await Promise.all([chats(), files(), refreshGenerations()]);
}
function reset() {
  chatId = null;
  selectedFiles.clear();
  attachments();
  $("#messages").replaceChildren();
  generationCards.clear();
  galleryCards.clear();
  $("#generation-list").replaceChildren();
  $("#welcome").hidden = false;
  $("#progress-panel").hidden = true;
  $("#page-title").textContent = "New conversation";
  show("chat");
}
$("#new-chat").onclick = () => {
  if (!busy) {
    reset();
    chats().catch((e) => notice(e.message));
  }
};
$("#project").onchange = async () => {
  if (busy) {
    $("#project").value = project;
    return;
  }
  project = $("#project").value;
  $("#project-label").textContent = `${project} workspace`;
  reset();
  try {
    await refresh();
  } catch (e) {
    notice(e.message);
  }
};
$("#add-project").onclick = () => {
  const name = $("#project-name").value.trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
    notice("Use 1–64 letters, numbers, hyphens or underscores.");
    return;
  }
  if (![...$("#project").options].some((o) => o.value === name)) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    $("#project").append(option);
    const saved = [...$("#project").options].map((o) => ({
      value: o.value,
      text: o.textContent,
    }));
    localStorage.setItem("vortex-projects", JSON.stringify(saved));
  }
  $("#project").value = name;
  $("#project").onchange();
  $("#project-name").value = "";
};
for (const button of document.querySelectorAll("nav button"))
  button.onclick = () => show(button.dataset.view);
for (const button of document.querySelectorAll("[data-prompt]"))
  button.onclick = () => {
    $("#message").value = button.dataset.prompt;
    $("#message").focus();
  };
$("#upload").onclick = $("#upload-files").onclick = () => {
  if (!busy) $("#file-input").click();
};
$("#file-input").onchange = async () => {
  for (const file of $("#file-input").files) {
    if (file.size > 10 * 1024 * 1024) {
      notice(`${file.name} exceeds 10 MiB.`);
      continue;
    }
    try {
      notice(`Reading ${file.name}…`);
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await api("/api/files", {
        method: "POST",
        body: JSON.stringify({ project, name: file.name, base64: data }),
      });
      selectedFiles.set(result.id, result);
      attachments();
      if (result.warnings.length) notice(result.warnings.join(" · "));
    } catch (e) {
      notice(e.message);
    }
  }
  $("#file-input").value = "";
  await files();
};
function renderGeneration(job, card) {
  const stateKey = JSON.stringify([job.status, job.progress, job.error]);
  if (card.dataset.state === stateKey) return;
  card.dataset.state = stateKey;
  card.replaceChildren();
  const label = document.createElement("small");
  label.textContent = `${job.kind === "image" ? "IMAGE" : "VIDEO"} · ${job.model}`;
  const prompt = document.createElement("p");
  prompt.textContent = job.prompt;
  card.append(label, prompt);
  if (job.status === "completed") {
    const assetUrl = `${scoped(`/api/generations/${job.id}/asset`)}`;
    const media = document.createElement(
      job.kind === "image" ? "img" : "video",
    );
    media.src = assetUrl;
    if (job.kind === "image") {
      media.alt = job.prompt;
      media.loading = "lazy";
    } else {
      media.controls = true;
      media.preload = "metadata";
    }
    const download = document.createElement("a");
    download.href = `${assetUrl}&download=1`;
    download.textContent = "Download result";
    download.download = `vortex-${job.id}.${job.kind === "image" ? "png" : "mp4"}`;
    card.append(media, download);
  } else {
    const state = document.createElement("p");
    state.textContent =
      job.error || `${job.status.replaceAll("_", " ")} · ${job.progress}%`;
    card.append(state);
  }
}
async function refreshGenerations() {
  if (mediaRefreshing) return;
  mediaRefreshing = true;
  const workspace = project;
  try {
    const jobs = await api(scoped("/api/generations"));
    if (workspace !== project) return;
    const area = $("#generation-list");
    for (let job of jobs) {
      if (["queued", "in_progress"].includes(job.status)) {
        job = await api(scoped(`/api/generations/${job.id}`));
        if (workspace !== project) return;
      }
      let card = galleryCards.get(job.id);
      if (!card) {
        card = document.createElement("article");
        card.className = "card generated";
        galleryCards.set(job.id, card);
        area.append(card);
      }
      renderGeneration(job, card);
      const inline = generationCards.get(job.id);
      if (inline) renderGeneration(job, inline);
    }
  } finally {
    mediaRefreshing = false;
  }
}
setInterval(() => {
  if (status && !document.hidden) refreshGenerations().catch(() => {});
}, 10000);
$("#composer").onsubmit = async (event) => {
  event.preventDefault();
  const message = $("#message").value.trim();
  if (!message || busy) return;
  busy = true;
  $("#send").disabled = true;
  $("#project").disabled = true;
  $("#message").value = "";
  appendMessage("user", message);
  $("#progress-panel").hidden = false;
  $("#progress").replaceChildren();
  $("#progress-panel summary").textContent = "Vortex is working";
  const stages = new Map();
  try {
    const kind = generationKind(message, $("#generation-mode").value);
    if (kind) {
      if (selectedFiles.size)
        throw new Error(
          "Prompt generation does not use attachments yet. Remove attachments or select Chat to analyze them.",
        );
      const job = await api("/api/generations", {
        method: "POST",
        body: JSON.stringify({
          id: crypto.randomUUID(),
          project,
          kind,
          prompt: message,
        }),
      });
      const card = appendMessage("assistant", "");
      card.classList.add("generated");
      generationCards.set(job.id, card);
      renderGeneration(job, card);
      $("#progress-panel").hidden = true;
      await refreshGenerations();
      return;
    }
    if (status?.configured === false) {
      throw new Error(
        "Chat setup is incomplete. Add a provider API key in the server settings (.env), then restart Vortex.",
      );
    }
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project,
        message,
        ...(chatId ? { chatId } : {}),
        fileIds: [...selectedFiles.keys()],
      }),
    });
    let resultReceived = false;
    await consumeChatEvents(response, (name, data) => {
      if (name === "chat") chatId = data.id;
      if (name === "stage") {
        if (!stages.has(data.stage)) {
          const line = document.createElement("div");
          stages.set(data.stage, line);
          $("#progress").append(line);
        }
        stages.get(data.stage).textContent =
          `${data.state === "complete" ? "✓" : "●"} ${data.stage}${data.detail ? ` · ${data.detail}` : ""}`;
      }
      if (name === "result") {
        resultReceived = true;
        appendMessage(
          "assistant",
          data.answer,
          `${data.model} · ${data.route.agent} · ${data.review.reviewer ? `Review ${data.review.accepted ? "accepted" : "rejected"} (${Math.round(data.review.score * 100)}%)` : "Routine answer; not independently reviewed"}`,
        );
        $("#progress-panel summary").textContent = "View work details";
      }
      if (name === "error")
        throw new Error(
          `${data.error}${data.requestId ? ` Reference: ${data.requestId}` : ""}`,
        );
    });
    if (!resultReceived)
      throw new Error(
        "The connection ended before a verified result arrived. Check the conversation history before retrying.",
      );
    await chats();
  } catch (e) {
    appendMessage("error", e.message);
    $("#progress-panel").hidden = stages.size === 0;
    $("#progress-panel summary").textContent = "Task stopped";
  } finally {
    busy = false;
    $("#send").disabled = false;
    $("#project").disabled = false;
  }
};
$("#message").onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("#composer").requestSubmit();
  }
};
$("#tool-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    $("#tool-result").textContent = "Running…";
    const result = await api("/api/tools", {
      method: "POST",
      body: JSON.stringify({
        project,
        name: $("#tool-name").value,
        input: JSON.parse($("#tool-input").value),
      }),
    });
    $("#tool-result").textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    $("#tool-result").textContent = error.message;
  }
};
$("#delete-chat").onclick = async () => {
  if (!chatId) return;
  try {
    await api(scoped(`/api/chats/${chatId}`), { method: "DELETE" });
    reset();
    await chats();
  } catch (e) {
    notice(e.message);
  }
};
$("#logout").onclick = async () => {
  await api("/api/logout", { method: "POST", body: "{}" });
  location.reload();
};
$("#login-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ token: $("#token").value }),
    });
    $("#token").value = "";
    $("#login").close();
    await refresh();
  } catch (error) {
    $("#login-error").textContent = error.message;
  }
};
$("#login").addEventListener("cancel", (e) => e.preventDefault());
async function init() {
  try {
    const saved = JSON.parse(localStorage.getItem("vortex-projects") || "[]");
    for (const item of saved) {
      if (
        item.value !== "fpl" &&
        /^[a-zA-Z0-9_-]{1,64}$/.test(item.value) &&
        ![...$("#project").options].some((o) => o.value === item.value)
      ) {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.text;
        $("#project").append(option);
      }
    }
    const session = await api("/api/session");
    $("#logout").hidden = !session.authRequired;
    if (!session.authenticated) {
      $("#connection").textContent = "● Locked";
      $("#login").showModal();
    } else await refresh();
  } catch (e) {
    $("#connection").textContent = "● Offline";
    $("#connection").classList.add("setup");
    notice(e.message);
  }
}
// Drag files into the chat without changing the active project.
$("#chat-view").ondragover = (e) => {
  e.preventDefault();
};
$("#chat-view").ondrop = (e) => {
  e.preventDefault();
  if (busy) return;
  $("#file-input").files = e.dataTransfer.files;
  $("#file-input").onchange();
};
init();

$("#mobile-view").onchange = () => show($("#mobile-view").value);

// Keep the app inside the visible viewport when the mobile keyboard opens.
function sizeViewport() {
  const height = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${height}px`);
}
window.visualViewport?.addEventListener("resize", sizeViewport);
window.addEventListener("resize", sizeViewport);
sizeViewport();
