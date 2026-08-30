import { describe, expect, jest, test } from '@jest/globals';
import { output } from '../src/output.mjs';

describe('output', () => {
  test('prints JSON for agents', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    output([{ id: '1' }], { json: true });
    expect(spy).toHaveBeenCalledWith('[\n  {\n    "id": "1"\n  }\n]');
    spy.mockRestore();
  });
  test('prints a useful empty message', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    output([], {});
    expect(spy).toHaveBeenCalledWith('No results found.');
    spy.mockRestore();
  });
  test('prints nonempty arrays as tables', () => {
    const spy = jest.spyOn(console, 'table').mockImplementation(() => {});
    output([{ id: '1' }], {});
    expect(spy).toHaveBeenCalledWith([{ id: '1' }]);
    spy.mockRestore();
  });
  test('prints strings and objects for humans', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    output('hello', {});
    output({ id: '1' }, {});
    expect(spy).toHaveBeenNthCalledWith(1, 'hello');
    expect(spy).toHaveBeenNthCalledWith(2, '{\n  "id": "1"\n}');
    spy.mockRestore();
  });
});
