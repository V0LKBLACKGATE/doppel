import * as cheerio from 'cheerio';

export interface BrandProfile {
  logoSrc: string | null;
  dominantColors: string[];
  brandName: string | null;
}

const HEX_COLOR_RE = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
const NEAR_WHITE_BLACK = new Set(['#ffffff', '#000000']);

/**
 * Normalize 3-digit hex shorthand to 6-digit form.
 * E.g., #0bf → #00bbff (each digit doubles)
 */
function normalize3DigitHex(hex3: string): string {
  if (hex3.length !== 4) return hex3; // Already 6-digit or invalid
  return '#' + hex3.slice(1).split('').map((d) => d + d).join('');
}

export function analyzeBrand(pages: { url: string; html: string }[]): BrandProfile {
  let logoSrc: string | null = null;
  let brandName: string | null = null;
  const colorCounts = new Map<string, number>();

  // Logo selector priority: prefer explicit alt/class, fall back to header context
  const logoSelectors = [
    'img[alt*="logo" i]',
    'img.logo',
    'img[class*="logo" i]',
    'header img[src]',
    'img[src*="logo" i]',
  ];

  for (const page of pages) {
    const $ = cheerio.load(page.html);

    if (!logoSrc) {
      // Try selectors in priority order; use first one with a match
      for (const selector of logoSelectors) {
        const logoImg = $(selector).first();
        if (logoImg.length > 0) {
          logoSrc = logoImg.attr('src') ?? null;
          if (logoSrc) break;
        }
      }
    }

    if (!brandName) {
      brandName = $('meta[property="og:site_name"]').attr('content')?.trim() || $('title').first().text().trim() || null;
    }

    const styleText = $('style').text() + ' ' + $('[style]').toArray().map((el) => $(el).attr('style')).join(' ');
    for (const match of styleText.matchAll(HEX_COLOR_RE)) {
      let hex = match[0].toLowerCase();
      // Normalize 3-digit hex to 6-digit
      if (hex.length === 4) {
        hex = normalize3DigitHex(hex);
      }
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
