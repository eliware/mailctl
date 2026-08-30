import { describe, expect, test } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { bodyValue, rabbitOptions, storagePath, storageRoot } from '../src/runtime.mjs';

describe('runtime helpers', () => {
  test('rejects storage traversal', () => {
    expect(() => storagePath('../secret')).toThrow('storage path escapes');
  });
  test('resolves storage objects', () => {
    expect(storagePath('attachments/aa/object')).toBe(
      resolve(storageRoot, 'attachments', 'aa', 'object'),
    );
  });
  test('handles inline and file-backed bodies', async () => {
    await expect(bodyValue('inline text')).resolves.toBe('inline text');
    await expect(bodyValue('')).resolves.toBeNull();
    const directory = await mkdtemp(join(tmpdir(), 'mailctl-body-'));
    const path = join(directory, 'body.txt');
    try {
      await writeFile(path, 'file body');
      await expect(bodyValue(`@${path}`)).resolves.toBe('file body');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  test('requires RabbitMQ configuration', () => {
    const previous = process.env.RABBITMQ_URL;
    delete process.env.RABBITMQ_URL;
    expect(() => rabbitOptions()).toThrow('RabbitMQ configuration is required');
    if (previous === undefined) delete process.env.RABBITMQ_URL;
    else process.env.RABBITMQ_URL = previous;
  });
});
