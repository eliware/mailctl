import { describe, expect, it } from '@jest/globals';
import { readFile } from 'node:fs/promises';

describe('migrate command', () => {
  it('requires explicit confirmation before migration writes', async () => {
    const source = await readFile(new URL('../mailctl.mjs', import.meta.url), 'utf8');
    expect(source).toContain('MIGRATE_CONFIRM !== "apply"');
    expect(source).toContain('migration writes require --yes');
  });
});
