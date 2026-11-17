import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type AppDatabase = Database.Database;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS items (
    id           TEXT PRIMARY KEY,
    type         TEXT NOT NULL CHECK (type IN ('note', 'url')),
    title        TEXT NOT NULL,
    source_url   TEXT,
    raw_content  TEXT,
    status       TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
    error        TEXT,
    created_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id      TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    chunk_index  INTEGER NOT NULL,
    text         TEXT NOT NULL,
    embedding    BLOB NOT NULL,
    UNIQUE (item_id, chunk_index)
  );

  CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
`;

export function openDatabase(dbPath: string): AppDatabase {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
