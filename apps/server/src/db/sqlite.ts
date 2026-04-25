import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

export type Db = DatabaseType;

export function openDatabase(dataDir: string): Db {
  const isMemory = dataDir === ':memory:';
  const dbPath = isMemory ? ':memory:' : join(dataDir, 'data.db');

  if (!isMemory) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  return db;
}
