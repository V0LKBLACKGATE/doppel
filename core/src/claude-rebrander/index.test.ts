import { describe, it, expect, vi } from 'vitest';
import { extractCopyExcerpts, rebrandSite, RebrandParseError } from './index.js';
import type { BrandProfile } from '../brand-analyzer/index.js';

const profile: BrandProfile = {
  logoSrc: '../assets/logo.svg',
  dominantColors: ['#1b7964'],
  brandName: 'Acme Rockets',
};

function fakeClient(toolInput: unknown, useToolUse = true) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: useToolUse ? [{ type: 'tool_use', name: 'submit_rebrand', input: toolInput }] : [{ type: 'text', text: 'oops' }],
      }),
    },
  } as any;
}

describe('extractCopyExcerpts', () => {
  it('pulls headline and CTA text, deduped, capped at max', () => {
    const pages = [{ html: '<h1>Welcome</h1><h1>Welcome</h1><button>Buy now</button>' }];
    const excerpts = extractCopyExcerpts(pages, 10);
    expect(excerpts).toEqual(['Welcome', 'Buy now']);
  });
});

describe('rebrandSite', () => {
  it('parses a well-formed tool_use response into a RebrandResult', async () => {
    const client = fakeClient({
      colorPalette: ['#7c3aed'],
      copyChanges: { Welcome: 'Bem-vindo' },
      logoSvg: '<svg><text>SR</text></svg>',
    });

    const result = await rebrandSite(profile, ['Welcome'], 'Sorriso+', 'clínica odontológica', { client });

    expect(result.colorPalette).toEqual(['#7c3aed']);
    expect(result.copyChanges.Welcome).toBe('Bem-vindo');
    expect(result.logoSvg).toContain('<svg>');
    expect(client.messages.create).toHaveBeenCalledTimes(1);
    const callArgs = client.messages.create.mock.calls[0][0];
    expect(JSON.stringify(callArgs)).toContain('Sorriso+');
    expect(JSON.stringify(callArgs)).toContain('clínica odontológica');
  });

  it('throws RebrandParseError when Claude does not return the expected tool call', async () => {
    const client = fakeClient({}, false);
    await expect(rebrandSite(profile, ['Welcome'], 'Sorriso+', undefined, { client })).rejects.toBeInstanceOf(
      RebrandParseError,
    );
  });
});
