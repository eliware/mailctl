export const legacyNames = ['002_schema_0_1_8.sql'];

export async function migrate({ db }) {
  for (const statement of statements) await db.query(statement);
  return { name: 'schema consolidation' };
}

const statements = [
  "CREATE TABLE IF NOT EXISTS oidc_states (\n    state_hash CHAR(64) NOT NULL,\n    nonce VARCHAR(255) NOT NULL,\n    expires_at DATETIME(6) NOT NULL,\n    PRIMARY KEY (state_hash),\n    KEY ix_oidc_states_expiry (expires_at)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS web_sessions (\n    session_hash CHAR(64) NOT NULL,\n    user_id VARCHAR(255) NOT NULL,\n    csrf_token VARCHAR(255) NOT NULL,\n    expires_at DATETIME(6) NOT NULL,\n    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),\n    PRIMARY KEY (session_hash),\n    KEY ix_web_sessions_expiry (expires_at)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "ALTER TABLE messages\n    ADD COLUMN IF NOT EXISTS discord_message_id VARCHAR(32) NULL,\n    ADD COLUMN IF NOT EXISTS direction VARCHAR(16) NOT NULL DEFAULT 'inbound' AFTER envelope_sender,\n    ADD COLUMN IF NOT EXISTS is_read TINYINT(1) NOT NULL DEFAULT 0 AFTER processed_at,\n    ADD COLUMN IF NOT EXISTS is_starred TINYINT(1) NOT NULL DEFAULT 0 AFTER is_read,\n    ADD COLUMN IF NOT EXISTS archived_at DATETIME(6) NULL AFTER is_starred",
  "CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_discord_message_id ON messages (discord_message_id)",
  "CREATE INDEX IF NOT EXISTS ix_messages_direction_date ON messages (direction, received_at)",
  "CREATE INDEX IF NOT EXISTS ix_messages_starred ON messages (is_starred, received_at)",
  "CREATE INDEX IF NOT EXISTS ix_messages_deleted_received ON messages (deleted_at, received_at)",
  "CREATE INDEX IF NOT EXISTS ix_messages_sender_received ON messages (envelope_sender, received_at)",
  "CREATE FULLTEXT INDEX IF NOT EXISTS ft_messages_content ON messages (subject, body_text, body_html)",
  "CREATE FULLTEXT INDEX IF NOT EXISTS ix_messages_fulltext ON messages (subject, body_text, envelope_sender)",
  "CREATE INDEX IF NOT EXISTS ix_message_recipients_address_message ON message_recipients (address, message_id)",
  "CREATE INDEX IF NOT EXISTS ix_message_recipients_message_type ON message_recipients (message_id, recipient_type, address)",
  "CREATE INDEX IF NOT EXISTS ix_message_attachments_message_order ON message_attachments (message_id, part_order)",
  "CREATE INDEX IF NOT EXISTS ix_outbound_messages_sender_created ON outbound_messages (from_address, created_at)",
  "CREATE FULLTEXT INDEX IF NOT EXISTS ft_outbound_messages_content ON outbound_messages (subject, body_text, body_html)",
  "CREATE INDEX IF NOT EXISTS ix_outbound_deliveries_recipient_status ON outbound_deliveries (recipient, status, outbound_id)",
  "CREATE INDEX IF NOT EXISTS ix_outbound_deliveries_outbound_status ON outbound_deliveries (outbound_id, status, recipient)",
  "CREATE INDEX IF NOT EXISTS ix_outbound_attempts_delivery_started ON outbound_attempts (delivery_id, started_at)"
];
