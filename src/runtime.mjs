import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createDb } from '@eliware/mysql';
import { getRabbitUrl } from '@eliware/rabbitmq';

export const storageRoot = resolve(process.env.MAIL_STORAGE_PATH ?? '/mnt/pvc/mail');
export const outboundQueue = 'mail.outbound.submit';
export async function dbConnection() { return createDb({}); }
export function rabbitOptions() {
  const rabbitUrl = getRabbitUrl();
  if (!rabbitUrl) throw new Error('RabbitMQ configuration is required for send');
  return { rabbitUrl, messageOptions: { persistent: true, contentType: 'application/json' } };
}
export async function bodyValue(value) {
  if (!value) return null;
  if (value.startsWith('@')) return readFile(value.slice(1), 'utf8');
  try { if ((await stat(value)).isFile()) return readFile(value, 'utf8'); } catch {}
  return value;
}
export function storagePath(objectPath) {
  const path = resolve(storageRoot, objectPath);
  if (path !== storageRoot && !path.startsWith(`${storageRoot}${sep}`)) throw new Error('storage path escapes MAIL_STORAGE_PATH');
  return path;
}
