import type { Generation } from "../media/generation.js";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Scope {
  owner: string;
  project: string;
}
export interface Chat {
  id: string;
  title: string;
  project: string;
  createdAt: string;
}
export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}
export interface FileRecord {
  id: string;
  name: string;
  kind: string;
  text: string;
  warnings: string[];
}
export class Store {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS chats(id TEXT PRIMARY KEY,owner TEXT NOT NULL,project TEXT NOT NULL,title TEXT NOT NULL,createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,chat TEXT REFERENCES chats(id) ON DELETE CASCADE,role TEXT NOT NULL,text TEXT NOT NULL,createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,owner TEXT NOT NULL,project TEXT NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,warnings TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memories(id TEXT PRIMARY KEY,owner TEXT NOT NULL,project TEXT NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,source TEXT NOT NULL,createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS generations(id TEXT PRIMARY KEY,owner TEXT NOT NULL,project TEXT NOT NULL,data TEXT NOT NULL,asset BLOB);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,project TEXT NOT NULL,chat TEXT NOT NULL,result TEXT NOT NULL,createdAt TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS memory_scope ON memories(owner,project,kind);
      CREATE INDEX IF NOT EXISTS chat_scope ON chats(owner,project);`);
  }
  generation(scope: Scope, id: string): Generation | undefined {
    const row = this.db
      .prepare(
        "SELECT data FROM generations WHERE id=? AND owner=? AND project=?",
      )
      .get(id, scope.owner, scope.project);
    return row ? (JSON.parse(row.data as string) as Generation) : undefined;
  }
  generations(scope: Scope): Generation[] {
    return this.db
      .prepare(
        "SELECT data FROM generations WHERE owner=? AND project=? ORDER BY rowid DESC LIMIT 100",
      )
      .all(scope.owner, scope.project)
      .map((row) => JSON.parse(row.data as string) as Generation);
  }
  activeGenerations(owner: string): number {
    const row = this.db
      .prepare(
        "SELECT count(*) AS n FROM generations WHERE owner=? AND json_extract(data,'$.status') IN ('submitting','queued','in_progress')",
      )
      .get(owner);
    return Number(row?.n ?? 0);
  }
  saveGeneration(scope: Scope, job: Generation, asset?: Buffer): void {
    this.db
      .prepare(
        "INSERT INTO generations VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,asset=COALESCE(excluded.asset,generations.asset) WHERE generations.owner=excluded.owner AND generations.project=excluded.project",
      )
      .run(
        job.id,
        scope.owner,
        scope.project,
        JSON.stringify(job),
        asset ?? null,
      );
    if (!this.generation(scope, job.id))
      throw new Error("Request ID belongs to another project.");
  }
  generationAsset(scope: Scope, id: string): Buffer | undefined {
    const row = this.db
      .prepare(
        "SELECT asset FROM generations WHERE id=? AND owner=? AND project=?",
      )
      .get(id, scope.owner, scope.project);
    return row?.asset ? Buffer.from(row.asset as Uint8Array) : undefined;
  }
  interruptGenerations(): void {
    this.db.exec(
      `UPDATE generations SET data=json_set(data,'$.status','failed','$.error','Server restarted before the creation result was saved. Check provider activity before creating again; the request was not repeated.') WHERE json_extract(data,'$.status')='submitting'`,
    );
  }
  createChat(scope: Scope, title = "New chat"): Chat {
    const chat = {
      id: crypto.randomUUID(),
      title: title.slice(0, 80),
      project: scope.project,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare("INSERT INTO chats VALUES(?,?,?,?,?)")
      .run(chat.id, scope.owner, scope.project, chat.title, chat.createdAt);
    return chat;
  }
  chats(scope: Scope): Chat[] {
    return this.db
      .prepare(
        "SELECT id,title,project,createdAt FROM chats WHERE owner=? AND project=? ORDER BY createdAt DESC LIMIT 100",
      )
      .all(scope.owner, scope.project) as unknown as Chat[];
  }
  assertChat(scope: Scope, id: string): void {
    if (
      !this.db
        .prepare("SELECT id FROM chats WHERE id=? AND owner=? AND project=?")
        .get(id, scope.owner, scope.project)
    )
      throw new Error("Chat not found in this project.");
  }
  messages(scope: Scope, chat: string): Message[] {
    this.assertChat(scope, chat);
    return this.db
      .prepare(
        "SELECT id,role,text,createdAt FROM messages WHERE chat=? ORDER BY rowid DESC LIMIT 40",
      )
      .all(chat)
      .reverse() as unknown as Message[];
  }
  append(
    scope: Scope,
    chat: string,
    role: Message["role"],
    text: string,
  ): void {
    this.assertChat(scope, chat);
    this.db
      .prepare("INSERT INTO messages VALUES(?,?,?,?,?)")
      .run(crypto.randomUUID(), chat, role, text, new Date().toISOString());
    if (role === "user")
      this.db
        .prepare("UPDATE chats SET title=? WHERE id=? AND title='New chat'")
        .run(text.slice(0, 80), chat);
  }
  deleteChat(scope: Scope, id: string): void {
    this.assertChat(scope, id);
    this.db
      .prepare("DELETE FROM runs WHERE chat=? AND owner=? AND project=?")
      .run(id, scope.owner, scope.project);
    this.db.prepare("DELETE FROM chats WHERE id=?").run(id);
  }
  addFile(scope: Scope, file: FileRecord): void {
    this.db
      .prepare("INSERT INTO files VALUES(?,?,?,?,?,?,?)")
      .run(
        file.id,
        scope.owner,
        scope.project,
        file.name,
        file.kind,
        file.text,
        JSON.stringify(file.warnings),
      );
  }
  file(scope: Scope, id: string): FileRecord {
    const row = this.db
      .prepare(
        "SELECT id,name,kind,text,warnings FROM files WHERE id=? AND owner=? AND project=?",
      )
      .get(id, scope.owner, scope.project);
    if (!row) throw new Error("File not found in this project.");
    return {
      ...row,
      warnings: JSON.parse(String(row.warnings)),
    } as unknown as FileRecord;
  }
  files(scope: Scope): Omit<FileRecord, "text">[] {
    return this.db
      .prepare(
        "SELECT id,name,kind,warnings FROM files WHERE owner=? AND project=? ORDER BY rowid DESC LIMIT 100",
      )
      .all(scope.owner, scope.project)
      .map((row) => ({
        ...row,
        warnings: JSON.parse(String(row.warnings)),
      })) as unknown as Omit<FileRecord, "text">[];
  }
  deleteFile(scope: Scope, id: string): void {
    this.file(scope, id);
    this.db
      .prepare(
        "DELETE FROM memories WHERE owner=? AND project=? AND source LIKE ?",
      )
      .run(scope.owner, scope.project, `file:${id} (%`);
    this.db.prepare("DELETE FROM files WHERE id=?").run(id);
  }
  remember(scope: Scope, kind: string, text: string, source: string): void {
    this.db
      .prepare("INSERT INTO memories VALUES(?,?,?,?,?,?,?)")
      .run(
        crypto.randomUUID(),
        scope.owner,
        scope.project,
        kind,
        text.slice(0, 12000),
        source,
        new Date().toISOString(),
      );
  }
  search(scope: Scope, query: string, kind = "knowledge"): unknown[] {
    const words =
      query
        .toLowerCase()
        .match(/[a-z0-9]{3,}/g)
        ?.slice(0, 8) ?? [];
    if (!words.length) return [];
    const rows = this.db
      .prepare(
        "SELECT text,source,createdAt FROM memories WHERE owner=? AND project=? AND kind=? ORDER BY rowid DESC LIMIT 200",
      )
      .all(scope.owner, scope.project, kind);
    return rows
      .map((row) => ({
        ...row,
        rank: words.filter((word) =>
          String(row.text).toLowerCase().includes(word),
        ).length,
      }))
      .filter((row) => row.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 8);
  }
  record(scope: Scope, chat: string, result: { id: string }): void {
    this.db
      .prepare("INSERT INTO runs VALUES(?,?,?,?,?,?)")
      .run(
        result.id,
        scope.owner,
        scope.project,
        chat,
        JSON.stringify(result),
        new Date().toISOString(),
      );
  }
  close(): void {
    this.db.close();
  }
}
