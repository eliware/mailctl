import { runMigrations } from './migrations.mjs';
import { dbConnection } from './runtime.mjs';

const db = await dbConnection();
try {
  const result = await runMigrations({
    pool: db,
    confirm: process.env.MIGRATE_CONFIRM === 'apply',
  });
  console.log(JSON.stringify(result));
} finally {
  await db.end();
}
