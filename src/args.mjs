export function parseArgs(argv) {
  const positionals = [];
  const options = {};
  let input;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      if (token.trimStart().startsWith('{')) {
        if (input !== undefined) throw new Error('only one JSON input document may be supplied');
        try { input = JSON.parse(token); }
        catch { throw new Error('inline JSON input is malformed'); }
      } else positionals.push(token);
      continue;
    }
    const [key, inline] = token.slice(2).split('=', 2);
    if (inline !== undefined) options[key] = inline;
    else if (argv[index + 1] && !argv[index + 1].startsWith('--')) options[key] = argv[++index];
    else options[key] = true;
  }
  if (input !== undefined) options.inputJson = input;
  return { positionals, options };
}
