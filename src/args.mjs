export function parseArgs(argv) {
  const positionals = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) { positionals.push(token); continue; }
    const [key, inline] = token.slice(2).split('=', 2);
    if (inline !== undefined) options[key] = inline;
    else if (argv[index + 1] && !argv[index + 1].startsWith('--')) options[key] = argv[++index];
    else options[key] = true;
  }
  return { positionals, options };
}

export function values(value) { return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean); }
export function required(options, name) { if (!options[name] || typeof options[name] !== 'string') throw new Error(`--${name} is required`); return options[name]; }
export function limitValue(value) { const limit = Number(value ?? 50); if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer'); return Math.min(limit, 500); }
export function dateFilter(options, column, where, params) { if (options.after) { where.push(`${column} > ?`); params.push(options.after); } if (options.before) { where.push(`${column} < ?`); params.push(options.before); } }
