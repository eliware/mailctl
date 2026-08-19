import { output } from './output.mjs';
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
      await connection.query('UPDATE messages SET deleted_at=CURRENT_TIMESTAMP(6) WHERE message_id=? AND deleted_at IS NULL', [id]);
      await connection.query("UPDATE outbound_messages SET deleted_at=CURRENT_TIMESTAMP(6), status=CASE WHEN status IN ('queued','retryable','sending') THEN 'canceled' ELSE status END WHERE outbound_id=? AND deleted_at IS NULL", [id]);
    }
    await connection.commit();
    output({ deleted: ids }, options);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

export const deleteMessages = deleteMail;
