import { describe, expect, test } from '@jest/globals';
import { parseArgs } from '../src/args.mjs';

describe('argument helpers', () => {
  test('parses flags, inline values, and positionals', () => {
    expect(parseArgs(['list', '--limit', '5', '--json', '--from=x'])).toEqual({ positionals: ['list'], options: { limit: '5', json: true, from: 'x' } });
  });
  test('parses boolean flags without values', () => {
    expect(parseArgs(['read', '--json', '--flag'])).toEqual({ positionals: ['read'], options: { json: true, flag: true } });
  });
});
