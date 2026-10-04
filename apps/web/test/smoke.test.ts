import { describe, expect, it } from 'vitest';
import { APP_NAME } from '@vanguard/shared';

describe('web smoke', () => {
  it('resolves shared', () => expect(APP_NAME).toBe('VANGUARD OPS'));
});
