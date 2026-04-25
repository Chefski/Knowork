import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './sqlite.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

export function runMigrations(db: Db, dir: string = MIGRATIONS_DIR): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  const rows = db.prepare('SELECT filename FROM _migrations').all() as { filename: string }[];
  const applied = new Set(rows.map((row) => row.filename));

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const recordApplied = db.prepare(
    'INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)',
  );

  for (const filename of files) {
    if (applied.has(filename)) continue;
    const sql = readFileSync(join(dir, filename), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      recordApplied.run(filename, Date.now());
    })();
  }
}
