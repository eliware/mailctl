/**
 * Advances the persisted schema marker for the 1.2.0 application release.
 * No schema shape changes are required in this release.
 */
export async function migrate({ db }) {
  await db.query('SELECT 1');
  return { name: 'schema version marker', changed: false };
}
