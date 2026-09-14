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

  it('prevents order-dependent double-replacement when replacement value contains another key', async () => {
    const workDirDouble = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-rewrite-double-'));
    fs.mkdirSync(path.join(workDirDouble, 'pages'), { recursive: true });
    fs.mkdirSync(path.join(workDirDouble, 'assets'), { recursive: true });
    // copyChanges where first replacement contains the second key: "Welcome" → "Welcome to Acme Labs", then "Acme Labs" → "Acme"
    // Without the fix, the second pass would corrupt the newly-inserted "Acme Labs"
    fs.writeFileSync(
      path.join(workDirDouble, 'pages', 'page-0.html'),
      '<html><body><p>Welcome</p></body></html>',
    );
    fs.writeFileSync(path.join(workDirDouble, 'assets', 'logo.svg'), '<svg></svg>');
    fs.writeFileSync(
      path.join(workDirDouble, 'manifest.json'),
      JSON.stringify({ pages: [{ url: 'https://test.example', htmlPath: 'pages/page-0.html', usedRenderer: 'static' }] }),
    );

    const profile: BrandProfile = { logoSrc: '../assets/logo.svg', dominantColors: [], brandName: 'Test' };
    const rebrand: RebrandResult = {
      colorPalette: [],
      copyChanges: { 'Welcome': 'Welcome to Acme Labs', 'Acme Labs': 'Acme' },
      logoSvg: '<svg></svg>',
    };

    const { rewrittenDir } = await rewriteSite(workDirDouble, profile, rebrand);

    const html = fs.readFileSync(path.join(rewrittenDir, 'pages', 'page-0.html'), 'utf-8');
    // The result should be "Welcome to Acme Labs" (from the first key replacement)
    // NOT cascaded to "Welcome to Acme" by the second replacement
    expect(html).toContain('Welcome to Acme Labs');
    expect(html).not.toContain('Welcome to Acme</'); // should not have just "Acme"

    fs.rmSync(workDirDouble, { recursive: true, force: true });
  });

  it('writes a non-SVG original logo to a .svg sibling and repoints the pages at it', async () => {
    const workDirPng = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-rewrite-png-'));
    fs.mkdirSync(path.join(workDirPng, 'pages'), { recursive: true });
    fs.mkdirSync(path.join(workDirPng, 'assets'), { recursive: true });
    fs.writeFileSync(
      path.join(workDirPng, 'pages', 'page-0.html'),
      '<html><body><img src="../assets/logo.png" srcset="../assets/logo.png 1x, ../assets/logo.png 2x" alt="Acme logo"></body></html>',
    );
    fs.writeFileSync(path.join(workDirPng, 'assets', 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(
      path.join(workDirPng, 'manifest.json'),
      JSON.stringify({ pages: [{ url: 'https://acme.example', htmlPath: 'pages/page-0.html', usedRenderer: 'static' }] }),
    );

    const profile: BrandProfile = { logoSrc: '../assets/logo.png', dominantColors: [], brandName: 'Acme' };
    const rebrand: RebrandResult = { colorPalette: [], copyChanges: {}, logoSvg: '<svg>novo</svg>' };

    const { rewrittenDir } = await rewriteSite(workDirPng, profile, rebrand);

    // The SVG must land in a .svg file, never inside the original .png
    const svgPath = path.join(rewrittenDir, 'assets', 'logo.svg');
    expect(fs.existsSync(svgPath)).toBe(true);
    expect(fs.readFileSync(svgPath, 'utf-8')).toBe('<svg>novo</svg>');
    expect(fs.readFileSync(path.join(rewrittenDir, 'assets', 'logo.png'), 'utf-8')).not.toContain('<svg>novo</svg>');

    // ...and the page must point at the new file, in both src and srcset
    const html = fs.readFileSync(path.join(rewrittenDir, 'pages', 'page-0.html'), 'utf-8');
    expect(html).toContain('src="../assets/logo.svg"');
    expect(html).toContain('../assets/logo.svg 1x');
    expect(html).toContain('../assets/logo.svg 2x');
    expect(html).not.toContain('logo.png');

    fs.rmSync(workDirPng, { recursive: true, force: true });
  });

  it('replaces 3-digit hex shorthand in the source when the analyzer normalized it to 6 digits', async () => {
    const workDirShort = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-rewrite-short-'));
    fs.mkdirSync(path.join(workDirShort, 'pages'), { recursive: true });
    fs.mkdirSync(path.join(workDirShort, 'assets'), { recursive: true });
    fs.writeFileSync(
      path.join(workDirShort, 'pages', 'page-0.html'),
      '<html><head><style>.hero{background:#0bf;border-color:#0BFD;}</style></head><body><p>oi</p></body></html>',
    );
    fs.writeFileSync(path.join(workDirShort, 'assets', 'style.css'), '.cta{color:#0bf;}');
    fs.writeFileSync(path.join(workDirShort, 'assets', 'logo.svg'), '<svg></svg>');
    fs.writeFileSync(
      path.join(workDirShort, 'manifest.json'),
      JSON.stringify({ pages: [{ url: 'https://acme.example', htmlPath: 'pages/page-0.html', usedRenderer: 'static' }] }),
    );

    // brand-analyzer normalizes #0bf → #00bbff before it ever reaches dominantColors
    const profile: BrandProfile = { logoSrc: '../assets/logo.svg', dominantColors: ['#00bbff'], brandName: 'Acme' };
    const rebrand: RebrandResult = { colorPalette: ['#7c3aed'], copyChanges: {}, logoSvg: '<svg></svg>' };

    const { rewrittenDir } = await rewriteSite(workDirShort, profile, rebrand);

    const html = fs.readFileSync(path.join(rewrittenDir, 'pages', 'page-0.html'), 'utf-8');
    expect(html).toContain('background:#7c3aed');
    expect(html).not.toContain('#0bf;');
    // 4-digit alpha shorthand keeps its boundary guard and must NOT be touched
    expect(html).toContain('#0BFD');

    const css = fs.readFileSync(path.join(rewrittenDir, 'assets', 'style.css'), 'utf-8');
    expect(css).toContain('#7c3aed');

    fs.rmSync(workDirShort, { recursive: true, force: true });
  });

  it('excludes copy phrase replacements from <style> and <script> blocks', async () => {
    const workDirStyle = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-rewrite-style-'));
    fs.mkdirSync(path.join(workDirStyle, 'pages'), { recursive: true });
    fs.mkdirSync(path.join(workDirStyle, 'assets'), { recursive: true });
    // HTML with "Welcome to Acme" appearing both in regular text AND inside a <style> block
    fs.writeFileSync(
      path.join(workDirStyle, 'pages', 'page-0.html'),
      '<html><head><style>/* Welcome to Acme site */ .brand { color: red; }</style></head>' +
        '<body><h1>Welcome to Acme</h1></body></html>',
    );
    fs.writeFileSync(path.join(workDirStyle, 'assets', 'logo.svg'), '<svg></svg>');
    fs.writeFileSync(
      path.join(workDirStyle, 'manifest.json'),
      JSON.stringify({ pages: [{ url: 'https://test.example', htmlPath: 'pages/page-0.html', usedRenderer: 'static' }] }),
    );

    const profile: BrandProfile = { logoSrc: '../assets/logo.svg', dominantColors: [], brandName: 'Test' };
    const rebrand: RebrandResult = {
      colorPalette: [],
      copyChanges: { 'Welcome to Acme': 'Bem-vindo à Sorriso+' },
      logoSvg: '<svg></svg>',
    };

    const { rewrittenDir } = await rewriteSite(workDirStyle, profile, rebrand);

    const html = fs.readFileSync(path.join(rewrittenDir, 'pages', 'page-0.html'), 'utf-8');
    // The phrase should be replaced in the <h1> tag (normal content)
    expect(html).toContain('<h1>Bem-vindo à Sorriso+</h1>');
    // But should NOT be replaced inside the <style> block
    expect(html).toContain('/* Welcome to Acme site */'); // original comment should remain
    expect(html).not.toContain('/* Bem-vindo à Sorriso+ site */');

    fs.rmSync(workDirStyle, { recursive: true, force: true });
  });
});
