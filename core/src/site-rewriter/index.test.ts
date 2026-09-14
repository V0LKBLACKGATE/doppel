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

  it('does not corrupt alpha-hex colors that share a prefix with dominant colors', async () => {
    const workDirAlpha = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-rewrite-alpha-'));
    fs.mkdirSync(path.join(workDirAlpha, 'pages'), { recursive: true });
    fs.mkdirSync(path.join(workDirAlpha, 'assets'), { recursive: true });
    fs.writeFileSync(
      path.join(workDirAlpha, 'pages', 'page-0.html'),
      '<html><style>.transparent{background:#1b7964aa;}</style></html>',
    );
    fs.writeFileSync(path.join(workDirAlpha, 'assets', 'style.css'), '.btn{color:#1b7964aa;}');
    fs.writeFileSync(path.join(workDirAlpha, 'assets', 'logo.svg'), '<svg></svg>');
    fs.writeFileSync(
      path.join(workDirAlpha, 'manifest.json'),
      JSON.stringify({ pages: [{ url: 'https://acme.example', htmlPath: 'pages/page-0.html', usedRenderer: 'static' }] }),
    );

    const profile: BrandProfile = { logoSrc: '../assets/logo.svg', dominantColors: ['#1b7964'], brandName: 'Acme' };
    const rebrand: RebrandResult = {
      colorPalette: ['#7c3aed'],
      copyChanges: {},
      logoSvg: '<svg></svg>',
    };

    const { rewrittenDir } = await rewriteSite(workDirAlpha, profile, rebrand);

    const html = fs.readFileSync(path.join(rewrittenDir, 'pages', 'page-0.html'), 'utf-8');
    expect(html).toContain('#1b7964aa'); // 8-digit alpha color should NOT be modified
    expect(html).not.toContain('#7c3aeaaa'); // should not corrupt to this

    const css = fs.readFileSync(path.join(rewrittenDir, 'assets', 'style.css'), 'utf-8');
    expect(css).toContain('#1b7964aa'); // 8-digit alpha color in CSS should NOT be modified

    fs.rmSync(workDirAlpha, { recursive: true, force: true });
  });

  it('replaces flagged copy phrases embedded in longer text nodes', async () => {
    const workDirEmbed = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-rewrite-embed-'));
    fs.mkdirSync(path.join(workDirEmbed, 'pages'), { recursive: true });
    fs.mkdirSync(path.join(workDirEmbed, 'assets'), { recursive: true });
    fs.writeFileSync(
      path.join(workDirEmbed, 'pages', 'page-0.html'),
      '<html><body><p>Welcome to Acme, your trusted provider.</p><div>Welcome to Acme</div></body></html>',
    );
    fs.writeFileSync(path.join(workDirEmbed, 'assets', 'logo.svg'), '<svg></svg>');
    fs.writeFileSync(
      path.join(workDirEmbed, 'manifest.json'),
      JSON.stringify({ pages: [{ url: 'https://acme.example', htmlPath: 'pages/page-0.html', usedRenderer: 'static' }] }),
    );

    const profile: BrandProfile = { logoSrc: '../assets/logo.svg', dominantColors: [], brandName: 'Acme' };
    const rebrand: RebrandResult = {
      colorPalette: [],
      copyChanges: { 'Welcome to Acme': 'Bem-vindo à Sorriso+' },
      logoSvg: '<svg></svg>',
    };

    const { rewrittenDir } = await rewriteSite(workDirEmbed, profile, rebrand);

    const html = fs.readFileSync(path.join(rewrittenDir, 'pages', 'page-0.html'), 'utf-8');
    expect(html).toContain('Bem-vindo à Sorriso+, your trusted provider.'); // embedded phrase replaced
    expect(html).toContain('<div>Bem-vindo à Sorriso+</div>'); // whole-node phrase also replaced
    expect(html).not.toContain('Welcome to Acme'); // no old text remains

    fs.rmSync(workDirEmbed, { recursive: true, force: true });
  });
});
