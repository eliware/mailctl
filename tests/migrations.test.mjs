import { describe, expect, it } from '@jest/globals';
import { applyMigration, migrationTargetVersion, runMigrations } from '../src/migrations.mjs';

describe('mailctl migrations', () => {
  it('requires explicit confirmation and a database', async () => {
    await expect(runMigrations({ confirm: false })).rejects.toThrow('MIGRATE_CONFIRM=apply');
    await expect(runMigrations({ confirm: 'apply' })).rejects.toThrow('MYSQL_URL is required');
  });

  it('defers migrations newer than the running package version', async () => {
    const pool = { async query(sql) { if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]]; if (sql.startsWith('SELECT name FROM schema_migrations')) return [[]]; return [[]]; } };
    await expect(runMigrations({ pool, confirm: 'apply', version: '1.2.3', names: ['2.0.0-future.mjs'] })).resolves.toMatchObject({ deferred: [{ name: '2.0.0-future.mjs', target: '2.0.0' }] });
    expect(migrationTargetVersion('1.2.5-change.mjs', '1.2.3')).toBe('1.2.5');
  });

  it('executes a migration module', async () => {
    const queries = [];
    const pool = { async query(sql) { queries.push(sql); } };
    await expect(applyMigration(pool, '1.2.5-outbound-soft-delete.mjs')).resolves.toBe('1.2.5-outbound-soft-delete.mjs');
    expect(queries.some((sql) => sql.includes('outbound_messages'))).toBe(true);
  });
});
