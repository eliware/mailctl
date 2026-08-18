import { describe, expect, test } from '@jest/globals';
import { attachmentList, saveAttachments, saveSentAttachments } from '../src/attachments.mjs';

describe('attachment commands', () => {
  test('lists attachment metadata', async () => {
    const db = { query: async () => [[]] };
    await expect(attachmentList('message-1', {}, db)).resolves.toBeUndefined();
  });
  test('handles empty inbound and outbound attachment exports', async () => {
    const db = { query: async () => [[]] };
    await expect(saveAttachments('message-1', '/tmp/mailctl-inbound-empty', {}, db)).resolves.toBeUndefined();
    await expect(saveSentAttachments('outbound-1', '/tmp/mailctl-outbound-empty', {}, db)).resolves.toBeUndefined();
  });
});
