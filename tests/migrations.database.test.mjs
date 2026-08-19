import { describe, expect, it, jest } from '@jest/globals';

const closeDb = jest.fn();
const createDb = jest.fn(async () => ({
  async query(sql) {
    if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.startsWith('SELECT name FROM schema_migrations')) return [[]];
    return [[]];
  },
}));

jest.unstable_mockModule('@eliware/mysql', () => ({ createDb, closeDb }));
const { runMigrations } = await import('../src/migrations.mjs');

describe('database migration lifecycle', () => {
  it('creates and closes an owned database pool and discovers migrations', async () => {
    await expect(runMigrations({ mysqlUrl: 'mysql://user:pass@db.example.test/mail', confirm: 'apply' })).resolves.toMatchObject({ packageVersion: '1.2.7' });
    expect(createDb).toHaveBeenCalledWith({ env: expect.objectContaining({ MYSQL_HOST: 'db.example.test', MYSQL_PORT: '3306' }) });
    expect(closeDb).toHaveBeenCalled();
  });
});
