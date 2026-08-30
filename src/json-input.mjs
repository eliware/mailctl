import process from 'node:process';
import { readFile } from 'node:fs/promises';

function parseJson(text, source) {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('JSON input must be an object');
    return value;
  } catch (error) {
    const wrapped = new Error(`${source} must contain one valid JSON object: ${error.message}`);
    wrapped.code = 'INVALID_JSON_INPUT';
    throw wrapped;
  }
}

export async function readJsonInput(options = {}) {
  const sources = [options.inputJson !== undefined, options.input !== undefined, options.readStdin === true];
  if (sources.filter(Boolean).length > 1) {
    const error = new Error('provide exactly one JSON input source');
    error.code = 'MULTIPLE_JSON_INPUTS';
    throw error;
  }
  if (options.inputJson !== undefined) return inputObject(options.inputJson);
  if (options.input !== undefined) return parseJson(await readFile(options.input, 'utf8'), `input file ${options.input}`);
  /* c8 ignore start -- exercised by the CLI process, not the unit-test process. */
  if (options.readStdin === true) return parseJson(await new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  }), 'stdin');
  /* c8 ignore stop */
  const error = new Error('JSON input is required');
  error.code = 'MISSING_JSON_INPUT';
  throw error;
}

function inputObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON input must be an object');
  return value;
}
