import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDb, closeDb } from '@eliware/mysql';

const migrationsPath = new URL('../migrations/', import.meta.url);
const packagePath = new URL('../package.json', import.meta.url);
const LOCK_NAME = 'eliware-mail-schema-migration';

export async function readMigration(name) { return readFile(new URL(name, migrationsPath), 'utf8'); }
export function splitMigration(sql) { return sql.replace(/^\s*--.*$/gm, '').split(';').map((statement) => statement.trim()).filter(Boolean); }
export function compareVersions(left, right) { const a = String(left).replace(/^v/, '').split('.').map(Number); const b = String(right).replace(/^v/, '').split('.').map(Number); for (let index = 0; index < 3; index += 1) { if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0); } return 0; }
async function packageVersion() { return JSON.parse(await readFile(packagePath, 'utf8')).version; }
export function migrationTargetVersion(name, currentVersion) { return name.match(/^(\d+\.\d+\.\d+)-/)?.[1] ?? currentVersion; }
async function loadMigration(name) {
  const module = await import(new URL(name, migrationsPath));
  if (typeof module.migrate !== 'function') throw new Error(`migration ${name} does not export migrate()`);
  return module;
}
export async function applyMigration(pool, name) { const migration = await loadMigration(name); await migration.migrate({ db: pool }); return name; }
async function acquireLock(pool) { const [[row]] = await pool.query('SELECT GET_LOCK(?, 30) AS acquired', [LOCK_NAME]); if (Number(row?.acquired) !== 1) throw new Error('timed out acquiring schema migration lock'); }
async function releaseLock(pool) { await pool.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => {}); }

export async function runMigrations({ mysqlUrl, confirm = false, pool = null, names = null, version = null } = {}) {
  if (confirm !== true && confirm !== 'apply') throw new Error('migration writes require MIGRATE_CONFIRM=apply');
  if (!mysqlUrl && !pool) throw new Error('MYSQL_URL is required');
  const ownedPool = pool ?? await createDb({ env: mysqlEnvironment(mysqlUrl) }); let locked = false;
  try {
    await acquireLock(ownedPool); locked = true; const currentVersion = version ?? await packageVersion();
    await ownedPool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) NOT NULL, package_version VARCHAR(32) NOT NULL, applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    await ownedPool.query("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS package_version VARCHAR(32) NOT NULL DEFAULT '0.0.0'");
    await ownedPool.query('CREATE TABLE IF NOT EXISTS schema_version (singleton_id TINYINT UNSIGNED NOT NULL, package_version VARCHAR(32) NOT NULL, updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), last_migration VARCHAR(255) NULL, PRIMARY KEY (singleton_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    const [rows] = await ownedPool.query('SELECT name FROM schema_migrations'); const applied = new Set(rows.map(({ name }) => name));
    const migrationNames = names ?? (await readdir(migrationsPath)).filter((name) => /^\d+\.\d+\.\d+-.*\.mjs$/.test(name)).sort(); const eligible = []; const deferred = [];
    for (const name of migrationNames) { const target = migrationTargetVersion(name, currentVersion); if (compareVersions(target, currentVersion) > 0) { deferred.push({ name, target }); continue; } const migration = await loadMigration(name); const alreadyApplied = applied.has(name) || (migration.legacyNames ?? []).some((legacyName) => applied.has(legacyName)); if (alreadyApplied) continue; eligible.push({ name, target }); }
    for (const { name, target } of eligible) {
      await applyMigration(ownedPool, name);
      await ownedPool.query('INSERT INTO schema_migrations (name, package_version) VALUES (?, ?)', [name, target]);
      await ownedPool.query('INSERT INTO schema_version (singleton_id, package_version, last_migration) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE package_version = VALUES(package_version), last_migration = VALUES(last_migration)', [target, name]);
    }
    return { packageVersion: currentVersion, applied: eligible.map(({ name }) => name), deferred };
  } finally { if (locked) await releaseLock(ownedPool); if (!pool) await closeDb(ownedPool); }
}

export function mysqlEnvironment(connectionUrl) { const url = new URL(connectionUrl); return { MYSQL_HOST: url.hostname, MYSQL_PORT: url.port || '3306', MYSQL_USER: decodeURIComponent(url.username), MYSQL_PASSWORD: decodeURIComponent(url.password), MYSQL_DATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')) }; }
export const migrationDirectory = fileURLToPath(migrationsPath);
