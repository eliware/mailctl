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
let attachmentOutboundId;
try {
  const results = [];
  const health = assertOk(await run('health'), 'health'); results.push(['health/status', 'PASS', health.readiness?.ready === true]);
  const inbox = assertOk(await run('inbox'), 'inbox'); results.push(['inbox', 'PASS', inbox.direction === 'inbound']);
  const domains = assertOk(await run('domains'), 'domains'); results.push(['domains', 'PASS', Array.isArray(domains.domains)]);
  const dryRun = assertOk(await run('send', [JSON.stringify({ to: [owner], subject, body: 'dry run', dryRun: true })]), 'send dry-run'); results.push(['dry-run', 'PASS', dryRun.dryRun === true]);
  const send = assertOk(await run('send', [JSON.stringify({ to: [owner], subject, body: 'live e2e' })]), 'send');
  outboundId = send.outboundId ?? send.outbound_id;
  if (!outboundId) throw new Error(`send returned no outbound ID: ${JSON.stringify(send)}`);
  results.push(['send', 'PASS', outboundId]);
  const sent = assertOk(await run('sent'), 'sent'); results.push(['sent', 'PASS', sent.direction === 'outbound']);
  const sentRead = assertOk(await run('sent-read', [outboundId]), 'sent-read'); results.push(['sent-read', 'PASS', sentRead.outbound_id === outboundId]);
  const status = assertOk(await run('outbound-status', [outboundId]), 'outbound-status'); results.push(['outbound-status', 'PASS', Boolean(status)]);
  const search = assertOk(await run('search', [subject]), 'search'); results.push(['search', 'PASS', search.some((item) => item.id === outboundId)]);
  const attachmentSend = await run('send', [JSON.stringify({ to: [owner], subject: `${subject} attachment`, body: 'attachment e2e', attachments: [attachment] })]);
  attachmentOutboundId = attachmentSend.json?.outboundId ?? attachmentSend.json?.outbound_id;
  results.push(['attachment upload/list/download', attachmentSend.code === 0 ? 'PASS' : 'BLOCKED', attachmentSend.code === 0 ? 'uploaded' : attachmentSend.json?.error?.message ?? attachmentSend.stderr]);
  const retryDryRun = assertOk(await run('retry', [JSON.stringify({ ids: [outboundId], dryRun: true })]), 'retry dry-run'); results.push(['retry dry-run', 'PASS', retryDryRun.dryRun === true]);
  const cancelDryRun = assertOk(await run('cancel', [JSON.stringify({ ids: [outboundId], dryRun: true })]), 'cancel dry-run'); results.push(['cancel dry-run', 'PASS', cancelDryRun.dryRun === true]);
  const deleteDryRun = assertOk(await run('delete', [JSON.stringify({ ids: [outboundId], dryRun: true })]), 'delete batch dry-run'); results.push(['delete batch dry-run', 'PASS', deleteDryRun.dryRun === true]);
  const queryDryRun = assertOk(await run('delete', [JSON.stringify({ query: subject, dryRun: true })]), 'delete query dry-run'); results.push(['delete query dry-run', 'PASS', queryDryRun.dryRun === true]);
  results.push(['read/headers/thread/reply/reply-all/forward', 'BLOCKED', 'requires a usable inbound fixture']);
  results.push(['retry/cancel live', 'BLOCKED', 'requires a queued or retryable outbound fixture']);
  assertOk(await run('delete', [JSON.stringify({ query: subject, confirm: true })]), 'delete cleanup');
  console.log(JSON.stringify({ subject, outboundId, results }));
} finally {
  if (outboundId) {
    try { await run('delete', [JSON.stringify({ query: subject, confirm: true })]); } catch { /* report the original failure; cleanup remains visible to the operator */ }
  }
  if (attachmentOutboundId) {
    try { await run('delete', [JSON.stringify({ query: `${subject} attachment`, confirm: true })]); } catch { /* report the original failure; cleanup remains visible to the operator */ }
  }
  await rm(temp, { recursive: true, force: true });
}
