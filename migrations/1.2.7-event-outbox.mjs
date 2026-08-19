/** Adds durable publication state for database-backed mail events. */
export async function migrate({ db }) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS event_outbox (event_id VARCHAR(20) NOT NULL, event_type VARCHAR(128) NOT NULL, payload_json LONGTEXT NOT NULL, occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), published_at DATETIME(6) NULL, attempts INT UNSIGNED NOT NULL DEFAULT 0, next_attempt_at DATETIME(6) NULL, last_error TEXT NULL, PRIMARY KEY (event_id), KEY ix_event_outbox_pending (published_at, next_attempt_at, occurred_at), KEY ix_event_outbox_type_occurred (event_type, occurred_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  );
  return { name: "event outbox", changed: true };
}
