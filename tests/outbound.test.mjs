import { describe, expect, jest, test } from '@jest/globals';
import { listSent, readSent, send, updateOutbound } from '../src/outbound.mjs';

describe('outbound commands', () => {
  test('lists sent messages', async () => { await expect(listSent({ limit: 5 }, { query: async () => [[]] })).resolves.toBeUndefined(); });
  test('requires an outbound ID for sent-read', async () => { await expect(readSent([], {}, {})).rejects.toThrow('outbound ID'); });
  test('previews retry without mutation', async () => { await expect(updateOutbound(['out-1'], 'retry', { 'dry-run': true, json: true }, {})).resolves.toBeUndefined(); });
  test('rejects sends from unmanaged domains', async () => {
    const db = { query: jest.fn().mockResolvedValue([[]]) };
    await expect(send({ sender: 'agent@example.test', recipient: ['user@example.test'] }, db))
      .rejects.toThrow('sender domain is not managed');
  });
});
