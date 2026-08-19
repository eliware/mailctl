/** Adds the common soft-delete marker to outbound messages. */
export async function migrate({ db }) {
  await db.query('ALTER TABLE outbound_messages ADD COLUMN IF NOT EXISTS deleted_at DATETIME(6) NULL AFTER completed_at');
  await db.query('CREATE INDEX IF NOT EXISTS ix_outbound_messages_deleted_created ON outbound_messages (deleted_at, created_at)');
  return { name: 'outbound soft delete', changed: true };
}
