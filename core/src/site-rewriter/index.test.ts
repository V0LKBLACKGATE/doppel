import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rewriteSite } from './index.js';
import type { BrandProfile } from '../brand-analyzer/index.js';
import type { RebrandResult } from '../claude-rebrander/index.js';

describe('rewriteSite', () => {
  let workDir: string;

  beforeAll(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-rewrite-'));
    fs.mkdirSync(path.join(workDir, 'pages'), { recursive: true });
    fs.mkdirSync(path.join(workDir, 'assets'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'pages', 'page-0.html'),
      '<html><head><style>.hero{background:#1B7964;}</style><link rel="stylesheet" href="../assets/style.css"></head>' +
        '<body><img src="../assets/logo.svg" alt="Acme logo"><h1>Welcome to Acme</h1></body></html>',
    );
    fs.writeFileSync(path.join(workDir, 'assets', 'style.css'), '.cta { color: #1B7964; }');
    fs.writeFileSync(path.join(workDir, 'assets', 'logo.svg'), '<svg>old</svg>');
    fs.writeFileSync(
      path.join(workDir, 'manifest.json'),
      JSON.stringify({ pages: [{ url: 'https://acme.example', htmlPath: 'pages/page-0.html', usedRenderer: 'static' }] }),
    );
  });

  afterAll(() => fs.rmSync(workDir, { recursive: true, force: true }));

  it('swaps the logo, replaces dominant colors, and rewrites flagged copy', async () => {
    const profile: BrandProfile = { logoSrc: '../assets/logo.svg', dominantColors: ['#1b7964'], brandName: 'Acme' };
    const rebrand: RebrandResult = {
      colorPalette: ['#7c3aed'],
      copyChanges: { 'Welcome to Acme': 'Bem-vindo à Sorriso+' },
      logoSvg: '<svg>new</svg>',
    };

    const { rewrittenDir } = await rewriteSite(workDir, profile, rebrand);

    const html = fs.readFileSync(path.join(rewrittenDir, 'pages', 'page-0.html'), 'utf-8');
    expect(html).toContain('Bem-vindo à Sorriso+');
    expect(html).not.toContain('Welcome to Acme');
    expect(html).toContain('#7c3aed');
    expect(html).not.toContain('#1B7964');
    expect(html).toMatch(/src="[^"]*logo\.svg"/);

    const newLogo = fs.readFileSync(path.join(rewrittenDir, 'assets', 'logo.svg'), 'utf-8');
    expect(newLogo).toBe('<svg>new</svg>');

    const css = fs.readFileSync(path.join(rewrittenDir, 'assets', 'style.css'), 'utf-8');
    expect(css).toContain('#7c3aed');
  });
});
