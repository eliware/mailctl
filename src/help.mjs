export const commandHelp = {
  list: 'List inbound message headers.\n\nUSAGE\n  mailctl list [query options]\n',
  inbox: 'List the owner mailbox inbox headers.\n\nUSAGE\n  mailctl inbox [query options]\n',
  headers: 'Read complete message headers and metadata.\n\nUSAGE\n  mailctl headers MESSAGE_ID...\n',
  read: 'Read complete messages, including bodies and attachment metadata.\n\nUSAGE\n  mailctl read MESSAGE_ID...\n',
  sent: 'List owner outbound messages and delivery status.\n\nUSAGE\n  mailctl sent [query options]\n',
  'sent-read': 'Read a sent message with bodies, attachments, deliveries, and attempts.\n\nUSAGE\n  mailctl sent-read OUTBOUND_ID...\n',
  'outbound-status': 'Inspect outbound delivery state and SMTP attempts.\n\nUSAGE\n  mailctl outbound-status OUTBOUND_ID...\n',
  search: 'Search the scoped mailbox.\n\nUSAGE\n  mailctl search QUERY\n',
  thread: 'Follow message threading headers.\n\nUSAGE\n  mailctl thread MESSAGE_ID\n',
  retry: 'Republish retryable outbound deliveries from a JSON request.\n\nUSAGE\n  mailctl retry\n  JSON: {"ids":["OUTBOUND_ID"]}\n',
  cancel: 'Cancel queued outbound delivery work from a JSON request.\n\nUSAGE\n  mailctl cancel\n  JSON: {"ids":["OUTBOUND_ID"]}\n',
  health: 'Check mail service API readiness.\n\nUSAGE\n  mailctl health\n',
  attachments: 'List attachment metadata for a message.\n\nUSAGE\n  mailctl attachments MESSAGE_ID\n',
  'save-attachments': 'Save inbound attachments locally.\n\nUSAGE\n  mailctl save-attachments MESSAGE_ID DIRECTORY\n',
  'save-sent-attachments': 'Save outbound attachments locally.\n\nUSAGE\n  mailctl save-sent-attachments OUTBOUND_ID DIRECTORY\n',
  send: 'Queue outbound mail from one JSON request on stdin, inline, or --input FILE.\n\nUSAGE\n  mailctl send\n  JSON: {"to":["recipient@example.test"],"subject":"Update","body":"Done"}\n',
  reply: 'Reply to one message from a JSON request.\n\nUSAGE\n  mailctl reply MESSAGE_ID\n  JSON: {"body":"Thanks"}\n',
  'reply-all': 'Reply to all participants from a JSON request.\n\nUSAGE\n  mailctl reply-all MESSAGE_ID\n  JSON: {"body":"Thanks"}\n',
  forward: 'Forward one message from a JSON request.\n\nUSAGE\n  mailctl forward MESSAGE_ID\n  JSON: {"body":"FYI"}\n',
  delete: 'Delete inbound or outbound messages from a confirmed JSON request.\n\nUSAGE\n  mailctl delete\n  JSON: {"ids":["MESSAGE_ID"],"confirm":true}\n',
  domains: 'List managed domains.\n\nUSAGE\n  mailctl domains\n',
};

export function help(positionals = []) {
  const command = positionals[0];
  if (command && commandHelp[command]) return `mailctl ${command}\n\n${commandHelp[command]}`;
  return `mailctl - non-interactive mail service API client

Commands:
  inbox, sent, read, send, reply, reply-all, forward
  list, headers, sent-read, outbound-status, search, thread
  retry, cancel, health, attachments, save-attachments
  save-sent-attachments, delete, domains

Options:
  --json       Accepted no-op; JSON output is always enabled
  --version    Emit the installed version as JSON
  --dry-run    Preview writes without changing state

HELP
  mailctl help [COMMAND]
  mailctl COMMAND --help

All commands use the configured mail service API and emit JSON. Mutating
commands accept one JSON request from inline input, stdin, or --input FILE.
Destructive requests require explicit JSON confirmation.
`;
}
