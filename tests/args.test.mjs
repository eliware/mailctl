import { describe, expect, test } from '@jest/globals';
import { parseArgs } from '../src/args.mjs';

describe('argument helpers', () => {
  test('parses flags, inline values, and positionals', () => {
    expect(parseArgs(['list', '--limit', '5', '--json', '--from=x'])).toEqual({ positionals: ['list'], options: { limit: '5', json: true, from: 'x' } });
  });
  test('parses boolean flags without values', () => {
    expect(parseArgs(['read', '--json', '--flag'])).toEqual({ positionals: ['read'], options: { json: true, flag: true } });
  });
  test('parses one inline JSON input document', () => {
    expect(parseArgs(['reply', 'message-1', '{"body":"thanks"}'])).toEqual({
      positionals: ['reply', 'message-1'],
      options: { inputJson: { body: 'thanks' } },
    });
  });
  test('rejects multiple inline JSON documents', () => {
    expect(() => parseArgs(['send', '{"body":"one"}', '{"body":"two"}']))
      .toThrow('only one JSON input document may be supplied');
  });
  test('rejects malformed inline JSON', () => {
    expect(() => parseArgs(['send', '{not-json']))
      .toThrow('inline JSON input is malformed');
  });
});
