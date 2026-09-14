import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import type { BrandProfile } from '../brand-analyzer/index.js';
import type { RebrandResult } from '../claude-rebrander/index.js';

export async function rewriteSite(
  workDir: string,
  profile: BrandProfile,
  rebrand: RebrandResult,
): Promise<{ rewrittenDir: string }> {
  const rewrittenDir = path.join(workDir, 'rewritten');
  fs.rmSync(rewrittenDir, { recursive: true, force: true });
  fs.cpSync(path.join(workDir, 'pages'), path.join(rewrittenDir, 'pages'), { recursive: true });
  fs.cpSync(path.join(workDir, 'assets'), path.join(rewrittenDir, 'assets'), { recursive: true });
  const manifestSrc = path.join(workDir, 'manifest.json');
  if (fs.existsSync(manifestSrc)) fs.copyFileSync(manifestSrc, path.join(rewrittenDir, 'manifest.json'));

  const colorMap = new Map<string, string>();
  profile.dominantColors.forEach((oldHex, i) => {
    const newHex = rebrand.colorPalette[i];
    if (newHex) colorMap.set(oldHex.toLowerCase(), newHex);
  });

  // The rebrand always produces an SVG logo. If the ORIGINAL logo file wasn't an SVG
  // (most real sites use .png/.jpg/.webp), writing SVG markup into that file would leave a
  // file named e.g. `logo.png` whose bytes are `<svg>...</svg>` — a broken image in every
  // browser. Write to a .svg sibling instead and remember the rename so the pages that
  // reference the old filename can be pointed at the new one below.
  let logoRename: { from: string; to: string } | null = null;
  if (profile.logoSrc) {
    const logoFileName = path.basename(profile.logoSrc.split('?')[0].split('#')[0]);
    const logoPath = path.join(rewrittenDir, 'assets', logoFileName);
    if (fs.existsSync(logoPath)) {
      const ext = path.extname(logoFileName);
      if (ext.toLowerCase() === '.svg') {
        fs.writeFileSync(logoPath, rebrand.logoSvg, 'utf-8');
      } else {
        const svgFileName = `${path.basename(logoFileName, ext)}.svg`;
        fs.writeFileSync(path.join(rewrittenDir, 'assets', svgFileName), rebrand.logoSvg, 'utf-8');
        logoRename = { from: logoFileName, to: svgFileName };
      }
    }
  }

  rewriteColorsInDir(path.join(rewrittenDir, 'assets'), colorMap, (name) => name.endsWith('.css'));
  rewritePagesDir(path.join(rewrittenDir, 'pages'), colorMap, rebrand.copyChanges, logoRename);

  return { rewrittenDir };
}

function rewriteColorsInDir(dir: string, colorMap: Map<string, string>, matches: (fileName: string) => boolean): void {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir, { recursive: true, encoding: 'utf-8' })) {
    if (!matches(name)) continue;
    const filePath = path.join(dir, name);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) continue;
    const content = fs.readFileSync(filePath, 'utf-8');
    fs.writeFileSync(filePath, replaceColors(content, colorMap), 'utf-8');
  }
}

function rewritePagesDir(
  pagesDir: string,
  colorMap: Map<string, string>,
  copyChanges: Record<string, string>,
  logoRename: { from: string; to: string } | null = null,
): void {
  for (const name of fs.readdirSync(pagesDir)) {
    const filePath = path.join(pagesDir, name);
    let html = fs.readFileSync(filePath, 'utf-8');
    html = replaceColors(html, colorMap);

    const $ = cheerio.load(html);
    if (logoRename) rewriteLogoReferences($, logoRename);
    $('*')
      .contents()
      .each((_, node) => {
        if (node.type !== 'text') return;
        const textNode = node as unknown as { data: string };

        // Skip text nodes inside <style> or <script> elements
        const parentElement = (node as unknown as { parent: unknown }).parent as unknown as { name?: string };
        if (parentElement?.name === 'style' || parentElement?.name === 'script') return;

        textNode.data = replaceCopyText(textNode.data, copyChanges);
      });

    fs.writeFileSync(filePath, $.html(), 'utf-8');
  }
}

/**
 * Point every reference to the OLD logo file at the new `.svg` file written next to it.
 * Only runs when the original logo wasn't already an SVG (see rewriteSite): otherwise the
 * page would keep loading e.g. `logo.png`, which no longer holds a usable image.
 * Both `src` and `srcset` are handled — a responsive logo commonly appears in both.
 */
function rewriteLogoReferences($: cheerio.CheerioAPI, rename: { from: string; to: string }): void {
  $('img').each((_, el) => {
    const src = $(el).attr('src');
    if (src && path.posix.basename(src.split('?')[0].split('#')[0]) === rename.from) {
      $(el).attr('src', src.replace(rename.from, rename.to));
    }

    const srcset = $(el).attr('srcset');
    if (srcset && srcset.includes(rename.from)) {
      $(el).attr('srcset', srcset.split(rename.from).join(rename.to));
    }
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceCopyText(text: string, copyChanges: Record<string, string>): string {
  const keys = Object.keys(copyChanges).sort((a, b) => b.length - a.length);
  if (keys.length === 0) return text;

  const pattern = new RegExp(keys.map(escapeRegExp).join('|'), 'g');
  return text.replace(pattern, (matched) => copyChanges[matched]);
}

/**
 * If a 6-digit hex could have come from 3-digit shorthand (each pair is a doubled digit,
 * e.g. `#00bbff` ← `#0bf`), return that shorthand; otherwise null.
 *
 * brand-analyzer normalizes every shorthand color it finds to the 6-digit form before it
 * reaches dominantColors, but the page/CSS source still contains the ORIGINAL shorthand.
 * Searching only for the normalized form would therefore never match anything, and the
 * color would be silently left unchanged in the output.
 */
function shorthandForm(hex6: string): string | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex6)) return null;
  const d = hex6.slice(1).toLowerCase();
  if (d[0] !== d[1] || d[2] !== d[3] || d[4] !== d[5]) return null;
  return `#${d[0]}${d[2]}${d[4]}`;
}

function replaceColors(content: string, colorMap: Map<string, string>): string {
  let result = content;
  for (const [oldHex, newHex] of colorMap) {
    // Match the normalized 6-digit form OR (when applicable) the 3-digit shorthand it was
    // normalized from. The 6-digit alternative comes first so it wins when both could
    // match. The shared negative lookahead is the existing boundary guard that keeps
    // 8-digit alpha hex (`#1b7964aa`, `#0bfd`) from being partially rewritten.
    const short = shorthandForm(oldHex);
    const alternatives = short ? [escapeRegExp(oldHex), escapeRegExp(short)] : [escapeRegExp(oldHex)];
    result = result.replaceAll(new RegExp(`(?:${alternatives.join('|')})(?![0-9a-fA-F])`, 'gi'), newHex);
  }
  return result;
}
