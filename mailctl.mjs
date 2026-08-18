#!/usr/bin/env node
import "dotenv/config";
import { createHash } from "node:crypto";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import process from "node:process";
import { access } from "node:fs/promises";
import packageJson from "./package.json" with { type: "json" };
import { log, registerHandlers, registerSignals } from "@eliware/common";
import { createDb } from "@eliware/mysql";
import {
  close as closeRabbit,
  getRabbitUrl,
  publishExchange,
} from "@eliware/rabbitmq";
import { generate } from "@eliware/snowflake";

const gzipAsync = promisify(gzip);
const storageRoot = resolve(process.env.MAIL_STORAGE_PATH ?? "/mnt/pvc/mail");
const outboundQueue = "mail.outbound.submit";
registerHandlers({ log });
registerSignals({ log, exitCode: 1, shutdownHook: async () => {} });

const commandHelp = {
  list: `List inbound message headers without loading full bodies.

USAGE
  mailctl list [--to ADDRESS] [--from ADDRESS] [--subject TEXT] [--after DATE] [--before DATE] [--limit N] [--json]

Use this first to discover message IDs. Each result includes a short text preview.
`,
  headers: `Read complete headers and metadata for one or more inbound messages.

USAGE
  mailctl headers MESSAGE_ID... [--json]
`,
  read: `Read complete inbound messages, including headers, text, HTML, and attachment metadata.

USAGE
  mailctl read MESSAGE_ID... [--json]
`,
  sent: `List outbound messages and aggregate/per-recipient delivery status.

USAGE
  mailctl sent [--status STATUS] [--from ADDRESS] [--to ADDRESS] [--after DATE] [--before DATE] [--limit N] [--json]

Useful statuses include queued, retryable, failed, and sent.
`,
  "sent-read": `Read a sent message with headers, bodies, attachments, deliveries, and SMTP attempts.

USAGE
  mailctl sent-read OUTBOUND_ID... [--json]
`,
  search: `Search inbound and outbound headers and bodies with FULLTEXT relevance ranking.

USAGE
  mailctl search QUERY [--json]

Results are ranked by relevance and identify whether each match is inbound or outbound.
`,
  thread: `Follow Message-ID, In-Reply-To, and References headers to find related mail.

USAGE
  mailctl thread MESSAGE_ID [--json]
`,
  retry: `Republish retryable outbound deliveries to RabbitMQ.

USAGE
  mailctl retry OUTBOUND_ID... --yes
  mailctl retry OUTBOUND_ID... --dry-run --json

Use --dry-run to inspect the planned action without changing state.
`,
  cancel: `Cancel queued outbound delivery work.

USAGE
  mailctl cancel OUTBOUND_ID... --yes
  mailctl cancel OUTBOUND_ID... --dry-run --json
`,
  health: `Check direct connectivity to MariaDB, RabbitMQ, and shared attachment storage.

USAGE
  mailctl health [--json]

Exit code 0 means healthy; exit code 2 means degraded.
`,
  attachments: `List attachment metadata for an inbound message.

USAGE
  mailctl attachments MESSAGE_ID [--json]
`,
  "save-attachments": `Extract inbound attachment files to a local directory.

USAGE
  mailctl save-attachments MESSAGE_ID DIRECTORY [--json]
`,
  "save-sent-attachments": `Extract outbound attachment files to a local directory.

USAGE
  mailctl save-sent-attachments OUTBOUND_ID DIRECTORY [--json]
`,
  send: `Queue a new outbound message directly through MariaDB and RabbitMQ.

USAGE
  mailctl send --sender ADDRESS --recipient ADDRESS[,ADDRESS] --subject TEXT --text TEXT [flags]

FLAGS
  --sender ADDRESS                  Managed envelope sender
  --recipient ADDRESS[,ADDRESS]     One or more recipients; repeatable
  --cc ADDRESS[,ADDRESS]            Carbon-copy recipients
  --bcc ADDRESS[,ADDRESS]           Blind-copy recipients
  --subject TEXT                    Subject line
  --text TEXT|@FILE                 Plain-text body or UTF-8 file
  --html TEXT|@FILE                 HTML body or UTF-8 file
  --attachment FILE[,FILE]          Files to hash, compress, deduplicate, and attach
  --idempotency KEY                 Retry-safe submission key
  --dry-run                         Preview without writing, publishing, or storing files

For an AI agent: use --json, provide --idempotency, and inspect sent afterward.
`,
  delete: `Delete inbound messages and their relational references.

USAGE
  mailctl delete MESSAGE_ID... --yes
  mailctl delete --query TEXT --yes
  mailctl delete MESSAGE_ID... --dry-run --json

Attachments are left for the mail service garbage collector to reclaim.
`,
  domains: `List domains currently managed by the mail service.

USAGE
  mailctl domains [--json]
`,
};

function help(positionals = []) {
  const command = positionals[0];
  if (command && commandHelp[command]) return `mailctl ${command}\n\n${commandHelp[command]}`;
  return `mailctl - non-interactive direct MariaDB/RabbitMQ mail tool

Commands:
  list                              List message headers and 100-char previews
  headers MESSAGE_ID...             Print complete headers
  read MESSAGE_ID...                Print complete headers and bodies
  sent                              List sent messages and delivery status
  sent-read OUTBOUND_ID...          Print a sent message and all deliveries
  search QUERY                       Search inbound and outbound mail
  thread MESSAGE_ID                  Show related inbound/outbound messages
  retry OUTBOUND_ID...               Retry failed or retryable deliveries
  cancel OUTBOUND_ID...              Cancel queued outbound mail
  health                             Check database, RabbitMQ, and storage
  attachments MESSAGE_ID            List attachment metadata
  save-attachments MESSAGE_ID DIR   Save all message attachments to DIR
  save-sent-attachments OUTBOUND_ID DIR
  send                             Queue an outbound message
  delete MESSAGE_ID...              Delete messages and database references
  domains                           List managed domains

Options:
  --json                            Emit machine-readable JSON
  --version                         Print the installed version
  --dry-run                         Preview send/delete without changing state
  --to ADDRESS                      Filter/list recipient
  --from ADDRESS                    Filter/list sender
  --subject TEXT                    Filter/list subject
  --status STATUS                   Filter sent messages by aggregate status
  --after ISO_DATE                  Include records after this timestamp
  --before ISO_DATE                 Include records before this timestamp
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
  --query TEXT                      Bulk-delete matching inbound mail

No arguments displays this help. The tool never starts a consumer or waits for input.

HELP
  mailctl --help
  mailctl help [COMMAND]
  mailctl COMMAND --help

Start with 'mailctl list --json' to discover inbound IDs, 'mailctl sent --json'
to inspect outbound delivery, or 'mailctl health --json' to verify the live system.
VERSION
  mailctl --version
`;
}

function parseArgs(argv) { const positionals = []; const options = {}; for (let i = 0; i < argv.length; i += 1) { const token = argv[i]; if (!token.startsWith("--")) { positionals.push(token); continue; } const [key, inline] = token.slice(2).split("=", 2); if (inline !== undefined) options[key] = inline; else if (argv[i + 1] && !argv[i + 1].startsWith("--")) options[key] = argv[++i]; else options[key] = true; } return { positionals, options }; }
function output(value, options, emptyMessage = "No results found.") {
  if (options.json) console.log(JSON.stringify(value, null, 2));
  else if (Array.isArray(value)) {
    if (!value.length) console.log(emptyMessage);
    else console.table(value);
  } else console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}
function values(value) { return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean); }
function required(options, name) { if (!options[name] || typeof options[name] !== "string") throw new Error(`--${name} is required`); return options[name]; }
function limitValue(value) { const limit = Number(value ?? 50); if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer"); return Math.min(limit, 500); }
function dateFilter(options, column, where, params) { if (options.after) { where.push(`${column} > ?`); params.push(options.after); } if (options.before) { where.push(`${column} < ?`); params.push(options.before); } }
async function bodyValue(value) { if (!value) return null; if (value.startsWith("@")) return readFile(value.slice(1), "utf8"); try { if ((await stat(value)).isFile()) return readFile(value, "utf8"); } catch {} return value; }
function storagePath(objectPath) { const path = resolve(storageRoot, objectPath); if (path !== storageRoot && !path.startsWith(`${storageRoot}${sep}`)) throw new Error("storage path escapes MAIL_STORAGE_PATH"); return path; }
async function dbConnection() { return createDb({}); }
function rabbitOptions() {
  const rabbitUrl = getRabbitUrl();
  if (!rabbitUrl) throw new Error("RabbitMQ configuration is required for send");
  return {
    rabbitUrl,
    messageOptions: { persistent: true, contentType: "application/json" },
  };
}

async function listMessages(options, db) {
  const where = ["m.deleted_at IS NULL"]; const params = [];
  if (options.to) { where.push("EXISTS (SELECT 1 FROM message_recipients x WHERE x.message_id=m.message_id AND x.address LIKE ?)"); params.push(`%${options.to}%`); }
  if (options.from) { where.push("m.envelope_sender LIKE ?"); params.push(`%${options.from}%`); }
  if (options.subject) { where.push("m.subject LIKE ?"); params.push(`%${options.subject}%`); }
  dateFilter(options, "m.received_at", where, params);
  const limit = limitValue(options.limit);
  const [rows] = await db.query(`SELECT m.message_id, m.envelope_sender, m.subject, m.received_at, m.body_text, GROUP_CONCAT(DISTINCT r.address ORDER BY r.address SEPARATOR ', ') recipients FROM messages m LEFT JOIN message_recipients r ON r.message_id=m.message_id WHERE ${where.join(" AND ")} GROUP BY m.message_id ORDER BY m.received_at DESC LIMIT ?`, [...params, limit]);
  return output(rows.map(({ body_text, ...row }) => ({ ...row, preview: String(body_text ?? "").split(/\r?\n/, 1)[0].slice(0, 100) })), options);
}
async function listSent(options, db) {
  const where = ["1=1"]; const params = [];
  if (options.from) { where.push("o.from_address LIKE ?"); params.push(`%${options.from}%`); }
  if (options.to) { where.push("EXISTS (SELECT 1 FROM outbound_deliveries x WHERE x.outbound_id=o.outbound_id AND x.recipient LIKE ?)"); params.push(`%${options.to}%`); }
  if (options.subject) { where.push("o.subject LIKE ?"); params.push(`%${options.subject}%`); }
  if (options.status) { where.push("o.status = ?"); params.push(options.status); }
  dateFilter(options, "o.created_at", where, params);
  const limit = limitValue(options.limit);
  const [rows] = await db.query(
    `SELECT o.outbound_id, o.from_address, o.subject, o.status, o.created_at,
            o.completed_at,
            GROUP_CONCAT(DISTINCT d.recipient ORDER BY d.recipient SEPARATOR ', ') recipients,
            GROUP_CONCAT(DISTINCT CONCAT(d.recipient, ':', d.status) ORDER BY d.recipient SEPARATOR ', ') delivery_status
       FROM outbound_messages o
       LEFT JOIN outbound_deliveries d ON d.outbound_id=o.outbound_id
      WHERE ${where.join(" AND ")}
      GROUP BY o.outbound_id
      ORDER BY o.created_at DESC LIMIT ?`,
    [...params, limit],
  );
  output(rows, options);
}
async function searchMail(query, options, db) {
  const needle = `%${query}%`; const limit = limitValue(options.limit);
  const [inbound] = await db.query(`SELECT 'inbound' kind, m.message_id id, m.envelope_sender sender, m.subject, m.received_at timestamp, MATCH(m.subject, m.body_text, m.body_html) AGAINST (? IN NATURAL LANGUAGE MODE) relevance FROM messages m WHERE m.deleted_at IS NULL AND (MATCH(m.subject, m.body_text, m.body_html) AGAINST (? IN BOOLEAN MODE) OR m.envelope_sender LIKE ? OR m.subject LIKE ? OR m.headers_json LIKE ?)`, [query, query, needle, needle, needle]);
  const [outbound] = await db.query(`SELECT 'outbound' kind, o.outbound_id id, o.from_address sender, o.subject, o.created_at timestamp, MATCH(o.subject, o.body_text, o.body_html) AGAINST (? IN NATURAL LANGUAGE MODE) relevance FROM outbound_messages o WHERE (MATCH(o.subject, o.body_text, o.body_html) AGAINST (? IN BOOLEAN MODE) OR o.from_address LIKE ? OR o.subject LIKE ? OR o.headers_json LIKE ? OR EXISTS (SELECT 1 FROM outbound_deliveries d WHERE d.outbound_id=o.outbound_id AND d.recipient LIKE ?))`, [query, query, needle, needle, needle, needle]);
  output([...inbound, ...outbound].sort((a, b) => Number(b.relevance) - Number(a.relevance) || new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit), options);
}
async function thread(id, options, db) {
  const [[message]] = await db.query("SELECT headers_json FROM messages WHERE message_id=?", [id]);
  if (!message) throw new Error(`message not found: ${id}`);
  let headers = {}; try { headers = JSON.parse(message.headers_json || "{}"); } catch {}
  const refs = [headers["Message-ID"], headers["In-Reply-To"], headers["References"]].filter(Boolean).join(" ");
  if (!refs) return output([], options);
  const [inbound] = await db.query("SELECT message_id id, 'inbound' kind, envelope_sender sender, subject, received_at timestamp FROM messages WHERE headers_json LIKE ? ORDER BY received_at", [`%${refs}%`]);
  const [outbound] = await db.query("SELECT outbound_id id, 'outbound' kind, from_address sender, subject, created_at timestamp FROM outbound_messages WHERE headers_json LIKE ? ORDER BY created_at", [`%${refs}%`]);
  output([...inbound, ...outbound], options);
}
async function updateOutbound(ids, action, options, db) {
  if (!ids.length) throw new Error(`${action} requires at least one outbound ID`);
  if (!options.yes && !options["dry-run"]) throw new Error(`${action} requires --yes or --dry-run`);
  const plan = { action, outboundIds: ids };
  if (options["dry-run"]) return output({ dryRun: true, ...plan }, options);
  const connection = await db.getConnection();
  try { await connection.beginTransaction(); for (const id of ids) { const status = action === "cancel" ? "canceled" : "retryable"; await connection.query("UPDATE outbound_deliveries SET status=? WHERE outbound_id=? AND status IN ('queued','retryable','failed')", [status, id]); await connection.query("UPDATE outbound_messages SET status=? WHERE outbound_id=? AND status NOT IN ('sent','canceled')", [action === "cancel" ? "canceled" : "queued", id]); } await connection.commit();
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  if (action === "retry") {
    try { for (const id of ids) await publishExchange("mail.direct", outboundQueue, { outbound_id: id }, { type: "direct", durable: true }, rabbitOptions()); }
    finally { await closeRabbit(); }
  }
  output(plan, options);
}
async function health(options, db) {
  const result = { database: "ok", rabbitmq: "unknown", storage: "unknown" };
  try { await db.query("SELECT 1"); } catch { result.database = "failed"; }
  try { await import("@eliware/rabbitmq").then(({ verifyConnection, close }) => verifyConnection(rabbitOptions()).finally(close)); result.rabbitmq = "ok"; } catch { result.rabbitmq = "failed"; }
  try { await access(storageRoot); result.storage = "ok"; } catch { result.storage = "failed"; }
  result.status = Object.values(result).every((value) => value === "ok") ? "ok" : "degraded"; output(result, options); if (result.status !== "ok") process.exitCode = 2;
}
async function readSent(ids, options, db) {
  if (!ids.length) throw new Error("sent-read requires at least one outbound ID");
  const result = [];
  for (const id of ids) {
    const [[message]] = await db.query("SELECT * FROM outbound_messages WHERE outbound_id=?", [id]);
    if (!message) throw new Error(`sent message not found: ${id}`);
    const [deliveries] = await db.query(
      "SELECT * FROM outbound_deliveries WHERE outbound_id=? ORDER BY recipient",
      [id],
    );
    const [attachments] = await db.query(
      `SELECT a.*, oa.content_id, oa.disposition, oa.part_order
         FROM outbound_attachments oa JOIN attachments a ON a.attachment_id=oa.attachment_id
        WHERE oa.outbound_id=? ORDER BY oa.part_order`,
      [id],
    );
    const [attempts] = await db.query(
      `SELECT oa.*, d.recipient FROM outbound_attempts oa
         JOIN outbound_deliveries d ON d.delivery_id=oa.delivery_id
        WHERE d.outbound_id=? ORDER BY d.recipient, oa.attempt_number`,
      [id],
    );
    let headers = {};
    try { headers = JSON.parse(message.headers_json || "{}"); } catch {}
    result.push({
      outbound_id: message.outbound_id,
      idempotency_key: message.idempotency_key,
      from_address: message.from_address,
      subject: message.subject,
      status: message.status,
      created_at: message.created_at,
      completed_at: message.completed_at,
      headers,
      body_text: message.body_text,
      body_html: message.body_html,
      deliveries,
      attempts,
      attachments,
    });
  }
  output(result.length === 1 ? result[0] : result, options);
}
async function readMessages(ids, options, db, includeBody = true) {
  const result = []; for (const id of ids) { const [[message]] = await db.query("SELECT * FROM messages WHERE message_id=? AND deleted_at IS NULL", [id]); if (!message) throw new Error(`message not found: ${id}`); const [recipients] = await db.query("SELECT address, recipient_type FROM message_recipients WHERE message_id=? ORDER BY recipient_type,address", [id]); const [attachments] = await db.query("SELECT a.*, ma.content_id, ma.disposition, ma.part_order FROM message_attachments ma JOIN attachments a ON a.attachment_id=ma.attachment_id WHERE ma.message_id=? ORDER BY ma.part_order", [id]); let headers = {}; try { headers = JSON.parse(message.headers_json || "{}"); } catch {} const record = { message_id: message.message_id, envelope_sender: message.envelope_sender, subject: message.subject, received_at: message.received_at, headers, recipients, attachments }; if (includeBody) { record.body_text = message.body_text; record.body_html = message.body_html; record.body_html_original = message.body_html_original; } result.push(record); } output(result.length === 1 ? result[0] : result, options);
}
async function attachmentList(id, options, db) { const [rows] = await db.query("SELECT a.*, ma.content_id, ma.disposition, ma.part_order FROM message_attachments ma JOIN attachments a ON a.attachment_id=ma.attachment_id WHERE ma.message_id=? ORDER BY ma.part_order", [id]); output(rows, options); }
async function saveAttachments(id, directory, options, db) { const [rows] = await db.query("SELECT a.* FROM message_attachments ma JOIN attachments a ON a.attachment_id=ma.attachment_id WHERE ma.message_id=? ORDER BY ma.part_order", [id]); await mkdir(directory, { recursive: true }); const saved = []; for (const row of rows) { let content = await readFile(storagePath(row.object_path)); if (row.storage_encoding === "gzip") content = await import("node:zlib").then(({ gunzip: unzip }) => promisify(unzip)(content)); const target = resolve(directory, row.original_filename || row.attachment_id); await writeFile(target, content); saved.push({ attachmentId: row.attachment_id, path: target, bytes: content.length }); } output(saved, options); }
async function saveSentAttachments(id, directory, options, db) { const [rows] = await db.query("SELECT a.* FROM outbound_attachments oa JOIN attachments a ON a.attachment_id=oa.attachment_id WHERE oa.outbound_id=? ORDER BY oa.part_order", [id]); await mkdir(directory, { recursive: true }); const saved = []; for (const row of rows) { let content = await readFile(storagePath(row.object_path)); if (row.storage_encoding === "gzip") content = await import("node:zlib").then(({ gunzip: unzip }) => promisify(unzip)(content)); const target = resolve(directory, row.original_filename || row.attachment_id); await writeFile(target, content); saved.push({ attachmentId: row.attachment_id, path: target, bytes: content.length }); } output(saved, options); }
async function deleteMessages(ids, options, db) { if (options.query) { const needle = `%${options.query}%`; const [rows] = await db.query("SELECT message_id FROM messages WHERE deleted_at IS NULL AND (envelope_sender LIKE ? OR subject LIKE ? OR body_text LIKE ? OR headers_json LIKE ?)", [needle, needle, needle, needle]); ids = rows.map(({ message_id }) => message_id); } if (!ids.length) throw new Error("delete requires message IDs or --query"); if (!options.yes && !options["dry-run"]) throw new Error("refusing to delete without --yes"); if (options["dry-run"]) return output({ dryRun: true, action: "delete", messageIds: ids }, options); const connection = await db.getConnection(); try { await connection.beginTransaction(); for (const id of ids) { await connection.query("DELETE FROM message_attachments WHERE message_id=?", [id]); await connection.query("DELETE FROM message_recipients WHERE message_id=?", [id]); await connection.query("DELETE FROM message_mailboxes WHERE message_id=?", [id]); await connection.query("UPDATE messages SET deleted_at=CURRENT_TIMESTAMP(6) WHERE message_id=?", [id]); } await connection.commit(); output({ deleted: ids }, options); } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); } }
async function saveOutboundAttachment(file, persist = true) { const original = await readFile(file); const hash = createHash("sha256").update(original).digest("hex"); const objectPath = join("attachments", hash.slice(0, 2), hash.slice(2, 4), hash); const compressed = await gzipAsync(original); if (persist) { const directory = join(storageRoot, "attachments", hash.slice(0, 2), hash.slice(2, 4)); await mkdir(directory, { recursive: true }); try { await writeFile(join(storageRoot, objectPath), compressed, { flag: "wx" }); } catch (error) { if (error.code !== "EEXIST") throw error; } } return { hash, objectPath, original, compressed, filename: basename(file) }; }
async function send(options, db) {
  const sender = required(options, "sender"); const recipients = values(options.recipient); if (!recipients.length) throw new Error("--recipient is required"); const [managed] = await db.query("SELECT domain_id FROM domains WHERE name=? AND status='managed'", [sender.split("@").at(-1).toLowerCase()]); if (!managed.length) throw new Error("sender domain is not managed"); const cc = values(options.cc); const bcc = values(options.bcc); const text = await bodyValue(options.text) ?? ""; const html = await bodyValue(options.html); const files = values(options.attachment); const attachments = []; for (const file of files) attachments.push(await saveOutboundAttachment(file, !options["dry-run"])); const outboundId = generate(); const idempotencyKey = options.idempotency ?? `mailctl:${outboundId}`; const plan = { outboundId, sender, recipients: [...recipients, ...cc, ...bcc], subject: options.subject ?? "", attachments: attachments.map((item) => ({ filename: item.filename, sha256: item.hash, bytes: item.original.length })) }; if (options["dry-run"]) return output({ dryRun: true, action: "send", ...plan }, options);
  const connection = await db.getConnection(); try { await connection.beginTransaction(); await connection.query("INSERT INTO outbound_messages (outbound_id,idempotency_key,from_address,subject,body_text,body_html,headers_json) VALUES (?,?,?,?,?,?,?)", [outboundId, idempotencyKey, sender, options.subject ?? "", text, html, JSON.stringify({ Cc: cc.join(", "), Bcc: bcc.join(", ") })]); for (const recipient of plan.recipients) await connection.query("INSERT INTO outbound_deliveries (delivery_id,outbound_id,recipient) VALUES (?,?,?)", [generate(), outboundId, recipient]); for (const [index, attachment] of attachments.entries()) { const candidate = generate(); await connection.query("INSERT INTO attachments (attachment_id,content_sha256,object_path,storage_encoding,original_size_bytes,stored_size_bytes,original_filename,content_type) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE attachment_id=attachment_id", [candidate, attachment.hash, attachment.objectPath, "gzip", attachment.original.length, attachment.compressed.length, attachment.filename, "application/octet-stream"]); const [[stored]] = await connection.query("SELECT attachment_id FROM attachments WHERE content_sha256=? AND storage_encoding='gzip'", [attachment.hash]); await connection.query("INSERT INTO outbound_attachments (outbound_id,attachment_id,disposition,part_order) VALUES (?,?,?,?)", [outboundId, stored.attachment_id, "attachment", index]); } await connection.commit(); } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  try {
    await publishExchange(
      "mail.direct",
      outboundQueue,
      { outbound_id: outboundId, idempotency_key: idempotencyKey },
      { type: "direct", durable: true },
      rabbitOptions(),
    );
  } finally {
    await closeRabbit();
  }
  output({ ...plan, status: "queued" }, options);
}
async function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  if (options.version) return console.log(packageJson.version);
  if (positionals[0] === "help") return console.log(help(positionals.slice(1)));
  if (!positionals.length || options.help) return console.log(help(positionals));
  const [command, ...ids] = positionals;
  const db = await dbConnection();
  try {
    if (command === "list") return await listMessages(options, db);
    if (command === "headers") return await readMessages(ids, options, db, false);
    if (command === "read") return await readMessages(ids, options, db, true);
    if (command === "sent") return await listSent(options, db);
    if (command === "sent-read") return await readSent(ids, options, db);
    if (command === "search") return await searchMail(required({ query: ids[0] }, "query"), options, db);
    if (command === "thread") return await thread(ids[0], options, db);
    if (command === "retry" || command === "cancel") return await updateOutbound(ids, command, options, db);
    if (command === "health") return await health(options, db);
    if (command === "attachments") return await attachmentList(ids[0], options, db);
    if (command === "save-attachments") return await saveAttachments(ids[0], ids[1] ?? options.directory, options, db);
    if (command === "save-sent-attachments") return await saveSentAttachments(ids[0], ids[1] ?? options.directory, options, db);
    if (command === "domains") {
      const [rows] = await db.query("SELECT domain_id,name,status,created_at,updated_at FROM domains ORDER BY name");
      return output(rows, options);
    }
    if (command === "delete") return await deleteMessages(ids, options, db);
    if (command === "send") return await send(options, db);
    throw new Error(`unknown command: ${command}`);
  } finally {
    await db.end();
  }
}
main().catch((error) => {
  const { options } = parseArgs(process.argv.slice(2));
  const payload = { error: error.message, code: error.code ?? "MAILCTL_ERROR" };
  if (options.json) console.error(JSON.stringify(payload));
  else log.error("mailctl command failed", payload);
  process.exitCode = 1;
});
