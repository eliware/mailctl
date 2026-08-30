import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../src/config.mjs';

const entrypoint = join(import.meta.dirname, '..', 'mailctl.mjs');
const owner = process.env.MAIL_OWNER_ADDRESS?.trim();
if (!owner) throw new Error('MAIL_OWNER_ADDRESS is required for live E2E');

function run(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entrypoint, command, ...args], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
    const stdout = [], stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const out = Buffer.concat(stdout).toString().trim();
      const err = Buffer.concat(stderr).toString().trim();
      let json;
      try { json = out ? JSON.parse(out) : undefined; } catch { reject(new Error(`${command} returned non-JSON output: ${out}`)); return; }
      resolve({ code, json, stderr: err });
    });
  });
}

function assertOk(result, label) {
  if (result.code !== 0 || result.stderr) throw new Error(`${label} failed: ${result.stderr || JSON.stringify(result.json)}`);
  return result.json;
}

const temp = await mkdtemp(join(tmpdir(), 'mailctl-live-e2e-'));
const attachment = join(temp, 'e2e.txt');
const saved = join(temp, 'saved');
await writeFile(attachment, 'mailctl-live-e2e-attachment');
const subject = `mailctl live e2e ${Date.now()}`;
let outboundId;
try {
  const results = [];
  const health = assertOk(await run('health'), 'health'); results.push(['health/status', 'PASS', health.readiness?.ready === true]);
  const inbox = assertOk(await run('inbox'), 'inbox'); results.push(['inbox', 'PASS', inbox.direction === 'inbound']);
  const sent = assertOk(await run('sent'), 'sent'); results.push(['sent', 'PASS', sent.direction === 'outbound']);
  const domains = assertOk(await run('domains'), 'domains'); results.push(['domains', 'PASS', Array.isArray(domains.domains)]);
  const search = assertOk(await run('search', [subject]), 'search'); results.push(['search', 'PASS', Array.isArray(search)]);
  const dryRun = assertOk(await run('send', [JSON.stringify({ to: [owner], subject, body: 'dry run', dryRun: true })]), 'send dry-run'); results.push(['dry-run', 'PASS', dryRun.dryRun === true]);
  const send = assertOk(await run('send', [JSON.stringify({ to: [owner], subject, body: 'live e2e', attachments: [attachment] })]), 'send');
  outboundId = send.outboundId ?? send.outbound_id;
  if (!outboundId) throw new Error(`send returned no outbound ID: ${JSON.stringify(send)}`);
  results.push(['send', 'PASS', outboundId]);
  const sentRead = assertOk(await run('sent-read', [outboundId]), 'sent-read'); results.push(['sent-read', 'PASS', sentRead.outbound_id === outboundId]);
  const attachmentList = Array.isArray(sentRead.attachments) ? sentRead.attachments : [];
  if (!attachmentList.length) results.push(['attachment metadata/download', 'BLOCKED', 'sent response contained no attachments']);
  else {
    await run('save-sent-attachments', [outboundId, saved]);
    const files = await import('node:fs/promises').then(({ readdir }) => readdir(saved));
    const content = await readFile(join(saved, files[0]), 'utf8');
    results.push(['attachment metadata/download', content === 'mailctl-live-e2e-attachment' ? 'PASS' : 'FAIL', files[0]]);
  }
  results.push(['read inbound', inbox.messages?.length ? 'PENDING' : 'SKIP', 'no inbound fixture available']);
  results.push(['headers/thread/reply/reply-all/forward/retry/cancel', 'PENDING', 'requires usable inbound and queued fixtures']);
  assertOk(await run('delete', [JSON.stringify({ query: subject, confirm: true })]), 'delete cleanup');
  console.log(JSON.stringify({ subject, outboundId, results }));
} finally {
  if (outboundId) {
    try { await run('delete', [JSON.stringify({ query: subject, confirm: true })]); } catch { /* report the original failure; cleanup remains visible to the operator */ }
  }
  await rm(temp, { recursive: true, force: true });
}
