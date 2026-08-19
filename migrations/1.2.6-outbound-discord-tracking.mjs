/** Stores the Discord representation and deletion provenance for outbound mail. */
export async function migrate({ db }) {
  await db.query(
    "ALTER TABLE outbound_messages ADD COLUMN IF NOT EXISTS discord_message_id VARCHAR(32) NULL AFTER deleted_at",
  );
  await db.query(
    "ALTER TABLE outbound_messages ADD COLUMN IF NOT EXISTS discord_channel_id VARCHAR(32) NULL AFTER discord_message_id",
  );
  await db.query(
    "ALTER TABLE outbound_messages ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255) NULL AFTER discord_channel_id",
  );
  await db.query(
    "ALTER TABLE outbound_messages ADD COLUMN IF NOT EXISTS deleted_source VARCHAR(64) NULL AFTER deleted_by",
  );
  await db.query(
    "CREATE INDEX IF NOT EXISTS ix_outbound_messages_discord_message ON outbound_messages (discord_message_id)",
  );
  return { name: "outbound Discord tracking", changed: true };
}
