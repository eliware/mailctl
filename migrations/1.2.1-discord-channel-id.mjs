/**
 * Stores the Discord channel alongside the message ID so integrations can
 * address a Discord message for later updates or deletion.
 */
export async function migrate({ db }) {
  await db.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS discord_channel_id VARCHAR(32) NULL AFTER discord_message_id');
  return { name: 'discord channel id', changed: true };
}
