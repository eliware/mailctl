import { describe, expect, test } from '@jest/globals';
import { writeFile } from 'node:fs/promises';
import { bodyValue, rabbitOptions, storagePath } from '../src/runtime.mjs';

describe('runtime helpers', () => {
  test('rejects storage traversal', () => {
    expect(() => storagePath('../secret')).toThrow('storage path escapes');
  });
  test('resolves storage objects', () => {
    expect(storagePath('attachments/aa/object')).toContain('attachments/aa/object');
  });
  test('handles inline and file-backed bodies', async () => {
    await expect(bodyValue('inline text')).resolves.toBe('inline text');
    await expect(bodyValue('')).resolves.toBeNull();
    const path = '/tmp/mailctl-body-test.txt';
    await writeFile(path, 'file body');
    await expect(bodyValue(`@${path}`)).resolves.toBe('file body');
  });
  test('requires RabbitMQ configuration', () => {
    const previous = process.env.RABBITMQ_URL;
    delete process.env.RABBITMQ_URL;
    expect(() => rabbitOptions()).toThrow('RabbitMQ configuration is required');
    if (previous === undefined) delete process.env.RABBITMQ_URL;
    else process.env.RABBITMQ_URL = previous;
  });
});
