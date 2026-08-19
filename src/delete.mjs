import { output } from './output.mjs';
import { generate } from '@eliware/snowflake';
export async function deleteMail(ids, options, db) {
  if (options.query) {
    const needle = `%${options.query}%`;
    const [inbound] = await db.query('SELECT message_id AS id FROM messages WHERE deleted_at IS NULL AND (envelope_sender LIKE ? OR subject LIKE ? OR body_text LIKE ? OR headers_json LIKE ?)', [needle, needle, needle, needle]);
    const [outbound] = await db.query('SELECT outbound_id AS id FROM outbound_messages WHERE deleted_at IS NULL AND (from_address LIKE ? OR subject LIKE ? OR body_text LIKE ? OR headers_json LIKE ?)', [needle, needle, needle, needle]);
    ids = [...inbound, ...outbound].map(({ id }) => id);
  }
  if (!ids.length) throw new Error('delete requires message IDs or outbound IDs or --query');
  if (!options.yes && !options['dry-run']) throw new Error('refusing to delete without --yes');
  if (options['dry-run']) return output({ dryRun: true, action: 'delete', ids }, options);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    for (const id of ids) {
      const [[inbound]] = await connection.query('SELECT message_id, discord_message_id, discord_channel_id FROM messages WHERE message_id=? AND deleted_at IS NULL', [id]);
      const [[outbound]] = await connection.query('SELECT outbound_id, discord_message_id, discord_channel_id FROM outbound_messages WHERE outbound_id=? AND deleted_at IS NULL', [id]);
      if (inbound) {
        await connection.query('UPDATE messages SET deleted_at=CURRENT_TIMESTAMP(6) WHERE message_id=? AND deleted_at IS NULL', [id]);
        if (inbound.discord_message_id) await queueEvent(connection, 'message.deleted', { message_id: id, discord_message_id: inbound.discord_message_id, discord_channel_id: inbound.discord_channel_id });
      }
      if (outbound) {
        await connection.query("UPDATE outbound_messages SET deleted_at=CURRENT_TIMESTAMP(6), status=CASE WHEN status IN ('queued','retryable','sending') THEN 'canceled' ELSE status END, deleted_source='mailctl' WHERE outbound_id=? AND deleted_at IS NULL", [id]);
        if (outbound.discord_message_id) await queueEvent(connection, 'outbound.deleted', { outbound_id: id, discord_message_id: outbound.discord_message_id, discord_channel_id: outbound.discord_channel_id, deleted_source: 'mailctl' });
      }
    }
    await connection.commit();
    output({ deleted: ids }, options);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

async function queueEvent(connection, eventType, payload) {
  await connection.query('INSERT INTO event_outbox (event_id, event_type, payload_json) VALUES (?, ?, ?)', [generate(), eventType, JSON.stringify(payload)]);
}

export const deleteMessages = deleteMail;
