import { describe, expect, it } from '@jest/globals';
import { applyMigration, migrationTargetVersion, mysqlEnvironment, readMigration, runMigrations, splitMigration } from '../src/migrations.mjs';

const poolFor = (names = []) => ({ async query(sql) {
  if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]];
  if (sql.startsWith('SELECT name FROM schema_migrations')) return [[...names].map((name) => ({ name }))];
  return [[]];
} });

describe('package-locked migrations', () => {
  it('splits SQL comments and reads ESM migrations', async () => {
    expect(splitMigration('-- comment\nSELECT 1;\n\nSELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
    await expect(readMigration('1.2.0-schema-version-marker.mjs')).resolves.toContain('export async function migrate');
  });
  it('parses MySQL connection URLs', () => {
    expect(mysqlEnvironment('mysql://mail%20user:secret%21@db.example.test:3307/mail%20db')).toEqual({ MYSQL_HOST: 'db.example.test', MYSQL_PORT: '3307', MYSQL_USER: 'mail user', MYSQL_PASSWORD: 'secret!', MYSQL_DATABASE: 'mail db' });
  });
  it('requires confirmation and a database', async () => {
    await expect(runMigrations({ confirm: false })).rejects.toThrow('MIGRATE_CONFIRM=apply');
    await expect(runMigrations({ confirm: 'apply' })).rejects.toThrow('MYSQL_URL is required');
  });
  it('defers future migrations without importing them', async () => {
    const pool = poolFor();
    await expect(runMigrations({ pool, confirm: 'apply', version: '1.1.0', names: ['1.2.0-schema-version-marker.mjs'] })).resolves.toMatchObject({ deferred: [{ name: '1.2.0-schema-version-marker.mjs', target: '1.2.0' }] });
    expect(migrationTargetVersion('2.0.0-future.mjs', '1.0.0')).toBe('2.0.0');
  });
  it('uses the running version for unversioned names and accepts boolean confirmation', async () => {
    expect(migrationTargetVersion('unversioned.mjs', '0.1.8')).toBe('0.1.8');
    await expect(runMigrations({ pool: poolFor(), confirm: true, version: '1.0.0', names: [] })).resolves.toMatchObject({ applied: [], deferred: [] });
  });
  it('executes migration modules', async () => {
    const queries = []; const pool = { async query(sql) { queries.push(sql); } };
    await expect(applyMigration(pool, '1.2.0-schema-version-marker.mjs')).resolves.toBe('1.2.0-schema-version-marker.mjs');
    expect(queries).toEqual(['SELECT 1']);
    queries.length = 0;
    await applyMigration(pool, '0.1.0-initial-schema.mjs');
    expect(queries.length).toBe(16); expect(queries[0]).toMatch(/^CREATE TABLE IF NOT EXISTS domains/);
    queries.length = 0;
    await applyMigration(pool, '0.1.8-schema-consolidation.mjs');
    expect(queries.length).toBe(18); expect(queries.some((sql) => sql.startsWith('CREATE FULLTEXT INDEX'))).toBe(true);
  });
  it('skips legacy and already-recorded migrations', async () => {
    const legacy = await runMigrations({ pool: poolFor(['001_initial.sql']), confirm: 'apply', version: '0.1.8', names: ['0.1.0-initial-schema.mjs'] });
    expect(legacy.applied).toEqual([]);
    const current = await runMigrations({ pool: poolFor(['1.2.0-schema-version-marker.mjs']), confirm: 'apply', version: '1.2.0', names: ['1.2.0-schema-version-marker.mjs'] });
    expect(current.applied).toEqual([]);
  });
  it('records applied migrations and preserves the marker when idle', async () => {
    const queries = []; const pool = { async query(sql) { queries.push(sql); if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]]; if (sql.startsWith('SELECT name FROM schema_migrations')) return [[]]; return [[]]; } };
    const result = await runMigrations({ pool, confirm: 'apply', version: '1.2.0', names: ['1.2.0-schema-version-marker.mjs'] });
    expect(result.applied).toEqual(['1.2.0-schema-version-marker.mjs']); expect(queries.some((sql) => sql.startsWith('INSERT INTO schema_migrations'))).toBe(true); expect(queries.some((sql) => sql.includes('last_migration = VALUES(last_migration)'))).toBe(true);
    const markerWrites = []; const idle = { async query(sql, values) { if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]]; if (sql.startsWith('SELECT name FROM schema_migrations')) return [[]]; if (sql.startsWith('INSERT INTO schema_version')) markerWrites.push(values); return [[]]; } };
    await runMigrations({ pool: idle, confirm: 'apply', version: '0.1.8', names: [] }); expect(markerWrites).toHaveLength(0);
  });
  it('releases locks on acquisition and migration failures', async () => {
    await expect(runMigrations({ pool: { async query(sql) { if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 0 }]]; } }, confirm: 'apply', names: [] })).rejects.toThrow('timed out acquiring schema migration lock');
    const queries = []; const pool = { async query(sql) { queries.push(sql); if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]]; if (sql.startsWith('SELECT name FROM schema_migrations')) return [[]]; return [[]]; } };
    await expect(runMigrations({ pool, confirm: 'apply', version: '0.1.8', names: ['missing-migration.mjs'] })).rejects.toThrow(); expect(queries.some((sql) => sql.startsWith('SELECT RELEASE_LOCK'))).toBe(true);
  });
  it('rejects modules without migrate()', async () => {
    await expect(runMigrations({ pool: poolFor(), confirm: 'apply', version: '0.1.8', names: ['../src/outbound.mjs'] })).rejects.toThrow('does not export migrate()');
  });
});
