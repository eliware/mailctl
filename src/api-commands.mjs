import { apiRequest } from './api.mjs';
import { output } from './output.mjs';
import { openAsBlob } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { readJsonInput } from './json-input.mjs';

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

async function uniquePath(directory, filename) {
  const extension = basename(filename).includes('.') ? `.${basename(filename).split('.').pop()}` : '';
  const stem = extension ? basename(filename).slice(0, -extension.length) : basename(filename);
  let candidate = join(directory, filename);
  let suffix = 2;
  while (true) {
    try { await access(candidate); } catch { return candidate; }
    candidate = join(directory, `${stem}-${suffix}${extension}`);
    suffix += 1;
  }
}

function ownerAddress() {
  const address = process.env.MAIL_OWNER_ADDRESS?.trim();
  if (!address) {
    const error = new Error('MAIL_OWNER_ADDRESS must be configured for mailbox commands');
    error.code = 'MAIL_OWNER_ADDRESS_REQUIRED';
    throw error;
  }
  return address;
}

async function commandJsonInput(options) {
  if (options.inputJson !== undefined || options.input !== undefined) return readJsonInput(options);
  /* c8 ignore next -- exercised by the CLI process, not the command unit tests. */
  return readJsonInput({ ...options, readStdin: true });
}

export async function runApiCommand(command, ids, options) {
  const listQuery = query(options, ['limit', 'before', 'after', 'search', 'folder', 'domain', 'address', 'from', 'to']);
  if (command === 'inbox') {
    const scoped = { ...options, address: ownerAddress() };
    return output(await apiRequest(`/api/inbox${query(scoped, ['limit', 'before', 'after', 'search', 'folder', 'domain', 'address'])}`), options);
  }
  if (command === 'list') return output(await apiRequest(`/api/messages${listQuery}`), options);
  if (command === 'headers') return many(ids, (id) => `/api/messages/${encodeURIComponent(id)}/headers`, options);
  if (command === 'read') return many(ids, (id) => `/api/messages/${encodeURIComponent(id)}`, options);
  if (command === 'search') {
    const response = await apiRequest(`/api/search?q=${encodeURIComponent(ids[0])}`);
    return output(response.results, options);
  }
  if (command === 'thread') return many(ids, (id) => `/api/messages/${encodeURIComponent(id)}/thread`, options);
  if (command === 'sent') {
    const scoped = { ...options, from: ownerAddress() };
    return output(await apiRequest(`/api/sent${query(scoped, ['limit', 'before', 'after', 'search', 'from', 'to'])}`), options);
  }
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
      const target = await uniquePath(directory, filename);
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
  if (command === 'reply' || command === 'reply-all' || command === 'forward') {
    if (ids.length !== 1) {
      const error = new Error(`${command} requires exactly one message ID`);
      error.code = 'MESSAGE_ID_REQUIRED';
      throw error;
    }
    const request = await commandJsonInput(options);
    if (request.from !== undefined || request.sourceMessageId !== undefined || request.replyToMessageId !== undefined || request.replyMode !== undefined) {
      const error = new Error('reply sender and source fields are controlled by the command');
      error.code = 'INVALID_REPLY_FIELDS';
      throw error;
    }
    const body = {
      ...request,
      from: ownerAddress(),
      ...(command === 'forward' ? { forwardMessageId: ids[0] } : { replyToMessageId: ids[0] }),
      replyMode: command === 'forward' ? 'forward' : command === 'reply-all' ? 'reply-all' : 'reply',
    };
    if (options['dry-run']) return output({ dryRun: true, action: command, request: body }, options);
    return output(await apiRequest('/api/send', { method: 'POST', body }), options);
  }
  if (command === 'send') {
    const request = await commandJsonInput(options);
    if (request.from !== undefined) {
      const error = new Error('send sender is controlled by authenticated mailbox scope');
      error.code = 'INVALID_SEND_FIELDS';
      throw error;
    }
    const bodyRequest = { ...request, from: ownerAddress() };
    if (options['dry-run'] || request.dryRun) return output({ dryRun: true, action: 'send', request: bodyRequest }, options);
    const files = Array.isArray(bodyRequest.attachments)
      ? bodyRequest.attachments.filter((attachment) => typeof attachment === 'string')
      : [];
    const body = { ...bodyRequest, attachments: files.length ? undefined : bodyRequest.attachments };
    if (!files.length) return output(await apiRequest('/api/send', { method: 'POST', body }), options);
    const form = new FormData();
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) {
        const formValue = Array.isArray(value) ? value.join(',') : String(value);
        form.append(key, formValue);
      }
    }
    for (const file of files) form.append('attachment', await openAsBlob(file), file.split(/[\\/]/).pop());
    return output(await apiRequest('/api/send-multipart', { method: 'POST', body: form }), options);
  }
  if (command === 'retry' || command === 'cancel') {
    const request = await commandJsonInput(options);
    const requestIds = request.ids;
    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      const error = new Error(`${command} JSON input requires a non-empty ids array`);
      error.code = 'OUTBOUND_IDS_REQUIRED';
      throw error;
    }
    if (options['dry-run'] || request.dryRun) return output({ dryRun: true, action: command, outboundIds: requestIds }, options);
    const results = [];
    for (const id of requestIds) results.push(await apiRequest(`/api/sent/${encodeURIComponent(id)}/${command}`, { method: 'POST' }));
    return output(results.length === 1 ? results[0] : results, options);
  }
  if (command === 'delete') {
    const request = await commandJsonInput(options);
    const requestIds = Array.isArray(request.ids) ? request.ids : [];
    const queryText = request.query;
    if (!requestIds.length && !queryText) {
      const error = new Error('delete JSON input requires ids or query');
      error.code = 'DELETE_TARGET_REQUIRED';
      throw error;
    }
    const results = queryText
      ? (await apiRequest(`/api/search?q=${encodeURIComponent(queryText)}`)).results
      : requestIds.map((id) => ({ id }));
    if (options['dry-run'] || request.dryRun) return output({ dryRun: true, action: 'delete', ids: results.map(({ id }) => id) }, options);
    if (request.confirm !== true) {
      const error = new Error('delete JSON input requires confirm: true');
      error.code = 'DELETE_CONFIRMATION_REQUIRED';
      throw error;
    }
    const deleted = [];
    for (const item of results) {
      const kind = item.kind ?? 'inbound';
      const route = kind === 'outbound' ? 'sent' : 'messages';
      await apiRequest(`/api/${route}/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      deleted.push(item.id);
    }
    return output({ deleted }, options);
  }
  return undefined;
}
