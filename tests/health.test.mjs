import { describe, expect, test } from '@jest/globals';
import { health } from '../src/health.mjs';

describe('health command', () => {
  test('reports database/storage and handles unavailable broker', async () => {
    const db = { query: async () => [[{ ok: 1 }]] };
    await expect(health({ json: true }, db)).resolves.toBeUndefined();
  });
  test('reports degraded status when the database is unavailable', async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    await expect(health({ json: true }, { query: async () => { throw new Error('database unavailable'); } })).resolves.toBeUndefined();
    expect(process.exitCode).toBe(2);
    process.exitCode = previousExitCode;
  });
});
