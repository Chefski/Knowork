import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './sqlite.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

interface MigrationRow {
  filename: string;
}

export function runMigrations(db: Db, dir: string = MIGRATIONS_DIR): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  const applied = new Set(
    db
      .prepare('SELECT filename FROM _migrations')
      .all()
      .map((row) => (row as MigrationRow).filename),
  );

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const recordApplied = db.prepare(
    'INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)',
  );

  for (const filename of files) {
    if (applied.has(filename)) continue;
    const sql = readFileSync(join(dir, filename), 'utf8');
    const apply = db.transaction(() => {
      db.exec(sql);
      recordApplied.run(filename, Date.now());
    });
    apply();
  }
}
