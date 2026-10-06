"use client";

import {
  Bot,
  BrainCircuit,
  ChevronRight,
  FileText,
  FolderKanban,
  LoaderCircle,
  MessageSquarePlus,
  Paperclip,
  Send,
  ShieldCheck,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";

interface Project { id: string; name: string; createdAt: string; }
interface FileSummary { id: string; name: string; kind: string; format: string; sizeBytes: number; warnings: string[]; }
interface UiMessage { id: string; role: "user" | "assistant"; content: string; meta?: string; }

const starterProjects: Project[] = [{ id: "default", name: "General", createdAt: new Date(0).toISOString() }];
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function VortexShell() {
  const [projects, setProjects] = useState<Project[]>(starterProjects);
  const [projectId, setProjectId] = useState("default");
  const [conversationId, setConversationId] = useState(() => newId());
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("vortex-projects");
      if (stored) setProjects(JSON.parse(stored) as Project[]);
    } catch { /* local-only preference; ignore malformed storage */ }
  }, []);

  useEffect(() => {
    localStorage.setItem("vortex-projects", JSON.stringify(projects));
  }, [projects]);

  const activeProject = useMemo(() => projects.find((project) => project.id === projectId) ?? projects[0], [projects, projectId]);

  const createProject = () => {
    const name = window.prompt("Project name");
    if (!name?.trim()) return;
    const project = { id: newId(), name: name.trim(), createdAt: new Date().toISOString() };
    setProjects((current) => [...current, project]);
    setProjectId(project.id);
    setConversationId(newId());
    setMessages([]);
    setFiles([]);
  };

  const newChat = () => {
    setConversationId(newId());
    setMessages([]);
    setFiles([]);
    setStatuses([]);
  };

  const uploadFiles = async (selected: FileList | File[]) => {
    setUploading(true);
    try {
      for (const file of Array.from(selected)) {
        const form = new FormData();
        form.set("file", file);
        form.set("tenantId", "local-user");
        form.set("projectId", projectId);
        form.set("conversationId", conversationId);
        const response = await fetch("/api/files", { method: "POST", body: form });
        const payload = await response.json() as { file?: FileSummary; error?: string };
        if (!response.ok || !payload.file) throw new Error(payload.error || `Could not analyze ${file.name}`);
        setFiles((current) => [...current.filter((item) => item.id !== payload.file!.id), payload.file!]);
      }
    } catch (error) {
      setMessages((current) => [...current, { id: newId(), role: "assistant", content: `**File upload error:** ${error instanceof Error ? error.message : String(error)}` }]);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setStatuses([]);
    const userMessage: UiMessage = { id: newId(), role: "user", content: text };
    const assistantId = newId();
    setMessages((current) => [...current, userMessage, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          tenantId: "local-user",
          projectId,
          conversationId,
          mode: "deep",
          requireReview: true,
          attachedFiles: files.map(({ id, name, kind, format }) => ({ id, name, kind, format })),
        }),
      });
      if (!response.ok || !response.body) throw new Error((await response.text()) || "Chat request failed.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const item = JSON.parse(line) as { type: string; label?: string; text?: string; provider?: string; model?: string; reviewScore?: number; attempts?: number; message?: string };
          if (item.type === "status" && item.label) setStatuses((current) => [...current, item.label!]);
          if (item.type === "result" && item.text) {
            const meta = [item.provider, item.model, typeof item.reviewScore === "number" ? `verified ${(item.reviewScore * 100).toFixed(0)}%` : undefined, item.attempts ? `${item.attempts} attempt${item.attempts === 1 ? "" : "s"}` : undefined].filter(Boolean).join(" · ");
            setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: item.text!, meta } : message));
          }
          if (item.type === "error") throw new Error(item.message || "Vortex returned an error.");
        }
      }
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: `**Vortex error:** ${error instanceof Error ? error.message : String(error)}` } : message));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: React.FormEvent) => { event.preventDefault(); void send(); };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">V</div><div><strong>Vortex AI</strong><span>Agent workspace</span></div></div>
        <button className="new-chat" onClick={newChat}><MessageSquarePlus size={17}/> New chat</button>
        <div className="nav-label">Workspace</div>
        <button className="nav-item active"><Bot size={17}/> Chat <ChevronRight size={15}/></button>
        <button className="nav-item" onClick={() => void send("Analyze my FPL team and tell me the highest-value decisions to make next.")}><Trophy size={17}/> FPL Vortex</button>
        <button className="nav-item" onClick={() => fileInput.current?.click()}><FileText size={17}/> Files</button>
        <div className="nav-label row"><span>Projects</span><button className="tiny" onClick={createProject}>+</button></div>
        <div className="project-list">
          {projects.map((project) => <button key={project.id} className={`project ${project.id === projectId ? "selected" : ""}`} onClick={() => { setProjectId(project.id); newChat(); }}><FolderKanban size={15}/><span>{project.name}</span></button>)}
        </div>
        <div className="sidebar-foot"><span className="dot"/> Core connected<div>Phases 1–6 local build</div></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><strong>{activeProject?.name ?? "General"}</strong><span>/ Vortex AI</span></div>
          <div className="capabilities"><span><BrainCircuit size={14}/> multi-model</span><span><ShieldCheck size={14}/> verified</span></div>
        </header>

        <Conversation className="chat-area">
          <ConversationContent>
            {messages.length === 0 ? (
              <div className="welcome">
                <div className="orb"><Sparkles size={28}/></div>
                <h1>What can Vortex solve?</h1>
                <p>Reason deeply, analyze files, work across projects, and use the FPL intelligence stack from one conversation.</p>
                <div className="starter-grid">
                  <button onClick={() => void send("Solve a complex problem with a clear plan, independent verification, and concise final answer.")}><BrainCircuit size={18}/><strong>Deep reasoning</strong><span>Planner + model routing + verifier</span></button>
                  <button onClick={() => fileInput.current?.click()}><Paperclip size={18}/><strong>Analyze files</strong><span>PDF, Office, images, audio, video, code</span></button>
                  <button onClick={() => void send("Give me an FPL decision report: captain, transfers, chips, risk and next-gameweek outlook.")}><Trophy size={18}/><strong>FPL Vortex</strong><span>Projection + simulation + optimization</span></button>
                </div>
              </div>
            ) : (
              <div className="message-stack">
                {messages.map((message) => (
                  <Message key={message.id} from={message.role}>
                    <MessageContent>
                      {message.role === "assistant" ? <MessageResponse>{message.content || (busy ? "Working…" : "")}</MessageResponse> : <div className="user-text">{message.content}</div>}
                      {message.meta ? <div className="message-meta">{message.meta}</div> : null}
                    </MessageContent>
                  </Message>
                ))}
                {busy && statuses.length > 0 ? <div className="run-status"><LoaderCircle className="spin" size={15}/><span>{statuses.at(-1)}</span><small>{statuses.length} stage{statuses.length === 1 ? "" : "s"}</small></div> : null}
              </div>
            )}
          </ConversationContent>
        </Conversation>

        <div className="composer-zone">
          {files.length > 0 ? <div className="file-chips">{files.map((file) => <div className="file-chip" key={file.id}><FileText size={14}/><span>{file.name}</span><small>{file.format}</small><button aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => item.id !== file.id))}><X size={13}/></button></div>)}</div> : null}
          <form className="composer" onSubmit={onSubmit}>
            <input ref={fileInput} hidden multiple type="file" onChange={(event) => event.target.files && void uploadFiles(event.target.files)}/>
            <button className="attach" type="button" onClick={() => fileInput.current?.click()} disabled={uploading}>{uploading ? <LoaderCircle className="spin" size={19}/> : <Paperclip size={19}/>}</button>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ask Vortex anything…" rows={1}/>
            <button className="send" type="submit" disabled={busy || !input.trim()}>{busy ? <LoaderCircle className="spin" size={18}/> : <Send size={18}/>}</button>
          </form>
          <div className="composer-note">Vortex can make mistakes. High-impact results should be verified against primary sources.</div>
        </div>
      </section>
    </main>
  );
}
