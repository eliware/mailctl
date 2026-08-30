import { describe, expect, jest, test } from '@jest/globals';
import { output } from '../src/output.mjs';

describe('output', () => {
  test('always prints compact JSON', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    output([{ id: '1' }], { json: true });
    output([], {});
    expect(spy).toHaveBeenNthCalledWith(1, '[{"id":"1"}]');
    expect(spy).toHaveBeenNthCalledWith(2, '[]');
    spy.mockRestore();
  });
});
