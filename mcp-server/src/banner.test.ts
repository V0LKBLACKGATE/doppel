import { describe, it, expect } from 'vitest';
import { renderBanner, PALETTE, SIGNATURE_LINES } from './banner.js';

describe('renderBanner', () => {
  it('colors runs of a tone digit with the matching palette escape and resets after', () => {
    // 2-row fixture, independent of the real wolf data: row 0 is all tone "1",
    // row 1 mixes tone "1" then a space (which must NOT be colored).
    const rows = ['ab', 'cd'];
    const tones = ['11', '1 '];

    const output = renderBanner(rows, tones);
    const lines = output.split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(`${PALETTE['1']}ab[0m`);
    expect(lines[1]).toBe(`${PALETTE['1']}c[0md`);
  });

  it('includes the VØLK // BLACKGATE signature lines', () => {
    expect(SIGNATURE_LINES.join('\n')).toContain('VØLK // BLACKGATE');
    expect(SIGNATURE_LINES.join('\n')).toContain('github.com/VOLKBLACKGATE');
  });
});
