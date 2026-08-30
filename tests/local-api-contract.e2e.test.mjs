import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const entrypoint = fileURLToPath(new URL('../mailctl.mjs', import.meta.url));

async function run(command, args = []) {
  const seen = [];
  const envelope = (data) => JSON.stringify({ data, request_id: 'local-request' });
  const server = createServer((request, response) => {
    seen.push({ method: request.method, url: request.url, auth: request.headers.authorization });
    if (request.headers.authorization !== 'Bearer local-test-token') {
      response.statusCode = 401;
      return response.end(JSON.stringify({ error: { code: 'AUTH_FAILED', message: 'unauthorized' }, request_id: 'local-request' }));
    }
    response.setHeader('content-type', 'application/json');
    if (request.url === '/api/inbox?address=agent%40example.test') return response.end(envelope({ messages: [{ message_id: 'm-1' }] }));
    if (request.url === '/api/messages') return response.end(envelope({ messages: [{ message_id: 'm-1' }] }));
    if (request.url === '/api/messages/m-1') return response.end(envelope({ message_id: 'm-1', attachments: [{ attachment_id: 'a-1', original_filename: 'note.txt' }] }));
    if (request.url === '/api/search?q=term') return response.end(envelope({ results: [{ id: 'm-1', kind: 'inbound' }] }));
    if (request.url === '/api/status') return response.end(envelope({ state: { status: 'running' }, readiness: { ready: true } }));
    if (request.url === '/api/domains') return response.end(envelope({ domains: [{ name: 'example.test' }] }));
    if (request.url === '/api/attachments/a-1') {
      response.setHeader('content-type', 'text/plain');
      return response.end('attachment bytes');
    }
    if (request.method === 'DELETE') return response.end(envelope({ deleted: ['m-1'] }));
    if (request.method === 'POST') return response.end(envelope({ outbound_id: 'out-1', status: 'queued', action: 'retry' }));
    response.end(envelope({ results: [], deliveries: [], attempts: [] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const child = spawn(process.execPath, [entrypoint, command, ...args], {
    env: { ...process.env, MAIL_API_URL: `http://127.0.0.1:${port}`, MAIL_API_TOKEN: 'local-test-token', MAIL_OWNER_ADDRESS: 'agent@example.test' },
    windowsHide: true,
  });
  const stdout = [], stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(chunk));
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  const [code] = await once(child, 'close');
  await new Promise((resolve) => server.close(resolve));
  return { code, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString(), seen };
}

describe('local API contract harness', () => {
  test('exercises all CLI commands through the mail service API', async () => {
    for (const [command, args] of [['list', []], ['inbox', []], ['headers', ['m-1']], ['read', ['m-1']], ['search', ['term']], ['thread', ['m-1']], ['sent', []], ['sent-read', ['out-1']], ['outbound-status', ['out-1']], ['health', []], ['domains', []], ['retry', ['{"ids":["out-1"]}']], ['cancel', ['{"ids":["out-1"]}']], ['send', ['{"to":["user@example.test"],"subject":"Hi","body":"body"}']], ['attachments', ['m-1']], ['delete', ['{"ids":["m-1"],"confirm":true}']], ['delete', ['{"query":"term","confirm":true}']]]) {
      const result = await run(command, args);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.seen.every(({ auth }) => auth === 'Bearer local-test-token')).toBe(true);
    }
    const directory = await mkdtemp(join(tmpdir(), 'mailctl-local-contract-'));
    try {
      const attachment = join(directory, 'upload.txt');
      await writeFile(attachment, 'upload bytes');
      const send = await run('send', [JSON.stringify({ to: ['user@example.test'], attachments: [attachment] })]);
      expect(send.code).toBe(0);
      const result = await run('save-attachments', ['m-1', directory, '--json']);
      expect(result.code).toBe(0);
      expect(await readFile(join(directory, 'note.txt'), 'utf8')).toBe('attachment bytes');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
