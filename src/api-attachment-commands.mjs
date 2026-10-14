import { open, mkdir, rm } from "node:fs/promises";
import { join, parse } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { apiRequest } from "./api.mjs";
import { output } from "./output.mjs";

function safeFilename(value, fallback) {
  let filename = String(value ?? fallback)
    .replaceAll("\\", "/")
    .split("/")
    .at(-1);
  filename = [...filename]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || '<>:"|?*'.includes(character) ? "_" : character;
    })
    .join("")
    .replace(/[. ]+$/g, "");
  if (!filename || filename === "." || filename === "..") filename = fallback;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename)) filename = `_${filename}`;
  return filename;
}

function numberedFilename(filename, suffix) {
  const { name, ext } = parse(filename);
  return suffix === 1 ? filename : `${name}-${suffix}${ext}`;
}

async function saveResponse(directory, filename, response) {
  const source = response.body ? Readable.fromWeb(response.body) : Readable.from([]);
  let byteCount = 0;
  const bytes = new Transform({
    transform(chunk, _encoding, callback) {
      byteCount += chunk.length;
      callback(null, chunk);
    },
  });
  let suffix = 1;
  while (true) {
    const target = join(directory, numberedFilename(filename, suffix));
    let handle;
    try {
      handle = await open(target, "wx", 0o600);
    } catch (error) {
      if (error.code === "EEXIST") {
        suffix += 1;
        continue;
      }
      throw error;
    }
    try {
      await pipeline(source, bytes, handle.createWriteStream());
      return { path: target, bytes: byteCount };
    } catch (error) {
      try {
        await handle.close();
      } catch {}
      await rm(target, { force: true });
      throw error;
    }
  }
}

export async function runAttachmentCommand(command, ids, options) {
  if (command === "attachments") {
    const message = await apiRequest(`/api/messages/${encodeURIComponent(ids[0])}`);
    return output(message.attachments ?? [], options);
  }
  if (command !== "save-attachments" && command !== "save-sent-attachments") return undefined;
  const route = command === "save-attachments" ? "messages" : "sent";
  const message = await apiRequest(`/api/${route}/${encodeURIComponent(ids[0])}`);
  const directory = ids[1] ?? options.directory;
  await mkdir(directory, { recursive: true });
  const saved = [];
  for (const attachment of message.attachments ?? []) {
    const response = await apiRequest(
      `/api/attachments/${encodeURIComponent(attachment.attachment_id)}`,
      { raw: true },
    );
    const filename = safeFilename(attachment.original_filename, attachment.attachment_id);
    const file = await saveResponse(directory, filename, response);
    saved.push({ attachmentId: attachment.attachment_id, ...file });
  }
  return output(saved, options);
}
