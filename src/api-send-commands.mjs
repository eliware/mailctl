import { openAsBlob } from "node:fs";
import { apiRequest } from "./api.mjs";
import { output } from "./output.mjs";
import { commandJsonInput, ownerAddress } from "./api-command-utils.mjs";

export async function runSendCommand(command, ids, options) {
  if (command === "reply" || command === "reply-all" || command === "forward") {
    if (ids.length !== 1) {
      const error = new Error(`${command} requires exactly one message ID`);
      error.code = "MESSAGE_ID_REQUIRED";
      throw error;
    }
    const request = await commandJsonInput(options);
    if (
      request.from !== undefined ||
      request.sourceMessageId !== undefined ||
      request.replyToMessageId !== undefined ||
      request.replyMode !== undefined
    ) {
      const error = new Error("reply sender and source fields are controlled by the command");
      error.code = "INVALID_REPLY_FIELDS";
      throw error;
    }
    const body = {
      ...request,
      from: ownerAddress(),
      ...(command === "forward" ? { forwardMessageId: ids[0] } : { replyToMessageId: ids[0] }),
      replyMode:
        command === "forward" ? "forward" : command === "reply-all" ? "reply-all" : "reply",
    };
    if (options["dry-run"])
      return output({ dryRun: true, action: command, request: body }, options);
    return output(await apiRequest("/api/send", { method: "POST", body }), options);
  }
  if (command !== "send") return undefined;
  const request = await commandJsonInput(options);
  if (request.from !== undefined) {
    const error = new Error("send sender is controlled by authenticated mailbox scope");
    error.code = "INVALID_SEND_FIELDS";
    throw error;
  }
  const bodyRequest = { ...request, from: ownerAddress() };
  if (options["dry-run"] || request.dryRun)
    return output({ dryRun: true, action: "send", request: bodyRequest }, options);
  const files = Array.isArray(bodyRequest.attachments)
    ? bodyRequest.attachments.filter((attachment) => typeof attachment === "string")
    : [];
  const body = {
    ...bodyRequest,
    attachments: files.length ? undefined : bodyRequest.attachments,
  };
  if (!files.length)
    return output(await apiRequest("/api/send", { method: "POST", body }), options);
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined)
      form.append(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  for (const file of files)
    form.append("attachment", await openAsBlob(file), file.split(/[\\/]/).pop());
  return output(await apiRequest("/api/send-multipart", { method: "POST", body: form }), options);
}
