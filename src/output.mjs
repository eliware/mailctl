export function output(value, options, emptyMessage = 'No results found.') {
  if (options.json) console.log(JSON.stringify(value, null, 2));
  else if (Array.isArray(value)) {
    if (value.length) console.table(value);
    else console.log(emptyMessage);
  }
  else console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}
