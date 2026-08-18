import { access } from 'node:fs/promises';
import { verifyConnection, close } from '@eliware/rabbitmq';
import { output } from './output.mjs';
import { rabbitOptions, storageRoot } from './runtime.mjs';
export async function health(options, db) {
  const result = { database: 'ok', rabbitmq: 'unknown', storage: 'unknown' };
  try { await db.query('SELECT 1'); } catch { result.database = 'failed'; }
  try { await verifyConnection(rabbitOptions()).finally(close); result.rabbitmq = 'ok'; } catch { result.rabbitmq = 'failed'; }
  try { await access(storageRoot); result.storage = 'ok'; } catch { result.storage = 'failed'; }
  result.status = Object.values(result).every((value) => value === 'ok') ? 'ok' : 'degraded'; output(result, options); if (result.status !== 'ok') process.exitCode = 2;
}
