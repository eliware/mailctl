import { describe, expect, test } from '@jest/globals';
import { dateFilter, limitValue, parseArgs, required, values } from '../src/args.mjs';

describe('argument helpers', () => {
  test('parses flags, inline values, and positionals', () => {
    expect(parseArgs(['list', '--limit', '5', '--json', '--from=x'])).toEqual({ positionals: ['list'], options: { limit: '5', json: true, from: 'x' } });
  });
  test('validates values and limits', () => {
    expect(values('a, b')).toEqual(['a', 'b']);
    expect(required({ name: 'x' }, 'name')).toBe('x');
    expect(limitValue(900)).toBe(500);
    expect(() => limitValue(0)).toThrow();
  });
  test('adds date predicates', () => {
    const where = []; const params = [];
    dateFilter({ after: '2026-01-01', before: '2026-02-01' }, 'created_at', where, params);
    expect(where).toEqual(['created_at > ?', 'created_at < ?']);
    expect(params).toEqual(['2026-01-01', '2026-02-01']);
  });
});
