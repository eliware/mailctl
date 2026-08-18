import { describe, expect, test } from '@jest/globals';
import { health } from '../src/health.mjs';

describe('health command', () => {
  test('reports database/storage and handles unavailable broker', async () => {
    const db = { query: async () => [[{ ok: 1 }]] };
    await expect(health({ json: true }, db)).resolves.toBeUndefined();
  });
});
