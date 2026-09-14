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
 *  stylesheet/script/image and short enough that a dead host fails fast. */
export const ASSET_FETCH_TIMEOUT_MS = 15000;

const ASSET_SELECTORS: { selector: string; attr: string }[] = [
  { selector: 'link[rel="stylesheet"]', attr: 'href' },
  { selector: 'script[src]', attr: 'src' },
  { selector: 'img[src]', attr: 'src' },
];

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

  for (const { selector, attr } of ASSET_SELECTORS) {
    const elements = $(selector).toArray();
    for (const el of elements) {
      const raw = $(el).attr(attr);
      if (!raw) continue;
      let absoluteUrl: string;
      try {
        absoluteUrl = new URL(raw, pageUrl).toString();
      } catch {
        continue;
      }

      if (!downloaded.has(absoluteUrl)) {
        try {
          // A host that accepts the connection and then never answers would otherwise block
          // this page's asset loop indefinitely. A timeout aborts the fetch and lands in the
          // catch below, which is the same "failed asset" path as any other error.
          const res = await fetch(absoluteUrl, { signal: AbortSignal.timeout(assetTimeoutMs) });
          if (!res.ok) {
            continue; // asset returned HTTP error — leave the original attr untouched below
          }
          const buffer = Buffer.from(await res.arrayBuffer());
          const ext = path.extname(new URL(absoluteUrl).pathname) || guessExt(res.headers.get('content-type'));
          const localName = `${crypto.createHash('sha1').update(absoluteUrl).digest('hex')}${ext}`;
          fs.writeFileSync(path.join(assetsDir, localName), buffer);
          downloaded.set(absoluteUrl, localName);
        } catch {
          continue; // asset unreachable (network error) — leave the original attr untouched below
        }
      }

      const localName = downloaded.get(absoluteUrl);
      if (localName) $(el).attr(attr, `../assets/${localName}`);
    }
  }

  return $.html();
}

function guessExt(contentType: string | null): string {
  if (!contentType) return '.bin';
  if (contentType.includes('css')) return '.css';
  if (contentType.includes('javascript')) return '.js';
  if (contentType.includes('svg')) return '.svg';
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('jpeg')) return '.jpg';
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
