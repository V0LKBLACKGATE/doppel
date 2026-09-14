import * as cheerio from 'cheerio';

export interface BrandProfile {
  logoSrc: string | null;
  dominantColors: string[];
  brandName: string | null;
}

const HEX_COLOR_RE = /#[0-9a-fA-F]{6}\b/g;
const NEAR_WHITE_BLACK = new Set(['#ffffff', '#000000']);

export function analyzeBrand(pages: { url: string; html: string }[]): BrandProfile {
  let logoSrc: string | null = null;
  let brandName: string | null = null;
  const colorCounts = new Map<string, number>();

  for (const page of pages) {
    const $ = cheerio.load(page.html);

    if (!logoSrc) {
      const logoImg = $('header img[src], img[alt*="logo" i], img.logo, img[src*="logo" i]').first();
      logoSrc = logoImg.attr('src') ?? null;
    }

    if (!brandName) {
      brandName = $('meta[property="og:site_name"]').attr('content')?.trim() || $('title').first().text().trim() || null;
    }

    const styleText = $('style').text() + ' ' + $('[style]').toArray().map((el) => $(el).attr('style')).join(' ');
    for (const match of styleText.matchAll(HEX_COLOR_RE)) {
      const hex = match[0].toLowerCase();
      if (NEAR_WHITE_BLACK.has(hex)) continue;
      colorCounts.set(hex, (colorCounts.get(hex) ?? 0) + 1);
    }
  }

  const dominantColors = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hex]) => hex);

  return { logoSrc, dominantColors, brandName };
}
