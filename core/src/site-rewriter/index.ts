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

  if (profile.logoSrc) {
    const logoFileName = path.basename(profile.logoSrc);
    const logoPath = path.join(rewrittenDir, 'assets', logoFileName);
    if (fs.existsSync(logoPath)) fs.writeFileSync(logoPath, rebrand.logoSvg, 'utf-8');
  }

  rewriteColorsInDir(path.join(rewrittenDir, 'assets'), colorMap, (name) => name.endsWith('.css'));
  rewritePagesDir(path.join(rewrittenDir, 'pages'), colorMap, rebrand.copyChanges);

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

function rewritePagesDir(pagesDir: string, colorMap: Map<string, string>, copyChanges: Record<string, string>): void {
  for (const name of fs.readdirSync(pagesDir)) {
    const filePath = path.join(pagesDir, name);
    let html = fs.readFileSync(filePath, 'utf-8');
    html = replaceColors(html, colorMap);

    const $ = cheerio.load(html);
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceCopyText(text: string, copyChanges: Record<string, string>): string {
  const keys = Object.keys(copyChanges).sort((a, b) => b.length - a.length);
  if (keys.length === 0) return text;

  const pattern = new RegExp(keys.map(escapeRegExp).join('|'), 'g');
  return text.replace(pattern, (matched) => copyChanges[matched]);
}

function replaceColors(content: string, colorMap: Map<string, string>): string {
  let result = content;
  for (const [oldHex, newHex] of colorMap) {
    result = result.replaceAll(new RegExp(oldHex + '(?![0-9a-fA-F])', 'gi'), newHex);
  }
  return result;
}
