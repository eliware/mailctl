#!/usr/bin/env node
import "dotenv/config";
import { createHash } from "node:crypto";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import process from "node:process";
import { log, registerHandlers, registerSignals } from "@eliware/common";
import { createDb } from "@eliware/mysql";
import { close as closeRabbit, publishExchange } from "@eliware/rabbitmq";
import { generate } from "@eliware/snowflake";

const gzipAsync = promisify(gzip);
const storageRoot = resolve(process.env.MAIL_STORAGE_PATH ?? "/mnt/pvc/mail");
const outboundQueue = "mail.outbound.submit";
registerHandlers({ log });
registerSignals({ log, exitCode: 1, shutdownHook: async () => {} });

function help() {
  return `mailctl - non-interactive direct MariaDB/RabbitMQ mail tool

Commands:
  list                              List message headers and 100-char previews
  headers MESSAGE_ID...             Print complete headers
  read MESSAGE_ID...                Print complete headers and bodies
  attachments MESSAGE_ID            List attachment metadata
  save-attachments MESSAGE_ID DIR   Save all message attachments to DIR
  send                             Queue an outbound message
  delete MESSAGE_ID...              Delete messages and database references
  domains                           List managed domains

Options:
  --json                            Emit machine-readable JSON
  --dry-run                         Preview send/delete without changing state
  --to ADDRESS                      Filter/list recipient
  --from ADDRESS                    Filter/list sender
  --subject TEXT                    Filter/list subject
  --limit NUMBER                    List limit, default 50, maximum 500
  --sender ADDRESS                  Send envelope sender
  --recipient ADDRESS[,ADDRESS]     Send recipients; repeat or comma-separate
  --cc ADDRESS[,ADDRESS]            Carbon-copy recipients
  --bcc ADDRESS[,ADDRESS]           Blind-copy recipients
  --subject TEXT                    Send subject
  --text TEXT|@FILE                 Plain-text body
  --html TEXT|@FILE                 HTML body
  --attachment FILE[,FILE]          Outbound attachments
  --yes                             Confirm delete

No arguments displays this help. The tool never starts a consumer or waits for input.
`;
}

function parseArgs(argv) { const positionals = []; const options = {}; for (let i = 0; i < argv.length; i += 1) { const token = argv[i]; if (!token.startsWith("--")) { positionals.push(token); continue; } const [key, inline] = token.slice(2).split("=", 2); if (inline !== undefined) options[key] = inline; else if (argv[i + 1] && !argv[i + 1].startsWith("--")) options[key] = argv[++i]; else options[key] = true; } return { positionals, options }; }
function output(value, options) { if (options.json) console.log(JSON.stringify(value, null, 2)); else if (Array.isArray(value)) console.table(value); else console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2)); }
function values(value) { return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean); }
function required(options, name) { if (!options[name] || typeof options[name] !== "string") throw new Error(`--${name} is required`); return options[name]; }
async function bodyValue(value) { if (!value) return null; if (value.startsWith("@")) return readFile(value.slice(1), "utf8"); try { if ((await stat(value)).isFile()) return readFile(value, "utf8"); } catch {} return value; }
function storagePath(objectPath) { const path = resolve(storageRoot, objectPath); if (path !== storageRoot && !path.startsWith(`${storageRoot}${sep}`)) throw new Error("storage path escapes MAIL_STORAGE_PATH"); return path; }
async function dbConnection() { return createDb({}); }
function rabbitOptions() { return { rabbitUrl: process.env.RABBITMQ_URL, messageOptions: { persistent: true, contentType: "application/json" } }; }

async function listMessages(options, db) {
  const where = ["m.deleted_at IS NULL"]; const params = [];
  if (options.to) { where.push("EXISTS (SELECT 1 FROM message_recipients x WHERE x.message_id=m.message_id AND x.address LIKE ?)"); params.push(`%${options.to}%`); }
  if (options.from) { where.push("m.envelope_sender LIKE ?"); params.push(`%${options.from}%`); }
  if (options.subject) { where.push("m.subject LIKE ?"); params.push(`%${options.subject}%`); }
  const limit = Math.min(Math.max(Number(options.limit ?? 50), 1), 500);
  const [rows] = await db.query(`SELECT m.message_id, m.envelope_sender, m.subject, m.received_at, m.body_text, GROUP_CONCAT(DISTINCT r.address ORDER BY r.address SEPARATOR ', ') recipients FROM messages m LEFT JOIN message_recipients r ON r.message_id=m.message_id WHERE ${where.join(" AND ")} GROUP BY m.message_id ORDER BY m.received_at DESC LIMIT ?`, [...params, limit]);
  return output(rows.map(({ body_text, ...row }) => ({ ...row, preview: String(body_text ?? "").split(/\r?\n/, 1)[0].slice(0, 100) })), options);
}
async function readMessages(ids, options, db, includeBody = true) {
  const result = []; for (const id of ids) { const [[message]] = await db.query("SELECT * FROM messages WHERE message_id=? AND deleted_at IS NULL", [id]); if (!message) throw new Error(`message not found: ${id}`); const [recipients] = await db.query("SELECT address, recipient_type FROM message_recipients WHERE message_id=? ORDER BY recipient_type,address", [id]); const [attachments] = await db.query("SELECT a.*, ma.content_id, ma.disposition, ma.part_order FROM message_attachments ma JOIN attachments a ON a.attachment_id=ma.attachment_id WHERE ma.message_id=? ORDER BY ma.part_order", [id]); let headers = {}; try { headers = JSON.parse(message.headers_json || "{}"); } catch {} const record = { message_id: message.message_id, envelope_sender: message.envelope_sender, subject: message.subject, received_at: message.received_at, headers, recipients, attachments }; if (includeBody) { record.body_text = message.body_text; record.body_html = message.body_html; record.body_html_original = message.body_html_original; } result.push(record); } output(result.length === 1 ? result[0] : result, options);
}
async function attachmentList(id, options, db) { const [rows] = await db.query("SELECT a.*, ma.content_id, ma.disposition, ma.part_order FROM message_attachments ma JOIN attachments a ON a.attachment_id=ma.attachment_id WHERE ma.message_id=? ORDER BY ma.part_order", [id]); output(rows, options); }
async function saveAttachments(id, directory, options, db) { const [rows] = await db.query("SELECT a.* FROM message_attachments ma JOIN attachments a ON a.attachment_id=ma.attachment_id WHERE ma.message_id=? ORDER BY ma.part_order", [id]); await mkdir(directory, { recursive: true }); const saved = []; for (const row of rows) { let content = await readFile(storagePath(row.object_path)); if (row.storage_encoding === "gzip") content = await import("node:zlib").then(({ gunzip: unzip }) => promisify(unzip)(content)); const target = resolve(directory, row.original_filename || row.attachment_id); await writeFile(target, content); saved.push({ attachmentId: row.attachment_id, path: target, bytes: content.length }); } output(saved, options); }
async function deleteMessages(ids, options, db) { if (!options.yes && !options["dry-run"]) throw new Error("refusing to delete without --yes"); if (options["dry-run"]) return output({ dryRun: true, action: "delete", messageIds: ids }, options); const connection = await db.getConnection(); try { await connection.beginTransaction(); for (const id of ids) { await connection.query("DELETE FROM message_attachments WHERE message_id=?", [id]); await connection.query("DELETE FROM message_recipients WHERE message_id=?", [id]); await connection.query("DELETE FROM message_mailboxes WHERE message_id=?", [id]); await connection.query("UPDATE messages SET deleted_at=CURRENT_TIMESTAMP(6) WHERE message_id=?", [id]); } await connection.commit(); output({ deleted: ids }, options); } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); } }
async function saveOutboundAttachment(file, persist = true) { const original = await readFile(file); const hash = createHash("sha256").update(original).digest("hex"); const objectPath = join("attachments", hash.slice(0, 2), hash.slice(2, 4), hash); const compressed = await gzipAsync(original); if (persist) { const directory = join(storageRoot, "attachments", hash.slice(0, 2), hash.slice(2, 4)); await mkdir(directory, { recursive: true }); try { await writeFile(join(storageRoot, objectPath), compressed, { flag: "wx" }); } catch (error) { if (error.code !== "EEXIST") throw error; } } return { hash, objectPath, original, compressed, filename: basename(file) }; }
async function send(options, db) {
  const sender = required(options, "sender"); const recipients = values(options.recipient); if (!recipients.length) throw new Error("--recipient is required"); const [managed] = await db.query("SELECT domain_id FROM domains WHERE name=? AND status='managed'", [sender.split("@").at(-1).toLowerCase()]); if (!managed.length) throw new Error("sender domain is not managed"); const cc = values(options.cc); const bcc = values(options.bcc); const text = await bodyValue(options.text) ?? ""; const html = await bodyValue(options.html); const files = values(options.attachment); const attachments = []; for (const file of files) attachments.push(await saveOutboundAttachment(file, !options["dry-run"])); const outboundId = generate(); const idempotencyKey = options.idempotency ?? `mailctl:${outboundId}`; const plan = { outboundId, sender, recipients: [...recipients, ...cc, ...bcc], subject: options.subject ?? "", attachments: attachments.map((item) => ({ filename: item.filename, sha256: item.hash, bytes: item.original.length })) }; if (options["dry-run"]) return output({ dryRun: true, action: "send", ...plan }, options);
  const connection = await db.getConnection(); try { await connection.beginTransaction(); await connection.query("INSERT INTO outbound_messages (outbound_id,idempotency_key,from_address,subject,body_text,body_html,headers_json) VALUES (?,?,?,?,?,?,?)", [outboundId, idempotencyKey, sender, options.subject ?? "", text, html, JSON.stringify({ Cc: cc.join(", "), Bcc: bcc.join(", ") })]); for (const recipient of plan.recipients) await connection.query("INSERT INTO outbound_deliveries (delivery_id,outbound_id,recipient) VALUES (?,?,?)", [generate(), outboundId, recipient]); for (const [index, attachment] of attachments.entries()) { const candidate = generate(); await connection.query("INSERT INTO attachments (attachment_id,content_sha256,object_path,storage_encoding,original_size_bytes,stored_size_bytes,original_filename,content_type) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE attachment_id=attachment_id", [candidate, attachment.hash, attachment.objectPath, "gzip", attachment.original.length, attachment.compressed.length, attachment.filename, "application/octet-stream"]); const [[stored]] = await connection.query("SELECT attachment_id FROM attachments WHERE content_sha256=? AND storage_encoding='gzip'", [attachment.hash]); await connection.query("INSERT INTO outbound_attachments (outbound_id,attachment_id,disposition,part_order) VALUES (?,?,?,?)", [outboundId, stored.attachment_id, "attachment", index]); } await connection.commit(); } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  try { await publishExchange("mail.direct", outboundQueue, { outbound_id: outboundId, idempotency_key: idempotencyKey }, {}, rabbitOptions()); } finally { await closeRabbit(); } output({ ...plan, status: "queued" }, options);
}
async function main() { const { positionals, options } = parseArgs(process.argv.slice(2)); if (!positionals.length || options.help) return console.log(help()); const [command, ...ids] = positionals; const db = await dbConnection(); try { if (command === "list") return await listMessages(options, db); if (command === "headers") return await readMessages(ids, options, db, false); if (command === "read") return await readMessages(ids, options, db, true); if (command === "attachments") return await attachmentList(ids[0], options, db); if (command === "save-attachments") return await saveAttachments(ids[0], ids[1] ?? options.directory, options, db); if (command === "domains") { const [rows] = await db.query("SELECT domain_id,name,status,created_at,updated_at FROM domains ORDER BY name"); return output(rows, options); } if (command === "delete") return await deleteMessages(ids, options, db); if (command === "send") return await send(options, db); throw new Error(`unknown command: ${command}`); } finally { await db.end(); } }
main().catch((error) => { log.error("mailctl command failed", { error: error.message }); process.exitCode = 1; });
