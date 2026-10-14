import { runAttachmentCommand } from "./api-attachment-commands.mjs";
import { runDeleteCommand } from "./api-delete-command.mjs";
import { runDeliveryCommand } from "./api-delivery-commands.mjs";
import { runReadCommand } from "./api-read-commands.mjs";
import { runSendCommand } from "./api-send-commands.mjs";

const commandHandlers = new Map([
  ...[
    "inbox",
    "list",
    "headers",
    "read",
    "search",
    "thread",
    "sent",
    "sent-read",
    "outbound-status",
    "health",
    "domains",
  ].map((command) => [command, runReadCommand]),
  ...["attachments", "save-attachments", "save-sent-attachments"].map((command) => [
    command,
    runAttachmentCommand,
  ]),
  ...["send", "reply", "reply-all", "forward"].map((command) => [command, runSendCommand]),
  ...["retry", "cancel", "retry-uncertain"].map((command) => [command, runDeliveryCommand]),
  ["delete", runDeleteCommand],
]);

export async function runApiCommand(command, ids, options) {
  const handler = commandHandlers.get(command);
  return handler ? handler(command, ids, options) : undefined;
}
