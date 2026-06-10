/**
 * Postgres connection — the only place a connection is constructed.
 *
 * The connection string comes exclusively from requireEnv('DATABASE_URL')
 * (human-populated shell env; never a .env file) and is passed straight into
 * the Pool — never logged, never re-exported.
 */

import pg from 'pg';
import { requireEnv } from '../core/config.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('db/client');

let pool: pg.Pool | undefined;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: requireEnv('DATABASE_URL'), max: 10 });
    pool.on('error', (err) => {
      log.error('idle client error', { error: String(err) });
    });
  }
  return pool;
}

/** Run a parameterized query on the pool and return the rows. */
export async function query<R extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<R[]> {
  const result = await getPool().query<R>(text, values);
  return result.rows;
}

/**
 * Run `fn` with a single dedicated connection — required for transactions,
 * which must not be spread across pool connections.
 */
export async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Close the pool (shutdown / test teardown). */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
