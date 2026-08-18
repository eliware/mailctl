import { describe, expect, test } from '@jest/globals';
import { deleteMessages } from '../src/delete.mjs';

describe('delete command', () => {
  test('previews deletion without a database write', async () => {
    const db = { query: async () => [[]] };
    await expect(deleteMessages(['message-1'], { 'dry-run': true, json: true }, db)).resolves.toBeUndefined();
  });
  test('requires confirmation', async () => {
    await expect(deleteMessages(['message-1'], {}, {})).rejects.toThrow('refusing to delete');
  });
  test('supports query dry-runs', async () => {
    const db = { query: async () => [[{ message_id: '1' }]] };
    await expect(deleteMessages([], { query: 'subject', 'dry-run': true, json: true }, db)).resolves.toBeUndefined();
  });
  test('deletes records transactionally', async () => {
    const calls = [];
    const connection = { beginTransaction: async () => calls.push('begin'), query: async (...args) => calls.push(args), commit: async () => calls.push('commit'), rollback: async () => calls.push('rollback'), release: () => calls.push('release') };
    const db = { getConnection: async () => connection };
    await expect(deleteMessages(['1', '2'], { yes: true, json: true }, db)).resolves.toBeUndefined();
    expect(calls).toContain('commit');
    expect(calls).toContain('release');
  });
  test('rolls back when deletion fails', async () => {
    const calls = [];
    const connection = { beginTransaction: async () => calls.push('begin'), query: async () => { throw new Error('db failed'); }, commit: async () => {}, rollback: async () => calls.push('rollback'), release: () => calls.push('release') };
    await expect(deleteMessages(['1'], { yes: true }, { getConnection: async () => connection })).rejects.toThrow('db failed');
    expect(calls).toEqual(['begin', 'rollback', 'release']);
  });
});
