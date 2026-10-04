import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../src';

describe('sim smoke', () => {
  it('links workspace packages', () => {
    expect(APP_NAME).toBe('VANGUARD OPS');
  });
});
