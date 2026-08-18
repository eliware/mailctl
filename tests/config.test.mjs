import { userConfigPath } from '../src/config.mjs';

describe('configuration', () => {
  test('uses the per-user config directory', () => {
    expect(userConfigPath('/home/example')).toBe('/home/example/.config/mailctl/.env');
  });
});
