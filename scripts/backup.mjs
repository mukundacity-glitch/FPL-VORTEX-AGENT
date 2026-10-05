import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, chmod } from "node:fs/promises";
const source = process.env.VORTEX_DB_PATH ?? ".vortex/vortex.sqlite";
await mkdir("backups", { recursive: true, mode: 0o700 });
const target = `backups/vortex-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`;
const db = new DatabaseSync(source, { readOnly: true });
try {
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
    throw Error("Database integrity check failed.");
  await backup(db, target);
  await chmod(target, 0o600);
  console.log(`Consistent SQLite backup saved to ${target}`);
} finally {
  db.close();
}
