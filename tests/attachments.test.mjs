import { describe, expect, test } from '@jest/globals';
import { attachmentList } from '../src/attachments.mjs';

describe('attachment commands', () => {
  test('lists attachment metadata', async () => {
    const db = { query: async () => [[]] };
    await expect(attachmentList('message-1', {}, db)).resolves.toBeUndefined();
  });
});
