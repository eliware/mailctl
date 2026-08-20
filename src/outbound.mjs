import { createHash } from "node:crypto";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { generate } from "@eliware/snowflake";
import { close as closeRabbit, publishExchange } from "@eliware/rabbitmq";
import {
  bodyValue,
  outboundQueue,
  rabbitOptions,
  storageRoot,
} from "./runtime.mjs";
import { output } from "./output.mjs";
import { dateFilter, limitValue, required, values } from "./args.mjs";

const gzipAsync = promisify(gzip);

export async function listSent(options, db) {
  const where = ["o.deleted_at IS NULL"];
  const params = [];
  if (options.from) {
    where.push("o.from_address LIKE ?");
    params.push(`%${options.from}%`);
  }
  if (options.to) {
    where.push(
      "EXISTS (SELECT 1 FROM outbound_deliveries x WHERE x.outbound_id=o.outbound_id AND x.recipient LIKE ?)",
    );
    params.push(`%${options.to}%`);
  }
  if (options.subject) {
    where.push("o.subject LIKE ?");
    params.push(`%${options.subject}%`);
  }
  if (options.status) {
    where.push("o.status = ?");
    params.push(options.status);
  }
  dateFilter(options, "o.created_at", where, params);
  const [rows] = await db.query(
    `SELECT o.outbound_id, o.from_address, o.subject, o.status, o.created_at, o.completed_at, GROUP_CONCAT(DISTINCT d.recipient ORDER BY d.recipient SEPARATOR ', ') recipients, GROUP_CONCAT(DISTINCT CONCAT(d.recipient, ':', d.status) ORDER BY d.recipient SEPARATOR ', ') delivery_status FROM outbound_messages o LEFT JOIN outbound_deliveries d ON d.outbound_id=o.outbound_id WHERE ${where.join(" AND ")} GROUP BY o.outbound_id ORDER BY o.created_at DESC LIMIT ?`,
    [...params, limitValue(options.limit)],
  );
  output(rows, options);
}

export async function readSent(ids, options, db) {
  if (!ids.length)
    throw new Error("sent-read requires at least one outbound ID");
  const result = [];
  for (const id of ids) {
    const [[message]] = await db.query(
      "SELECT * FROM outbound_messages WHERE outbound_id=? AND deleted_at IS NULL",
      [id],
    );
    if (!message) throw new Error(`sent message not found: ${id}`);
    const [deliveries] = await db.query(
      "SELECT * FROM outbound_deliveries WHERE outbound_id=? ORDER BY recipient",
      [id],
    );
    const [attachments] = await db.query(
      "SELECT a.*, oa.content_id, oa.disposition, oa.part_order FROM outbound_attachments oa JOIN attachments a ON a.attachment_id=oa.attachment_id WHERE oa.outbound_id=? ORDER BY oa.part_order",
      [id],
    );
    const [attempts] = await db.query(
      "SELECT oa.*, d.recipient FROM outbound_attempts oa JOIN outbound_deliveries d ON d.delivery_id=oa.delivery_id WHERE d.outbound_id=? ORDER BY d.recipient, oa.attempt_number",
      [id],
    );
    let headers = {};
    try {
      headers = JSON.parse(message.headers_json || "{}");
    } catch {}
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

export async function outboundStatus(ids, options, db) {
  if (!ids.length) throw new Error('outbound-status requires at least one outbound ID');
  const staleAfterMs = Number(process.env.MAIL_OUTBOUND_STALE_DELIVERY_MS ?? 300_000);
  const result = [];
  for (const id of ids) {
    const [[message]] = await db.query('SELECT outbound_id, from_address, subject, status, created_at, completed_at FROM outbound_messages WHERE outbound_id=? AND deleted_at IS NULL', [id]);
    if (!message) throw new Error(`outbound message not found: ${id}`);
    const [deliveries] = await db.query('SELECT * FROM outbound_deliveries WHERE outbound_id=? ORDER BY recipient', [id]);
    const [attempts] = await db.query('SELECT oa.*, d.recipient FROM outbound_attempts oa JOIN outbound_deliveries d ON d.delivery_id=oa.delivery_id WHERE d.outbound_id=? ORDER BY d.recipient, oa.attempt_number', [id]);
    const byDelivery = new Map();
    for (const attempt of attempts) byDelivery.set(attempt.delivery_id, attempt);
    const now = Date.now();
    result.push({
      ...message,
      stale_after_ms: staleAfterMs,
      deliveries: deliveries.map((delivery) => {
        const latestAttempt = byDelivery.get(delivery.delivery_id) ?? null;
        const started = latestAttempt?.started_at ? new Date(latestAttempt.started_at).getTime() : 0;
        return {
          ...delivery,
          latest_attempt: latestAttempt,
          age_seconds: started ? Math.max(0, Math.floor((now - started) / 1000)) : null,
          stale: delivery.status === 'sending' && started > 0 && now - started >= staleAfterMs,
        };
      }),
    });
  }
  output(result.length === 1 ? result[0] : result, options);
}

export async function updateOutbound(ids, action, options, db) {
  if (!ids.length)
    throw new Error(`${action} requires at least one outbound ID`);
  if (!options.yes && !options["dry-run"])
    throw new Error(`${action} requires --yes or --dry-run`);
  const plan = { action, outboundIds: ids };
  if (options["dry-run"]) return output({ dryRun: true, ...plan }, options);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    for (const id of ids) {
      const status = action === "cancel" ? "canceled" : "retryable";
      await connection.query(
        "UPDATE outbound_deliveries d JOIN outbound_messages o ON o.outbound_id=d.outbound_id SET d.status=? WHERE d.outbound_id=? AND o.deleted_at IS NULL AND d.status IN ('queued','retryable','failed')",
        [status, id],
      );
      await connection.query(
        "UPDATE outbound_messages SET status=? WHERE outbound_id=? AND deleted_at IS NULL AND status NOT IN ('sent','canceled')",
        [action === "cancel" ? "canceled" : "queued", id],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  if (action === "retry") {
    try {
      for (const id of ids)
        await publishExchange(
          "mail.direct",
          outboundQueue,
          { outbound_id: id },
          { type: "direct", durable: true },
          rabbitOptions(),
        );
    } finally {
      await closeRabbit();
    }
  }
  output(plan, options);
}

export async function saveOutboundAttachment(
  file,
  persist = true,
  { writeFileFn = writeFile } = {},
) {
  const original = await readFile(file);
  const hash = createHash("sha256").update(original).digest("hex");
  const objectPath = join(
    "attachments",
    hash.slice(0, 2),
    hash.slice(2, 4),
    hash,
  );
  const compressed = await gzipAsync(original);
  if (persist) {
    const directory = join(
      storageRoot,
      "attachments",
      hash.slice(0, 2),
      hash.slice(2, 4),
    );
    await mkdir(directory, { recursive: true });
    try {
      await writeFileFn(join(storageRoot, objectPath), compressed, {
        flag: "wx",
      });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  return { hash, objectPath, original, compressed, filename: basename(file) };
}

export async function send(options, db) {
  const sender = required(options, "sender");
  const recipients = values(options.recipient);
  if (!recipients.length) throw new Error("--recipient is required");
  const [managed] = await db.query(
    "SELECT domain_id FROM domains WHERE name=? AND status='managed'",
    [sender.split("@").at(-1).toLowerCase()],
  );
  if (!managed.length) throw new Error("sender domain is not managed");
  const cc = values(options.cc);
  const bcc = values(options.bcc);
  const text = (await bodyValue(options.text)) ?? "";
  const html = await bodyValue(options.html);
  const attachments = [];
  for (const file of values(options.attachment))
    attachments.push(await saveOutboundAttachment(file, !options["dry-run"]));
  const outboundId = generate();
  const idempotencyKey = options.idempotency ?? `mailctl:${outboundId}`;
  const plan = {
    outboundId,
    sender,
    recipients: [...recipients, ...cc, ...bcc],
    subject: options.subject ?? "",
    attachments: attachments.map((item) => ({
      filename: item.filename,
      sha256: item.hash,
      bytes: item.original.length,
    })),
  };
  if (options["dry-run"])
    return output({ dryRun: true, action: "send", ...plan }, options);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      "INSERT INTO outbound_messages (outbound_id,idempotency_key,from_address,subject,body_text,body_html,headers_json) VALUES (?,?,?,?,?,?,?)",
      [
        outboundId,
        idempotencyKey,
        sender,
        options.subject ?? "",
        text,
        html,
        JSON.stringify({ Cc: cc.join(", "), Bcc: bcc.join(", ") }),
      ],
    );
    for (const recipient of plan.recipients)
      await connection.query(
        "INSERT INTO outbound_deliveries (delivery_id,outbound_id,recipient) VALUES (?,?,?)",
        [generate(), outboundId, recipient],
      );
    for (const [index, attachment] of attachments.entries()) {
      await connection.query(
        "INSERT INTO attachments (attachment_id,content_sha256,object_path,storage_encoding,original_size_bytes,stored_size_bytes,original_filename,content_type) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE attachment_id=attachment_id",
        [
          generate(),
          attachment.hash,
          attachment.objectPath,
          "gzip",
          attachment.original.length,
          attachment.compressed.length,
          attachment.filename,
          "application/octet-stream",
        ],
      );
      const [[stored]] = await connection.query(
        "SELECT attachment_id FROM attachments WHERE content_sha256=? AND storage_encoding='gzip'",
        [attachment.hash],
      );
      await connection.query(
        "INSERT INTO outbound_attachments (outbound_id,attachment_id,disposition,part_order) VALUES (?,?,?,?)",
        [outboundId, stored.attachment_id, "attachment", index],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
