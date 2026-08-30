import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { readJsonInput } from '../src/json-input.mjs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('JSON input', () => {
  afterEach(() => jest.restoreAllMocks());
  test('accepts inline object input', async () => {
    await expect(readJsonInput({ inputJson: { body: 'hello' } }))
      .resolves.toEqual({ body: 'hello' });
  });
  test('rejects array input', async () => {
    await expect(readJsonInput({ inputJson: ['bad'] }))
      .rejects.toThrow('JSON input must be an object');
  });
  test('rejects multiple sources', async () => {
    await expect(readJsonInput({ inputJson: {}, input: 'request.json' }))
      .rejects.toThrow('provide exactly one JSON input source');
  });
  test('reads a JSON input file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mailctl-json-'));
    const file = join(directory, 'request.json');
    await writeFile(file, '{"body":"from file"}');
    await expect(readJsonInput({ input: file })).resolves.toEqual({ body: 'from file' });
    await rm(directory, { recursive: true, force: true });
  });
  test('rejects malformed JSON input files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mailctl-json-'));
    const file = join(directory, 'request.json');
    await writeFile(file, '{bad');
    await expect(readJsonInput({ input: file })).rejects.toThrow('must contain one valid JSON object');
    await rm(directory, { recursive: true, force: true });
  });
  test('rejects non-object JSON input files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mailctl-json-'));
    const file = join(directory, 'request.json');
    await writeFile(file, '["bad"]');
    await expect(readJsonInput({ input: file })).rejects.toThrow('JSON input must be an object');
    await rm(directory, { recursive: true, force: true });
  });
  test('requires an input source', async () => {
    await expect(readJsonInput()).rejects.toThrow('JSON input is required');
  });

  test('reads JSON from stdin events', async () => {
    const handlers = {};
    jest.spyOn(process.stdin, 'setEncoding').mockImplementation(() => process.stdin);
    jest.spyOn(process.stdin, 'on').mockImplementation((event, handler) => {
      handlers[event] = handler;
      return process.stdin;
    });
    const result = readJsonInput({ readStdin: true });
    handlers.data('{"body":"from stdin"}');
    handlers.end();
    await expect(result).resolves.toEqual({ body: 'from stdin' });
  });
});
