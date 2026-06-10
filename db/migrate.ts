/**
 * Minimal migration applier: runs db/migrations/NNN_*.sql in filename order,
 * recording applied names in schema_migrations. Idempotent — already-applied
 * files are skipped. Fails loudly on any error; a half-applied schema must
 * never go unnoticed.
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createLogger } from '../core/logger.js';
import { query, withClient } from './client.js';

const log = createLogger('db/migrate');

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

/** Apply pending migrations in order. Returns the number applied. */
export async function migrate(): Promise<number> {
  await query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const applied = new Set(
    (await query<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name),
  );

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    log.info('applying migration', { file });
    // One dedicated connection per migration: a transaction must never be
    // spread across pool connections.
    await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        log.error('migration failed, rolled back', { file, error: String(err) });
        throw err;
      }
    });
    count += 1;
  }
  log.info('migrations complete', { applied: count, total: files.length });
  return count;
}
