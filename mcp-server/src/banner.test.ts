import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderBanner, PALETTE, SIGNATURE_LINES, printBanner } from './banner.js';

afterEach(() => vi.restoreAllMocks());

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
    expect(SIGNATURE_LINES.join('\n')).toContain('github.com/V0LKBLACKGATE');
  });
});

describe('printBanner', () => {
  it('writes to stderr, never to stdout (stdout is the MCP stdio JSON-RPC channel)', () => {
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    printBanner();

    expect(stdoutWrite).not.toHaveBeenCalled();
    expect(stderrWrite).toHaveBeenCalledTimes(1);
    expect(String(stderrWrite.mock.calls[0][0])).toContain('VØLK // BLACKGATE');
  });
});
