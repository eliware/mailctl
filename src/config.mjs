import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const configFile = join(configDirectory, '.env');

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

export function loadConfig(path = configFile) {
  if (!existsSync(path)) return;
  const values = parseEnv(readFileSync(path, 'utf8'));
  for (const [name, value] of Object.entries(values)) {
    if (process.env[name] === undefined) process.env[name] = value;
  }
}

export function loadOwnerConfig(cwd = process.cwd()) {
  const path = join(cwd, '.env');
  if (!existsSync(path)) return;
  const values = parseEnv(readFileSync(path, 'utf8'));
  if (values.MAIL_OWNER_ADDRESS !== undefined)
    process.env.MAIL_OWNER_ADDRESS = values.MAIL_OWNER_ADDRESS;
}

loadConfig();
loadOwnerConfig();
