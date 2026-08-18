import { homedir } from 'node:os';
import { join } from 'node:path';
import { config as loadDotenv } from 'dotenv';

export function userConfigPath(home = homedir()) {
  return join(home, '.config', 'mailctl', '.env');
}

export function loadUserConfig({ home = homedir(), path = userConfigPath(home) } = {}) {
  return loadDotenv({ path, quiet: true });
}

loadUserConfig();
