import { describe, expect, it } from 'vitest';
import { APP_NAME } from '@vanguard/shared';

describe('server smoke', () => {
  it('resolves shared', () => expect(APP_NAME).toContain('VANGUARD'));
});
