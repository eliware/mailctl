import { dateFilter, limitValue } from './args.mjs';
import { output } from './output.mjs';

export async function listMessages(options, db) {
  const where = ['m.deleted_at IS NULL']; const params = [];
  if (options.to) { where.push('EXISTS (SELECT 1 FROM message_recipients x WHERE x.message_id=m.message_id AND x.address LIKE ?)'); params.push(`%${options.to}%`); }
  if (options.from) { where.push('m.envelope_sender LIKE ?'); params.push(`%${options.from}%`); }
  if (options.subject) { where.push('m.subject LIKE ?'); params.push(`%${options.subject}%`); }
  dateFilter(options, 'm.received_at', where, params);
  const [rows] = await db.query(`SELECT m.message_id, m.envelope_sender, m.subject, m.received_at, m.body_text, GROUP_CONCAT(DISTINCT r.address ORDER BY r.address SEPARATOR ', ') recipients FROM messages m LEFT JOIN message_recipients r ON r.message_id=m.message_id WHERE ${where.join(' AND ')} GROUP BY m.message_id ORDER BY m.received_at DESC LIMIT ?`, [...params, limitValue(options.limit)]);
  output(rows.map(({ body_text, ...row }) => ({ ...row, preview: String(body_text ?? '').split(/\r?\n/, 1)[0].slice(0, 100) })), options);
}

export async function readMessages(ids, options, db, includeBody = true) {
  const result = [];
  for (const id of ids) {
    const [[message]] = await db.query('SELECT * FROM messages WHERE message_id=? AND deleted_at IS NULL', [id]);
    if (!message) throw new Error(`message not found: ${id}`);
    const [recipients] = await db.query('SELECT address, recipient_type FROM message_recipients WHERE message_id=? ORDER BY recipient_type,address', [id]);
    const [attachments] = await db.query('SELECT a.*, ma.content_id, ma.disposition, ma.part_order FROM message_attachments ma JOIN attachments a ON a.attachment_id=ma.attachment_id WHERE ma.message_id=? ORDER BY ma.part_order', [id]);
    let headers = {}; try { headers = JSON.parse(message.headers_json || '{}'); } catch {}
    const record = { message_id: message.message_id, envelope_sender: message.envelope_sender, subject: message.subject, received_at: message.received_at, headers, recipients, attachments };
    if (includeBody) Object.assign(record, { body_text: message.body_text, body_html: message.body_html, body_html_original: message.body_html_original });
    result.push(record);
  }
  output(result.length === 1 ? result[0] : result, options);
}

export async function searchMail(query, options, db) {
  const needle = `%${query}%`; const limit = limitValue(options.limit);
  const [inbound] = await db.query(`SELECT 'inbound' kind, m.message_id id, m.envelope_sender sender, m.subject, m.received_at timestamp, MATCH(m.subject, m.body_text, m.body_html) AGAINST (? IN NATURAL LANGUAGE MODE) relevance FROM messages m WHERE m.deleted_at IS NULL AND (MATCH(m.subject, m.body_text, m.body_html) AGAINST (? IN BOOLEAN MODE) OR m.envelope_sender LIKE ? OR m.subject LIKE ? OR m.headers_json LIKE ?)`, [query, query, needle, needle, needle]);
  const [outbound] = await db.query(`SELECT 'outbound' kind, o.outbound_id id, o.from_address sender, o.subject, o.created_at timestamp, MATCH(o.subject, o.body_text, o.body_html) AGAINST (? IN NATURAL LANGUAGE MODE) relevance FROM outbound_messages o WHERE (MATCH(o.subject, o.body_text, o.body_html) AGAINST (? IN BOOLEAN MODE) OR o.from_address LIKE ? OR o.subject LIKE ? OR o.headers_json LIKE ? OR EXISTS (SELECT 1 FROM outbound_deliveries d WHERE d.outbound_id=o.outbound_id AND d.recipient LIKE ?))`, [query, query, needle, needle, needle, needle, needle]);
  output([...inbound, ...outbound].sort((a, b) => Number(b.relevance) - Number(a.relevance) || new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit), options);
}

export async function thread(id, options, db) {
  const [[message]] = await db.query('SELECT headers_json FROM messages WHERE message_id=?', [id]);
  if (!message) throw new Error(`message not found: ${id}`);
  let headers = {}; try { headers = JSON.parse(message.headers_json || '{}'); } catch {}
  const refs = [headers['Message-ID'], headers['In-Reply-To'], headers.References].filter(Boolean).join(' ');
  if (!refs) return output([], options);
  const [inbound] = await db.query("SELECT message_id id, 'inbound' kind, envelope_sender sender, subject, received_at timestamp FROM messages WHERE headers_json LIKE ? ORDER BY received_at", [`%${refs}%`]);
  const [outbound] = await db.query("SELECT outbound_id id, 'outbound' kind, from_address sender, subject, created_at timestamp FROM outbound_messages WHERE headers_json LIKE ? ORDER BY created_at", [`%${refs}%`]);
  output([...inbound, ...outbound], options);
}
