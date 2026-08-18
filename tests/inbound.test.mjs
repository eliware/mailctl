import { describe, expect, test } from '@jest/globals';
import { listMessages, readMessages, searchMail, thread } from '../src/inbound.mjs';

const db = { async query(sql) {
  if (sql.startsWith('SELECT m.message_id')) return [[{ message_id: '1', body_text: 'hello' }]];
  if (sql.includes('FROM messages WHERE message_id=?')) return [[{ headers_json: '{}' }]];
  if (sql.includes('MATCH(')) return [[], []];
  return [[]];
} };

describe('inbound commands', () => {
  test('lists messages', async () => { await expect(listMessages({ limit: 5 }, db)).resolves.toBeUndefined(); });
  test('searches without results', async () => { await expect(searchMail('hello', {}, db)).resolves.toBeUndefined(); });
  test('rejects missing thread', async () => { await expect(thread('missing', {}, { query: async () => [[]] })).rejects.toThrow('message not found'); });
  test('reads a message', async () => {
    const readDb = { async query(sql) {
      if (sql.includes('SELECT * FROM messages')) return [[{ message_id: '1', headers_json: '{}', body_text: 'x' }]];
      return [[]];
    } };
    await expect(readMessages(['1'], {}, readDb)).resolves.toBeUndefined();
  });
});
