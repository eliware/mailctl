import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { resolve } from 'node:path';
import { storagePath } from './runtime.mjs';
import { output } from './output.mjs';
const gunzipAsync = promisify(gunzip);

export async function attachmentList(id, options, db) { const [rows] = await db.query('SELECT a.*, ma.content_id, ma.disposition, ma.part_order FROM message_attachments ma JOIN attachments a ON a.attachment_id=ma.attachment_id WHERE ma.message_id=? ORDER BY ma.part_order', [id]); output(rows, options); }
async function saveRows(rows, directory, options) { await mkdir(directory, { recursive: true }); const saved = []; for (const row of rows) { let content = await readFile(storagePath(row.object_path)); if (row.storage_encoding === 'gzip') content = await gunzipAsync(content); const target = resolve(directory, row.original_filename || row.attachment_id); await writeFile(target, content); saved.push({ attachmentId: row.attachment_id, path: target, bytes: content.length }); } output(saved, options); }
export async function saveAttachments(id, directory, options, db) { const [rows] = await db.query('SELECT a.* FROM message_attachments ma JOIN attachments a ON a.attachment_id=ma.attachment_id WHERE ma.message_id=? ORDER BY ma.part_order', [id]); return saveRows(rows, directory, options); }
export async function saveSentAttachments(id, directory, options, db) { const [rows] = await db.query('SELECT a.* FROM outbound_attachments oa JOIN attachments a ON a.attachment_id=oa.attachment_id WHERE oa.outbound_id=? ORDER BY oa.part_order', [id]); return saveRows(rows, directory, options); }
