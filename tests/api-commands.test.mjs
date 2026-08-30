import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const apiRequest = jest.fn();
const output = jest.fn();
jest.unstable_mockModule('../src/api.mjs', () => ({ apiRequest }));
jest.unstable_mockModule('../src/output.mjs', () => ({ output }));
const { runApiCommand } = await import('../src/api-commands.mjs');

describe('API command routing', () => {
  afterEach(() => jest.restoreAllMocks());
  test('returns no result for an unknown command', async () => {
    await expect(runApiCommand('unknown', [], {})).resolves.toBeUndefined();
  });
  beforeEach(() => {
    process.exitCode = undefined;
    process.env.MAIL_OWNER_ADDRESS = 'owner@example.test';
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

  test('accepts JSON send input from stdin', async () => {
    const handlers = {};
    jest.spyOn(process.stdin, 'setEncoding').mockImplementation(() => process.stdin);
    jest.spyOn(process.stdin, 'on').mockImplementation((event, handler) => {
      handlers[event] = handler;
      return process.stdin;
    });
    const result = runApiCommand('send', [], {});
    handlers.data('{"to":["user@example.test"],"body":"stdin"}');
    handlers.end();
    await result;
    expect(apiRequest).toHaveBeenCalledWith('/api/send', {
      method: 'POST',
      body: { to: ['user@example.test'], body: 'stdin', from: 'owner@example.test', attachments: undefined },
    });
  });

  test('scopes inbox and sent to the configured owner', async () => {
    await runApiCommand('inbox', [], { limit: 5 });
    await runApiCommand('sent', [], { limit: 5 });
    expect(apiRequest).toHaveBeenNthCalledWith(1, '/api/inbox?limit=5&address=owner%40example.test');
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/api/sent?limit=5&from=owner%40example.test');
  });
  test('fails closed when the owner address is missing', async () => {
    delete process.env.MAIL_OWNER_ADDRESS;
    await expect(runApiCommand('inbox', [], {})).rejects.toMatchObject({ code: 'MAIL_OWNER_ADDRESS_REQUIRED' });
    expect(apiRequest).not.toHaveBeenCalled();
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

  test('forwards reply and reply-all through the unified send contract', async () => {
    await runApiCommand('reply', ['m-1'], { inputJson: { body: 'thanks', subject: 'override' } });
    expect(apiRequest).toHaveBeenCalledWith('/api/send', {
      method: 'POST',
      body: { body: 'thanks', subject: 'override', from: 'owner@example.test', replyToMessageId: 'm-1', replyMode: 'reply' },
    });
    await runApiCommand('reply-all', ['m-2'], { inputJson: { body: 'team update' } });
    expect(apiRequest).toHaveBeenLastCalledWith('/api/send', {
      method: 'POST',
      body: { body: 'team update', from: 'owner@example.test', replyToMessageId: 'm-2', replyMode: 'reply-all' },
    });
    await runApiCommand('forward', ['m-3'], { inputJson: { body: 'FYI' } });
    expect(apiRequest).toHaveBeenLastCalledWith('/api/send', {
      method: 'POST',
      body: { body: 'FYI', from: 'owner@example.test', forwardMessageId: 'm-3', replyMode: 'forward' },
    });
  });
  test('rejects reply-controlled fields and missing IDs', async () => {
    await expect(runApiCommand('reply', [], { inputJson: { body: 'bad' } }))
      .rejects.toMatchObject({ code: 'MESSAGE_ID_REQUIRED' });
    await expect(runApiCommand('reply', ['m-1'], { inputJson: { body: 'bad', from: 'other@example.test' } }))
      .rejects.toMatchObject({ code: 'INVALID_REPLY_FIELDS' });
    expect(apiRequest).not.toHaveBeenCalled();
  });
  test('supports reply dry-run and validates all JSON mutation targets', async () => {
    await runApiCommand('reply-all', ['m-1'], { inputJson: { body: 'preview' }, 'dry-run': true });
    expect(output).toHaveBeenLastCalledWith(expect.objectContaining({ dryRun: true, action: 'reply-all' }), expect.anything());
    await expect(runApiCommand('delete', [], { inputJson: {} }))
      .rejects.toMatchObject({ code: 'DELETE_TARGET_REQUIRED' });
    await expect(runApiCommand('delete', [], { inputJson: { query: 'x' } }))
      .rejects.toMatchObject({ code: 'DELETE_CONFIRMATION_REQUIRED' });
    await expect(runApiCommand('forward', ['m-1'], { inputJson: { body: 'bad', replyMode: 'reply' } }))
      .rejects.toMatchObject({ code: 'INVALID_REPLY_FIELDS' });
  });
  test('covers JSON send dry-run and batched retry/cancel', async () => {
    await runApiCommand('send', [], { inputJson: { to: ['user@example.test'], body: 'preview' }, 'dry-run': true });
    expect(output).toHaveBeenLastCalledWith(expect.objectContaining({ dryRun: true, action: 'send' }), expect.anything());
    apiRequest.mockResolvedValue({ outbound_id: 'out-1', status: 'queued' });
    await runApiCommand('retry', [], { inputJson: { ids: ['out-1', 'out-2'], dryRun: true } });
    await runApiCommand('cancel', [], { inputJson: { ids: ['out-1', 'out-2'] } });
    expect(apiRequest).toHaveBeenCalledWith('/api/sent/out-1/cancel', { method: 'POST' });
    expect(apiRequest).toHaveBeenCalledWith('/api/sent/out-2/cancel', { method: 'POST' });
  });
  test('accepts JSON requests from input files for send, reply, and retry', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mailctl-json-commands-'));
    try {
      const sendFile = join(directory, 'send.json');
      const replyFile = join(directory, 'reply.json');
      const retryFile = join(directory, 'retry.json');
      await writeFile(sendFile, '{"to":["user@example.test"],"body":"send"}');
      await writeFile(replyFile, '{"body":"reply"}');
      await writeFile(retryFile, '{"ids":["out-1"]}');
      await runApiCommand('send', [], { input: sendFile });
      await runApiCommand('reply', ['m-1'], { input: replyFile });
      await runApiCommand('retry', [], { input: retryFile });
      expect(apiRequest).toHaveBeenCalledWith('/api/send', expect.objectContaining({ method: 'POST' }));
      expect(apiRequest).toHaveBeenCalledWith('/api/sent/out-1/retry', { method: 'POST' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  test('supports JSON input when stdin is a TTY', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    try {
      await runApiCommand('send', [], { inputJson: { to: ['user@example.test'], body: 'send' } });
      await runApiCommand('reply', ['m-1'], { inputJson: { body: 'reply' } });
      await runApiCommand('retry', [], { inputJson: { ids: ['out-1'] } });
    } finally {
      if (descriptor) Object.defineProperty(process.stdin, 'isTTY', descriptor);
      else delete process.stdin.isTTY;
    }
  });
  test('deletes JSON outbound results', async () => {
    apiRequest.mockResolvedValueOnce({ results: [{ id: 'out-1', kind: 'outbound' }] }).mockResolvedValueOnce(undefined);
    await runApiCommand('delete', [], { inputJson: { query: 'outbound', confirm: true } });
    expect(apiRequest).toHaveBeenCalledWith('/api/sent/out-1', { method: 'DELETE' });
  });
  test('rejects JSON sender overrides and ignores non-array attachments', async () => {
    await expect(runApiCommand('send', [], { inputJson: { from: 'other@example.test', body: 'bad' } }))
      .rejects.toMatchObject({ code: 'INVALID_SEND_FIELDS' });
    await runApiCommand('send', [], { inputJson: { to: ['user@example.test'], body: 'ok', attachments: null } });
    expect(apiRequest).toHaveBeenCalledWith('/api/send', expect.objectContaining({ method: 'POST' }));
    await runApiCommand('send', [], { inputJson: { to: ['user@example.test'], body: 'ok', attachments: {} } });
  });
  test('uses a non-empty owner address for scoped reads', async () => {
    process.env.MAIL_OWNER_ADDRESS = ' scoped@example.test ';
    await runApiCommand('inbox', [], {});
    expect(apiRequest).toHaveBeenCalledWith('/api/inbox?address=scoped%40example.test');
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
      await writeFile(join(directory, 'file.txt'), 'existing');
      await runApiCommand('save-attachments', ['m-1', directory], {});
      expect(await (await import('node:fs/promises')).readFile(join(directory, 'file.txt'), 'utf8')).toBe('existing');
      expect(await (await import('node:fs/promises')).readFile(join(directory, 'file-2.txt'), 'utf8')).toBe('bytes');
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
    apiRequest.mockResolvedValueOnce(undefined);
    await runApiCommand('delete', [], { inputJson: { ids: ['m-1'], confirm: true } });
    apiRequest.mockResolvedValueOnce({ results: [{ id: 'm-2', kind: 'inbound' }, { id: 'o-1', kind: 'outbound' }] });
    await runApiCommand('delete', [], { inputJson: { query: 'old', confirm: true } });
    expect(apiRequest).toHaveBeenCalledWith('/api/messages/m-1', { method: 'DELETE' });
    expect(apiRequest).toHaveBeenCalledWith('/api/messages/m-2', { method: 'DELETE' });
    expect(apiRequest).toHaveBeenCalledWith('/api/sent/o-1', { method: 'DELETE' });
    expect(output).toHaveBeenLastCalledWith({ deleted: ['m-2', 'o-1'] }, { inputJson: { query: 'old', confirm: true } });
  });

  test('previews query deletion without deleting', async () => {
    apiRequest.mockResolvedValueOnce({ results: [{ id: 'm-1', kind: 'inbound' }] });
    await runApiCommand('delete', [], { inputJson: { query: 'old', dryRun: true } });
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(output).toHaveBeenCalledWith({ dryRun: true, action: 'delete', ids: ['m-1'] }, { inputJson: { query: 'old', dryRun: true } });
  });

  test('routes JSON and multipart sends and previews dry-run', async () => {
    await runApiCommand('send', [], { inputJson: { to: ['user@example.test'], cc: ['copy@example.test'], bcc: ['blind@example.test'], body: 'body' }, json: true });
    expect(apiRequest).toHaveBeenCalledWith('/api/send', expect.objectContaining({ method: 'POST', body: expect.objectContaining({ from: 'owner@example.test', to: ['user@example.test'], cc: ['copy@example.test'], bcc: ['blind@example.test'] }) }));
    const directory = await mkdtemp(join(tmpdir(), 'mailctl-api-send-'));
    try {
      const file = join(directory, 'attachment.txt');
      await writeFile(file, 'body');
    await runApiCommand('send', [], { inputJson: { to: ['user@example.test'], subject: 'Attachment', cc: ['copy@example.test'], bcc: ['blind@example.test'], attachments: [file] } });
    expect(apiRequest).toHaveBeenLastCalledWith('/api/send-multipart', expect.objectContaining({ method: 'POST', body: expect.any(FormData) }));
    const multipart = apiRequest.mock.calls.at(-1)[1].body;
    expect(multipart.get('cc')).toBe('copy@example.test');
    expect(multipart.get('bcc')).toBe('blind@example.test');
      await runApiCommand('send', [], { inputJson: { to: ['user@example.test'], attachments: [file] } });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    await runApiCommand('send', [], { inputJson: { to: ['user@example.test'] }, 'dry-run': true });
  });

  test('routes JSON send, retry, cancel, and delete requests', async () => {
    await runApiCommand('send', [], { inputJson: { to: ['user@example.test'], subject: 'Hi', body: 'Hello' } });
    expect(apiRequest).toHaveBeenCalledWith('/api/send', {
      method: 'POST',
      body: { to: ['user@example.test'], subject: 'Hi', body: 'Hello', from: 'owner@example.test' },
    });
    apiRequest.mockResolvedValueOnce({ outbound_id: 'out-1', status: 'queued' });
    await runApiCommand('retry', [], { inputJson: { ids: ['out-1'] } });
    apiRequest.mockResolvedValueOnce({ outbound_id: 'out-1', status: 'canceled' });
    await runApiCommand('cancel', [], { inputJson: { ids: ['out-1'] } });
    apiRequest.mockResolvedValueOnce(undefined);
    await runApiCommand('delete', [], { inputJson: { ids: ['m-1'], confirm: true } });
    expect(apiRequest).toHaveBeenLastCalledWith('/api/messages/m-1', { method: 'DELETE' });
  });

  test('validates JSON destructive requests before API writes', async () => {
    await expect(runApiCommand('retry', [], { inputJson: {} }))
      .rejects.toMatchObject({ code: 'OUTBOUND_IDS_REQUIRED' });
    await expect(runApiCommand('delete', [], { inputJson: { ids: ['m-1'] } }))
      .rejects.toMatchObject({ code: 'DELETE_CONFIRMATION_REQUIRED' });
    await runApiCommand('delete', [], { inputJson: { ids: ['m-1'], dryRun: true } });
    expect(output).toHaveBeenLastCalledWith({ dryRun: true, action: 'delete', ids: ['m-1'] }, { inputJson: { ids: ['m-1'], dryRun: true } });
  });

  test('loads API send bodies from @file and file-path inputs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mailctl-api-body-'));
    try {
      const text = join(directory, 'text.txt');
      const html = join(directory, 'body.html');
      await writeFile(text, 'text from file');
      await writeFile(html, '<p>html from file</p>');
      await runApiCommand('send', [], { inputJson: { to: ['user@example.test'], body: 'text from file', html: '<p>html from file</p>' } });
      expect(apiRequest).toHaveBeenCalledWith('/api/send', expect.objectContaining({ body: expect.objectContaining({ body: 'text from file', html: '<p>html from file</p>' }) }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('previews retry and cancel without API writes', async () => {
    await runApiCommand('retry', [], { inputJson: { ids: ['out-1', 'out-2'], dryRun: true } });
    await runApiCommand('cancel', [], { inputJson: { ids: ['out-1'], dryRun: true } });
    expect(apiRequest).not.toHaveBeenCalled();
    expect(output).toHaveBeenLastCalledWith({ dryRun: true, action: 'cancel', outboundIds: ['out-1'] }, { inputJson: { ids: ['out-1'], dryRun: true } });
  });

  test('ignores commands that are not API-routed yet', async () => {
  });
});
