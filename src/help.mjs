export const commandHelp = {
  list: 'List inbound message headers and 100-character previews.\n\nUSAGE\n  mailctl list [filters] [--json]\n',
  headers: 'Read complete headers and metadata for inbound messages.\n\nUSAGE\n  mailctl headers MESSAGE_ID... [--json]\n',
  read: 'Read complete inbound headers, bodies, and attachment metadata.\n\nUSAGE\n  mailctl read MESSAGE_ID... [--json]\n',
  sent: 'List outbound messages and delivery status.\n\nUSAGE\n  mailctl sent [--status STATUS] [--limit N] [--json]\n',
  'sent-read': 'Read a sent message with bodies, attachments, deliveries, and attempts.\n\nUSAGE\n  mailctl sent-read OUTBOUND_ID... [--json]\n',
  search: 'Search inbound and outbound mail with FULLTEXT relevance ranking.\n\nUSAGE\n  mailctl search QUERY [--json]\n',
  thread: 'Follow Message-ID, In-Reply-To, and References headers.\n\nUSAGE\n  mailctl thread MESSAGE_ID [--json]\n',
  retry: 'Republish retryable outbound deliveries.\n\nUSAGE\n  mailctl retry OUTBOUND_ID... --yes\n  mailctl retry OUTBOUND_ID... --dry-run --json\n',
  cancel: 'Cancel queued outbound delivery work.\n\nUSAGE\n  mailctl cancel OUTBOUND_ID... --yes\n',
  health: 'Check MariaDB, RabbitMQ, and shared storage.\n\nUSAGE\n  mailctl health [--json]\n',
  migrate: 'Apply eligible versioned MariaDB migrations.\n\nUSAGE\n  mailctl migrate --yes [--json]\n  MIGRATE_CONFIRM=apply mailctl migrate [--json]\n',
  attachments: 'List inbound attachment metadata.\n\nUSAGE\n  mailctl attachments MESSAGE_ID [--json]\n',
  'save-attachments': 'Extract inbound attachments.\n\nUSAGE\n  mailctl save-attachments MESSAGE_ID DIRECTORY [--json]\n',
  'save-sent-attachments': 'Extract outbound attachments.\n\nUSAGE\n  mailctl save-sent-attachments OUTBOUND_ID DIRECTORY [--json]\n',
  send: 'Queue outbound mail directly through MariaDB and RabbitMQ.\n\nUSAGE\n  mailctl send --sender ADDRESS --recipient ADDRESS --subject TEXT --text TEXT [flags]\n\nUse --json and --idempotency for agent workflows.\n',
  delete: 'Soft-delete inbound or outbound messages.\n\nUSAGE\n  mailctl delete MESSAGE_ID_OR_OUTBOUND_ID... --yes\n  mailctl delete --query TEXT --yes\n',
  domains: 'List managed domains.\n\nUSAGE\n  mailctl domains [--json]\n',
};

export function help(positionals = []) {
  const command = positionals[0];
  if (command && commandHelp[command]) return `mailctl ${command}\n\n${commandHelp[command]}`;
  return `mailctl - non-interactive direct MariaDB/RabbitMQ mail tool

Commands:
  list, headers, read, sent, sent-read, search, thread
  retry, cancel, health, migrate, attachments, save-attachments
  save-sent-attachments, send, delete, domains

Options:
  --json       Emit stable machine-readable output
  --version    Print the installed version
  --dry-run    Preview writes without changing state

HELP
  mailctl help [COMMAND]
  mailctl COMMAND --help

Start with 'mailctl health --json', then 'mailctl list --json' or
'mailctl sent --json'. Destructive commands require --yes.
`;
}
