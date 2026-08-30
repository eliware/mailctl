import { describe, expect, jest, test } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listSent, readSent, outboundStatus, send, updateOutbound } from '../src/outbound.mjs';

describe('outbound commands', () => {
  test('lists sent messages', async () => { await expect(listSent({ limit: 5 }, { query: async () => [[]] })).resolves.toBeUndefined(); });
  test('lists sent messages with filters', async () => {
    const query = jest.fn().mockResolvedValue([[]]);
    await expect(listSent({ limit: 5, from: 'sender', to: 'recipient', subject: 'subject', status: 'queued', after: '2026-01-01', before: '2026-02-01', json: true }, { query })).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });
  test('requires an outbound ID for sent-read', async () => { await expect(readSent([], {}, {})).rejects.toThrow('outbound ID'); });
  test('reads a sent message with deliveries and attempts', async () => {
    let call = 0;
    const db = { query: async () => {
      call += 1;
      if (call === 1) return [[{ outbound_id: 'out-1', headers_json: '{bad', body_text: 'body' }]];
      if (call === 2) return [[{ recipient: 'user@example.test' }]];
      if (call === 3) return [[{ attachment_id: 'a1' }]];
      return [[{ attempt_number: 1 }]];
    } };
    await expect(readSent(['out-1'], { json: true }, db)).resolves.toBeUndefined();
  });
  test('reports stale sending deliveries and latest attempts', async () => {
    const db = { query: jest.fn()
      .mockResolvedValueOnce([[{ outbound_id: 'out-1', status: 'queued', created_at: new Date() }]])
      .mockResolvedValueOnce([[{ delivery_id: 'del-1', status: 'sending', recipient: 'user@example.test' }]])
      .mockResolvedValueOnce([[{ delivery_id: 'del-1', attempt_number: 1, status: 'sending', started_at: new Date(Date.now() - 600_000) }]]) };
    await expect(outboundStatus(['out-1'], { json: true }, db)).resolves.toBeUndefined();
  });
  test('requires an outbound ID for status', async () => { await expect(outboundStatus([], {}, {})).rejects.toThrow('outbound ID'); });
  test('previews retry without mutation', async () => { await expect(updateOutbound(['out-1'], 'retry', { 'dry-run': true, json: true }, {})).resolves.toBeUndefined(); });
  test('rejects sends from unmanaged domains', async () => {
    const db = { query: jest.fn().mockResolvedValue([[]]) };
    await expect(send({ sender: 'agent@example.test', recipient: ['user@example.test'] }, db))
      .rejects.toThrow('sender domain is not managed');
  });
  test('previews a managed send with an attachment', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mailctl-outbound-'));
    try {
      const attachment = join(directory, 'attachment.txt');
      await writeFile(attachment, 'attachment body');
      const db = { query: jest.fn().mockResolvedValue([[{ domain_id: 'domain-1' }]]) };
      await expect(send({ sender: 'agent@example.test', recipient: ['user@example.test'], cc: 'copy@example.test', bcc: ['blind@example.test'], subject: 'Subject', text: 'Body', html: '<p>Body</p>', attachment, 'dry-run': true, json: true }, db)).resolves.toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  test('cancels outbound work transactionally', async () => {
    const calls = [];
    const connection = { beginTransaction: async () => calls.push('begin'), query: async () => calls.push('query'), commit: async () => calls.push('commit'), rollback: async () => calls.push('rollback'), release: () => calls.push('release') };
    await expect(updateOutbound(['out-1'], 'cancel', { yes: true, json: true }, { getConnection: async () => connection })).resolves.toBeUndefined();
    expect(calls).toEqual(['begin', 'query', 'query', 'commit', 'release']);
  });
});
