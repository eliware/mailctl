import { describe, expect, test } from '@jest/globals';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, loadOwnerConfig } from '../src/config.mjs';

describe('configuration loading', () => {
  test('ignores a missing configuration file', () => {
    expect(loadConfig(join(tmpdir(), 'mailctl-no-such.env'))).toBeUndefined();
  });

  test('loads dotenv values without overriding process values', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mailctl-config-'));
    const path = join(directory, '.env');
    const previous = process.env.MAIL_API_URL;
    const previousToken = process.env.MAIL_API_TOKEN;
    delete process.env.MAIL_API_URL;
    delete process.env.MAIL_API_TOKEN;
    await writeFile(path, 'MAIL_API_URL=https://example.test\nexport MAIL_API_TOKEN="token-value"\nMAIL_API_LABEL=\'label\'\n');
    try {
      loadConfig(path);
      expect(process.env.MAIL_API_URL).toBe('https://example.test');
      expect(process.env.MAIL_API_TOKEN).toBe('token-value');
      process.env.MAIL_API_URL = 'https://override.example.test';
      loadConfig(path);
      expect(process.env.MAIL_API_URL).toBe('https://override.example.test');
    } finally {
      if (previous === undefined) delete process.env.MAIL_API_URL;
      else process.env.MAIL_API_URL = previous;
      if (previousToken === undefined) delete process.env.MAIL_API_TOKEN;
      else process.env.MAIL_API_TOKEN = previousToken;
    }
  });
  test('loads owner address from the caller configuration without loading API settings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mailctl-owner-'));
    const path = join(directory, '.env');
    const previousOwner = process.env.MAIL_OWNER_ADDRESS;
    const previousUrl = process.env.MAIL_API_URL;
    delete process.env.MAIL_OWNER_ADDRESS;
    process.env.MAIL_API_URL = 'https://process.example.test';
    await writeFile(path, 'MAIL_OWNER_ADDRESS=owner@example.test\nMAIL_API_URL=https://caller.example.test\n');
    try {
      loadOwnerConfig(directory);
      expect(process.env.MAIL_OWNER_ADDRESS).toBe('owner@example.test');
      expect(process.env.MAIL_API_URL).toBe('https://process.example.test');
    } finally {
      if (previousOwner === undefined) delete process.env.MAIL_OWNER_ADDRESS;
      else process.env.MAIL_OWNER_ADDRESS = previousOwner;
      if (previousUrl === undefined) delete process.env.MAIL_API_URL;
      else process.env.MAIL_API_URL = previousUrl;
    }
  });
  test('does not override an explicit owner address', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mailctl-owner-'));
    const path = join(directory, '.env');
    const previousOwner = process.env.MAIL_OWNER_ADDRESS;
    process.env.MAIL_OWNER_ADDRESS = 'process@example.test';
    await writeFile(path, 'MAIL_OWNER_ADDRESS=file@example.test\n');
    try {
      loadOwnerConfig(directory);
      expect(process.env.MAIL_OWNER_ADDRESS).toBe('process@example.test');
    } finally {
      if (previousOwner === undefined) delete process.env.MAIL_OWNER_ADDRESS;
      else process.env.MAIL_OWNER_ADDRESS = previousOwner;
    }
  });
  test('ignores caller configuration without an owner address', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mailctl-owner-'));
    const path = join(directory, '.env');
    const previousOwner = process.env.MAIL_OWNER_ADDRESS;
    delete process.env.MAIL_OWNER_ADDRESS;
    await writeFile(path, 'MAIL_API_URL=https://caller.example.test\n');
    try {
      expect(loadOwnerConfig(directory)).toBeUndefined();
      expect(process.env.MAIL_OWNER_ADDRESS).toBeUndefined();
    } finally {
      if (previousOwner === undefined) delete process.env.MAIL_OWNER_ADDRESS;
      else process.env.MAIL_OWNER_ADDRESS = previousOwner;
    }
  });
  test('ignores a missing caller configuration file', () => {
    expect(loadOwnerConfig(join(tmpdir(), 'mailctl-owner-no-such'))).toBeUndefined();
  });
});
