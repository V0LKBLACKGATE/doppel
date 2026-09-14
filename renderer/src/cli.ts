import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { crawlSite } from '@doppel/core/fetcher/crawl.js';

export interface CrawlCliArgs {
  url: string;
  maxPages: number;
  outDir: string;
  /** Per-asset download ceiling; overridable so tests don't have to wait the real one out. */
  assetTimeoutMs?: number;
}

/** A single hanging asset host must not stall the whole crawl. 15s is generous for a
 *  stylesheet/script/image/font and short enough that a dead host fails fast. */
export const ASSET_FETCH_TIMEOUT_MS = 15000;

// Plain single-URL attributes: downloaded as-is, no content rewriting needed.
const SIMPLE_ASSET_SELECTORS: { selector: string; attr: string }[] = [
  { selector: 'script[src]', attr: 'src' },
  { selector: 'img[src]', attr: 'src' },
  { selector: 'source[src]', attr: 'src' }, // <picture>/<video>/<audio> fallback
  { selector: 'link[rel="icon"]', attr: 'href' },
  { selector: 'link[rel="apple-touch-icon"]', attr: 'href' },
];

// srcset: comma-separated "url descriptor" pairs (responsive images) — each URL needs its
// own localization pass, not a single-attribute download.
const SRCSET_SELECTORS: { selector: string; attr: string }[] = [
  { selector: 'img[srcset]', attr: 'srcset' },
  { selector: 'source[srcset]', attr: 'srcset' },
];

// Common scroll-triggered lazy-load conventions: the real URL lives in one of these, with
// `src`/`srcset` left empty or absent until the site's own JS swaps it in on scroll — which
// never happens during a crawl. `data-src`/`data-srcset` (lazysizes.js and most frameworks,
// including this fixture site's VTEX storefront) come first since they're by far the most
// common; the rest are lower-traffic aliases seen in the wild, kept cheap to check.
const LAZY_SRC_ATTRS = ['data-src', 'data-lazy-src', 'data-original'];
const LAZY_SRCSET_ATTRS = ['data-srcset', 'data-lazy-srcset'];

// Matches CSS url(...) references (background images, @font-face src) in any quote style.
const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

export async function runCrawlCli(args: CrawlCliArgs): Promise<void> {
  const { url, maxPages, outDir } = args;
  const assetTimeoutMs = args.assetTimeoutMs ?? ASSET_FETCH_TIMEOUT_MS;
  const pagesDir = path.join(outDir, 'pages');
  const assetsDir = path.join(outDir, 'assets');
  fs.mkdirSync(pagesDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  const { pages } = await crawlSite(url, maxPages);
  const downloaded = new Map<string, string>(); // absolute asset URL -> local file name

  const manifest = {
    pages: await Promise.all(
      pages.map(async (page, i) => {
        const localizedHtml = await localizeAssets(page.html, page.url, assetsDir, downloaded, assetTimeoutMs);
        const fileName = `page-${i}.html`;
        fs.writeFileSync(path.join(pagesDir, fileName), localizedHtml, 'utf-8');
        // path.posix.join, not path.join: this value is concatenated straight into a URL by
        // the web app's preview links, so it must use forward slashes on every host OS.
        return { url: page.url, htmlPath: path.posix.join('pages', fileName), usedRenderer: page.usedRenderer };
      }),
    ),
  };

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}

async function localizeAssets(
  html: string,
  pageUrl: string,
  assetsDir: string,
  downloaded: Map<string, string>,
  assetTimeoutMs: number = ASSET_FETCH_TIMEOUT_MS,
): Promise<string> {
  const $ = cheerio.load(html);

  // Stylesheets need their CONTENT rewritten (url() refs to fonts/background images inside),
  // not just downloaded raw — handled separately from the plain single-URL attributes below.
  for (const el of $('link[rel="stylesheet"]').toArray()) {
    const raw = $(el).attr('href');
    if (!raw) continue;
    const absoluteUrl = resolveUrl(raw, pageUrl);
    if (!absoluteUrl) continue;

    if (!downloaded.has(absoluteUrl)) {
      const cssText = await fetchText(absoluteUrl, assetTimeoutMs);
      if (cssText !== null) {
        // url() refs inside a linked stylesheet are relative to THAT FILE's own URL, not the page's.
        const rewrittenCss = await localizeCssText(cssText, absoluteUrl, assetsDir, downloaded, assetTimeoutMs);
        writeLocalAsset(absoluteUrl, '.css', Buffer.from(rewrittenCss, 'utf-8'), assetsDir, downloaded);
      }
    }
    const localName = downloaded.get(absoluteUrl);
    if (localName) {
      $(el).attr('href', `../assets/${localName}`);
      // Real-world sites set crossorigin="anonymous" on assets served from their own CDN,
      // which makes the browser fetch them in CORS mode — requiring Access-Control-Allow-
      // Origin from whoever serves the file. Once localized, WE'RE the ones serving it (our
      // own preview route, no CORS headers sent), so a byte-correct file still fails to load
      // (natural size 0x0, no error surfaced) unless this is stripped. integrity (SRI) hashes
      // have the same failure shape on any content change. Neither serves a purpose once the
      // reference points at our own copy — stripped everywhere an asset gets localized below.
      $(el).removeAttr('crossorigin').removeAttr('integrity');
    }
  }

  // Inline <style> blocks: same url() rewriting, relative to the page's own URL.
  for (const el of $('style').toArray()) {
    const cssText = $(el).html();
    if (!cssText || !cssText.includes('url(')) continue;
    const rewrittenCss = await localizeCssText(cssText, pageUrl, assetsDir, downloaded, assetTimeoutMs);
    // cheerio/dom-serializer treats <style> content as raw text on output (not HTML-escaped),
    // matching how browsers parse it — .text() is the correct, non-corrupting way to set it.
    $(el).text(rewrittenCss);
  }

  // Inline style="..." attributes can carry url() too (e.g. inline background-image).
  for (const el of $('[style]').toArray()) {
    const styleText = $(el).attr('style');
    if (!styleText || !styleText.includes('url(')) continue;
    const rewritten = await localizeCssText(styleText, pageUrl, assetsDir, downloaded, assetTimeoutMs);
    $(el).attr('style', rewritten);
  }

  // Plain single-URL attributes: scripts, <img src>, <source src>, favicons.
  for (const { selector, attr } of SIMPLE_ASSET_SELECTORS) {
    for (const el of $(selector).toArray()) {
      const raw = $(el).attr(attr);
      if (!raw) continue;
      const absoluteUrl = resolveUrl(raw, pageUrl);
      if (!absoluteUrl) continue;
      const localName = await downloadRaw(absoluteUrl, assetsDir, downloaded, assetTimeoutMs);
      if (localName) {
        $(el).attr(attr, `../assets/${localName}`);
        $(el).removeAttr('crossorigin').removeAttr('integrity');
      }
    }
  }

  // srcset: responsive image variants — each URL in the comma-separated list is its own asset.
  for (const { selector, attr } of SRCSET_SELECTORS) {
    for (const el of $(selector).toArray()) {
      const raw = $(el).attr(attr);
      if (!raw) continue;
      const rewritten = await localizeSrcset(raw, pageUrl, assetsDir, downloaded, assetTimeoutMs);
      $(el).attr(attr, rewritten);
      $(el).removeAttr('crossorigin').removeAttr('integrity');
    }
  }

  // Lazy-loaded images: many sites (this one included — it's a VTEX store) ship the real image
  // URL in a data-* attribute and leave src empty/absent until a scroll-triggered JS library
  // swaps it in. Our crawl never scrolls, so that swap never happens and img[src] alone misses
  // these entirely. Resolve the lazy attribute directly into BOTH the real attribute and the
  // data-* one, so the image shows up immediately in the exported clone without depending on
  // the original site's lazy-load script re-running correctly in a sandboxed iframe.
  for (const dataAttr of LAZY_SRC_ATTRS) {
    for (const el of $(`img[${dataAttr}]`).toArray()) {
      const raw = $(el).attr(dataAttr);
      if (!raw) continue;
      const absoluteUrl = resolveUrl(raw, pageUrl);
      if (!absoluteUrl) continue;
      const localName = await downloadRaw(absoluteUrl, assetsDir, downloaded, assetTimeoutMs);
      if (localName) {
        $(el).attr('src', `../assets/${localName}`);
        $(el).attr(dataAttr, `../assets/${localName}`);
        $(el).removeAttr('crossorigin').removeAttr('integrity');
      }
    }
  }
  for (const dataAttr of LAZY_SRCSET_ATTRS) {
    for (const el of $(`img[${dataAttr}], source[${dataAttr}]`).toArray()) {
      const raw = $(el).attr(dataAttr);
      if (!raw) continue;
      const rewritten = await localizeSrcset(raw, pageUrl, assetsDir, downloaded, assetTimeoutMs);
      $(el).attr('srcset', rewritten);
      $(el).attr(dataAttr, rewritten);
      $(el).removeAttr('crossorigin').removeAttr('integrity');
    }
  }

  return $.html();
}

async function localizeCssText(
  cssText: string,
  baseUrl: string,
  assetsDir: string,
  downloaded: Map<string, string>,
  assetTimeoutMs: number,
): Promise<string> {
  const matches = [...cssText.matchAll(CSS_URL_RE)];
  const seenRaw = new Set<string>();
  let result = cssText;
  for (const match of matches) {
    const [fullMatch, , rawUrl] = match;
    if (seenRaw.has(fullMatch) || rawUrl.startsWith('data:')) continue;
    seenRaw.add(fullMatch);
    const absoluteUrl = resolveUrl(rawUrl, baseUrl);
    if (!absoluteUrl) continue;
    const localName = await downloadRaw(absoluteUrl, assetsDir, downloaded, assetTimeoutMs);
    if (localName) {
      result = result.split(fullMatch).join(`url(../assets/${localName})`);
    }
  }
  return result;
}

async function localizeSrcset(
  srcsetValue: string,
  baseUrl: string,
  assetsDir: string,
  downloaded: Map<string, string>,
  assetTimeoutMs: number,
): Promise<string> {
  const entries = srcsetValue
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const rewritten: string[] = [];
  for (const entry of entries) {
    const [rawUrl, descriptor] = entry.split(/\s+/, 2);
    const absoluteUrl = resolveUrl(rawUrl, baseUrl);
    if (!absoluteUrl) {
      rewritten.push(entry);
      continue;
    }
    const localName = await downloadRaw(absoluteUrl, assetsDir, downloaded, assetTimeoutMs);
    const localUrl = localName ? `../assets/${localName}` : rawUrl;
    rewritten.push(descriptor ? `${localUrl} ${descriptor}` : localUrl);
  }
  return rewritten.join(', ');
}

async function downloadRaw(
  absoluteUrl: string,
  assetsDir: string,
  downloaded: Map<string, string>,
  assetTimeoutMs: number,
): Promise<string | null> {
  const cached = downloaded.get(absoluteUrl);
  if (cached) return cached;
  try {
    // A host that accepts the connection and then never answers would otherwise block this
    // page's asset loop indefinitely. A timeout aborts the fetch and lands in the catch below,
    // which is the same "failed asset" path as any other error.
    const res = await fetch(absoluteUrl, { signal: AbortSignal.timeout(assetTimeoutMs) });
    if (!res.ok) return null; // asset returned HTTP error — leave the original attr untouched
    const buffer = Buffer.from(await res.arrayBuffer());
    const ext = path.extname(new URL(absoluteUrl).pathname) || guessExt(res.headers.get('content-type'));
    return writeLocalAsset(absoluteUrl, ext, buffer, assetsDir, downloaded);
  } catch {
    return null; // asset unreachable (network error/timeout) — leave the original attr untouched
  }
}

async function fetchText(absoluteUrl: string, assetTimeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(absoluteUrl, { signal: AbortSignal.timeout(assetTimeoutMs) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function writeLocalAsset(
  absoluteUrl: string,
  ext: string,
  content: Buffer,
  assetsDir: string,
  downloaded: Map<string, string>,
): string {
  const localName = `${crypto.createHash('sha1').update(absoluteUrl).digest('hex')}${ext}`;
  fs.writeFileSync(path.join(assetsDir, localName), content);
  downloaded.set(absoluteUrl, localName);
  return localName;
}

function resolveUrl(raw: string, baseUrl: string): string | null {
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return null;
  }
}

function guessExt(contentType: string | null): string {
  if (!contentType) return '.bin';
  if (contentType.includes('css')) return '.css';
  if (contentType.includes('javascript')) return '.js';
  if (contentType.includes('svg')) return '.svg';
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('jpeg')) return '.jpg';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('gif')) return '.gif';
  if (contentType.includes('woff2')) return '.woff2';
  if (contentType.includes('woff')) return '.woff';
  if (contentType.includes('font')) return '.ttf';
  return '.bin';
}

function parseArgs(argv: string[]): CrawlCliArgs {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    if (i === -1 || i + 1 >= argv.length) throw new Error(`Missing ${flag}`);
    return argv[i + 1];
  };
  return { url: get('--url'), maxPages: Number(get('--maxPages')), outDir: get('--out') };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCrawlCli(parseArgs(process.argv.slice(2)))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
