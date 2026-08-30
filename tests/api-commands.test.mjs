import { describe, expect, jest, test } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const apiRequest = jest.fn();
const output = jest.fn();
jest.unstable_mockModule('../src/api.mjs', () => ({ apiRequest }));
jest.unstable_mockModule('../src/output.mjs', () => ({ output }));
const { runApiCommand } = await import('../src/api-commands.mjs');

describe('API command routing', () => {
  test('returns no result for an unknown command', async () => {
    await expect(runApiCommand('unknown', [], {})).resolves.toBeUndefined();
  });
  beforeEach(() => {
    process.exitCode = undefined;
    apiRequest.mockReset();
    output.mockReset();
    apiRequest.mockResolvedValue([]);
  });

  test('routes mailbox and sent reads with filters', async () => {
    const options = { limit: 5, before: '2026-02-01', after: '2026-01-01', search: 'term', folder: 'inbox', domain: 'example.test', address: 'user@example.test', from: 'sender@example.test', to: 'user@example.test', json: true };
    for (const command of ['list', 'sent']) await runApiCommand(command, ['id'], options);
    await runApiCommand('headers', ['id'], options);
    await runApiCommand('read', ['id'], options);
    await runApiCommand('thread', ['id'], options);
    await runApiCommand('sent-read', ['out'], options);
    await runApiCommand('outbound-status', ['out'], options);
    expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining('/api/messages'));
    expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining('/api/sent'));
    expect(output).toHaveBeenCalled();
    apiRequest.mockResolvedValue({ id: 'result' });
    await runApiCommand('read', ['m-1', 'm-2'], {});
    expect(apiRequest).toHaveBeenCalledWith('/api/messages/m-1');
    expect(apiRequest).toHaveBeenCalledWith('/api/messages/m-2');
    expect(output).toHaveBeenLastCalledWith([{ id: 'result' }, { id: 'result' }], {});
  });

  test('routes search, health, and domains', async () => {
    apiRequest.mockResolvedValueOnce({ results: [{ id: 'm-1', kind: 'inbound' }] });
    await runApiCommand('search', ['hello world'], {});
    apiRequest.mockResolvedValueOnce({ state: { status: 'running' }, readiness: { ready: true } });
    await runApiCommand('health', [], {});
    expect(process.exitCode).toBe(0);
    apiRequest.mockResolvedValueOnce([{ name: 'example.test' }]);
    await runApiCommand('domains', [], {});
    expect(apiRequest).toHaveBeenNthCalledWith(1, '/api/search?q=hello%20world');
    expect(output).toHaveBeenCalledWith(expect.objectContaining({ healthy: true }), {});
  });

  test('marks unhealthy API status with exit code 1', async () => {
    apiRequest.mockResolvedValueOnce({ state: { status: 'degraded' }, readiness: { ready: false } });
    await runApiCommand('health', [], { json: true });
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  test('uses readiness as the authoritative health result', async () => {
    apiRequest.mockResolvedValueOnce({ state: { status: 'starting' }, readiness: { ready: true } });
    await runApiCommand('health', [], { json: true });
    expect(process.exitCode).toBe(0);
  });

  test('lists and downloads attachments for inbound and sent messages', async () => {
    apiRequest.mockResolvedValueOnce({ attachments: [{ attachment_id: 'a-1', original_filename: '../file.txt' }] });
    await runApiCommand('attachments', ['m-1'], {});
    const directory = await mkdtemp(join(tmpdir(), 'mailctl-api-attachments-'));
    try {
      apiRequest.mockResolvedValueOnce({ attachments: [{ attachment_id: 'a-1', original_filename: '../file.txt' }] });
      apiRequest.mockResolvedValueOnce({ arrayBuffer: async () => Buffer.from('bytes') });
      await runApiCommand('save-attachments', ['m-1', directory], {});
      expect(await (await import('node:fs/promises')).readFile(join(directory, 'file.txt'), 'utf8')).toBe('bytes');
      apiRequest.mockResolvedValueOnce({ attachments: [] });
      await runApiCommand('save-sent-attachments', ['o-1', directory], {});
      apiRequest.mockResolvedValueOnce({});
      await runApiCommand('attachments', ['m-2'], {});
      apiRequest.mockResolvedValueOnce({});
      await runApiCommand('save-sent-attachments', ['o-2', directory], {});
      apiRequest.mockResolvedValueOnce({ attachments: [{ attachment_id: 'a-2', original_filename: null }] });
      apiRequest.mockResolvedValueOnce({ arrayBuffer: async () => Buffer.from('bytes') });
      await runApiCommand('save-attachments', ['m-2'], { directory });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('deletes explicit inbound IDs and query results', async () => {
    apiRequest.mockResolvedValueOnce({ message_id: 'm-1' });
    await runApiCommand('delete', ['m-1'], { json: true });
    apiRequest.mockResolvedValueOnce({ results: [{ id: 'm-2', kind: 'inbound' }, { id: 'o-1', kind: 'outbound' }] });
    await runApiCommand('delete', [], { query: 'old', json: true });
    expect(apiRequest).toHaveBeenCalledWith('/api/messages/m-1');
    expect(apiRequest).toHaveBeenCalledWith('/api/messages/m-1', { method: 'DELETE' });
    expect(apiRequest).toHaveBeenCalledWith('/api/messages/m-2', { method: 'DELETE' });
    expect(apiRequest).toHaveBeenCalledWith('/api/sent/o-1', { method: 'DELETE' });
    expect(output).toHaveBeenLastCalledWith({ deleted: ['m-2', 'o-1'] }, { query: 'old', json: true });
  });

  test('falls back to outbound deletion when message lookup is 404', async () => {
    const notFound = Object.assign(new Error('missing'), { status: 404 });
    apiRequest.mockRejectedValueOnce(notFound).mockResolvedValueOnce(undefined);
    await runApiCommand('delete', ['out-1'], {});
    expect(apiRequest).toHaveBeenCalledWith('/api/sent/out-1', { method: 'DELETE' });
  });

  test('propagates non-404 message lookup failures', async () => {
    apiRequest.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status: 503 }));
    await expect(runApiCommand('delete', ['id'], {})).rejects.toThrow('unavailable');
  });

  test('previews query deletion without deleting', async () => {
    apiRequest.mockResolvedValueOnce({ results: [{ id: 'm-1', kind: 'inbound' }] });
    await runApiCommand('delete', [], { query: 'old', 'dry-run': true });
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(output).toHaveBeenCalledWith({ dryRun: true, action: 'delete', ids: ['m-1'] }, { query: 'old', 'dry-run': true });
  });

  test('routes retry and cancel operations', async () => {
    apiRequest.mockResolvedValueOnce({ outbound_id: 'out-1', status: 'queued', action: 'retry' });
    await runApiCommand('retry', ['out-1'], { json: true });
    apiRequest.mockResolvedValueOnce({ outbound_id: 'out-1', status: 'canceled', action: 'cancel' });
    await runApiCommand('cancel', ['out-1'], { json: true });
    expect(apiRequest).toHaveBeenNthCalledWith(1, '/api/sent/out-1/retry', { method: 'POST' });
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/api/sent/out-1/cancel', { method: 'POST' });
    apiRequest.mockResolvedValue({ outbound_id: 'out-2', status: 'queued', action: 'retry' });
    await runApiCommand('retry', ['out-1', 'out-2'], {});
    expect(output).toHaveBeenLastCalledWith([
      { outbound_id: 'out-2', status: 'queued', action: 'retry' },
      { outbound_id: 'out-2', status: 'queued', action: 'retry' },
    ], {});
  });

  test('routes JSON and multipart sends and previews dry-run', async () => {
    await runApiCommand('send', [], { sender: 'agent@example.test', recipient: ['user@example.test'], cc: ['copy@example.test'], bcc: ['blind@example.test'], text: 'body', json: true });
    expect(apiRequest).toHaveBeenCalledWith('/api/send', expect.objectContaining({ method: 'POST', body: expect.objectContaining({ from: 'agent@example.test', headers: { Cc: 'copy@example.test', Bcc: 'blind@example.test' } }) }));
    const directory = await mkdtemp(join(tmpdir(), 'mailctl-api-send-'));
    try {
      const file = join(directory, 'attachment.txt');
      await writeFile(file, 'body');
    await runApiCommand('send', [], { sender: 'agent@example.test', recipient: 'user@example.test', cc: 'copy@example.test', bcc: 'blind@example.test', attachment: file });
    expect(apiRequest).toHaveBeenLastCalledWith('/api/send-multipart', expect.objectContaining({ method: 'POST', body: expect.any(FormData) }));
    const multipart = apiRequest.mock.calls.at(-1)[1].body;
    expect(multipart.get('cc')).toBe('copy@example.test');
    expect(multipart.get('bcc')).toBe('blind@example.test');
      await runApiCommand('send', [], { sender: 'agent@example.test', recipient: 'user@example.test', attachment: [file] });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    await runApiCommand('send', [], { sender: 'agent@example.test', recipient: ['user@example.test'], 'dry-run': true });
  });

  test('loads API send bodies from @file and file-path inputs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mailctl-api-body-'));
    try {
      const text = join(directory, 'text.txt');
      const html = join(directory, 'body.html');
      await writeFile(text, 'text from file');
      await writeFile(html, '<p>html from file</p>');
      await runApiCommand('send', [], { sender: 'agent@example.test', recipient: 'user@example.test', text: `@${text}`, html });
      expect(apiRequest).toHaveBeenCalledWith('/api/send', expect.objectContaining({ body: expect.objectContaining({ text: 'text from file', html: '<p>html from file</p>' }) }));
      await runApiCommand('send', [], { sender: 'agent@example.test', recipient: 'user@example.test', text: directory });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('previews retry and cancel without API writes', async () => {
    await runApiCommand('retry', ['out-1', 'out-2'], { 'dry-run': true });
    await runApiCommand('cancel', ['out-1'], { 'dry-run': true });
    expect(apiRequest).not.toHaveBeenCalled();
    expect(output).toHaveBeenLastCalledWith({ dryRun: true, action: 'cancel', outboundIds: ['out-1'] }, { 'dry-run': true });
  });

  test('ignores commands that are not API-routed yet', async () => {
  });
});
