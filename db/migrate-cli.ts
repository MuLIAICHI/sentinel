/**
 * CLI entry for `npm run db:migrate`. Requires DATABASE_URL in the shell env
 * (never from a .env file — project hard rule).
 */

import { migrate } from './migrate.js';
import { closePool } from './client.js';

try {
  await migrate();
} finally {
  await closePool();
}
