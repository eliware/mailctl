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
});
