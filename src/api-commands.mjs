import { apiRequest } from './api.mjs';
import { output } from './output.mjs';
import { openAsBlob } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

function query(options, keys) {
  const params = new URLSearchParams();
  for (const key of keys) {
    if (options[key] !== undefined) params.set(key, String(options[key]));
  }
  const value = params.toString();
  if (value) return `?${value}`;
  return '';
}

async function many(ids, path, options) {
  const results = [];
  for (const id of ids) results.push(await apiRequest(path(id)));
  return output(results.length === 1 ? results[0] : results, options);
}

async function bodyValue(value) {
  if (!value) return undefined;
  const path = value.startsWith('@') ? value.slice(1) : value;
  try {
    if ((await stat(path)).isFile()) return await readFile(path, 'utf8');
  } catch {}
  return value;
}

export async function runApiCommand(command, ids, options) {
  const listQuery = query(options, ['limit', 'before', 'after', 'search', 'folder', 'domain', 'address', 'from', 'to']);
  if (command === 'list') return output(await apiRequest(`/api/messages${listQuery}`), options);
  if (command === 'headers') return many(ids, (id) => `/api/messages/${encodeURIComponent(id)}/headers`, options);
  if (command === 'read') return many(ids, (id) => `/api/messages/${encodeURIComponent(id)}`, options);
  if (command === 'search') {
    const response = await apiRequest(`/api/search?q=${encodeURIComponent(ids[0])}`);
    return output(response.results, options);
  }
  if (command === 'thread') return many(ids, (id) => `/api/messages/${encodeURIComponent(id)}/thread`, options);
  if (command === 'sent') return output(await apiRequest(`/api/sent${listQuery}`), options);
  if (command === 'sent-read') return many(ids, (id) => `/api/sent/${encodeURIComponent(id)}`, options);
  if (command === 'attachments') {
    const message = await apiRequest(`/api/messages/${encodeURIComponent(ids[0])}`);
    return output(message.attachments ?? [], options);
  }
  if (command === 'save-attachments' || command === 'save-sent-attachments') {
    const route = command === 'attachments' || command === 'save-attachments' ? 'messages' : 'sent';
    const message = await apiRequest(`/api/${route}/${encodeURIComponent(ids[0])}`);
    const directory = ids[1] ?? options.directory;
    await mkdir(directory, { recursive: true });
    const saved = [];
    for (const attachment of message.attachments ?? []) {
      const response = await apiRequest(`/api/attachments/${encodeURIComponent(attachment.attachment_id)}`, { raw: true });
      const filename = basename(attachment.original_filename ?? attachment.attachment_id);
      const target = join(directory, filename);
      const content = Buffer.from(await response.arrayBuffer());
      await writeFile(target, content);
      saved.push({ attachmentId: attachment.attachment_id, path: target, bytes: content.length });
    }
    return output(saved, options);
  }
  if (command === 'outbound-status') return many(ids, (id) => `/api/sent/${encodeURIComponent(id)}/status`, options);
  if (command === 'health') {
    const status = await apiRequest('/api/status');
    const healthy = status.readiness?.ready === true;
    process.exitCode = healthy ? 0 : 1;
    return output({ ...status, healthy }, options);
  }
  if (command === 'domains') return output(await apiRequest('/api/domains'), options);
  if (command === 'send') {
    const recipients = Array.isArray(options.recipient) ? options.recipient : [options.recipient].filter(Boolean);
    const cc = Array.isArray(options.cc) ? options.cc : [options.cc].filter(Boolean);
    const bcc = Array.isArray(options.bcc) ? options.bcc : [options.bcc].filter(Boolean);
    const headers = {};
    if (cc.length) headers.Cc = cc.join(', ');
    if (bcc.length) headers.Bcc = bcc.join(', ');
    const body = { from: options.sender, to: recipients, subject: options.subject ?? '', text: await bodyValue(options.text), html: await bodyValue(options.html), headers: Object.keys(headers).length ? headers : undefined, idempotencyKey: options.idempotency };
    if (options['dry-run']) return output({ dryRun: true, action: 'send', sender: options.sender, recipients }, options);
    let files;
    if (Array.isArray(options.attachment)) files = options.attachment;
    else files = [options.attachment].filter(Boolean);
    if (!files.length) return output(await apiRequest('/api/send', { method: 'POST', body }), options);
    const form = new FormData();
    for (const [key, value] of Object.entries({ ...body, cc: cc.length ? cc.join(',') : undefined, bcc: bcc.length ? bcc.join(',') : undefined, headers: undefined })) {
      if (value !== undefined) {
        const formValue = Array.isArray(value) ? value.join(',') : String(value);
        form.append(key, formValue);
      }
    }
    for (const file of files) form.append('attachment', await openAsBlob(file), file.split(/[\\/]/).pop());
    return output(await apiRequest('/api/send-multipart', { method: 'POST', body: form }), options);
  }
  if (command === 'retry' || command === 'cancel') {
    if (options['dry-run']) return output({ dryRun: true, action: command, outboundIds: ids }, options);
    const results = [];
    for (const id of ids)
      results.push(await apiRequest(`/api/sent/${encodeURIComponent(id)}/${command}`, { method: 'POST' }));
    return output(results.length === 1 ? results[0] : results, options);
  }
  if (command === 'delete') {
    const results = options.query
      ? (await apiRequest(`/api/search?q=${encodeURIComponent(options.query)}`)).results
      : ids.map((id) => ({ id }));
    if (options['dry-run']) return output({ dryRun: true, action: 'delete', ids: results.map(({ id }) => id) }, options);
    const deleted = [];
    for (const item of results) {
      let kind = item.kind;
      if (!kind) {
        try {
          await apiRequest(`/api/messages/${encodeURIComponent(item.id)}`);
          kind = 'inbound';
        } catch (error) {
          if (error.status !== 404) throw error;
          kind = 'outbound';
        }
      }
      const route = kind === 'outbound' ? 'sent' : 'messages';
      await apiRequest(`/api/${route}/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      deleted.push(item.id);
    }
    return output({ deleted }, options);
  }
  return undefined;
}
