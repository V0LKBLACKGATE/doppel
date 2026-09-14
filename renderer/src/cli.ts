import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { crawlSite } from '@doppel/core/fetcher/crawl.js';

export interface CrawlCliArgs {
  url: string;
  maxPages: number;
  outDir: string;
}

const ASSET_SELECTORS: { selector: string; attr: string }[] = [
  { selector: 'link[rel="stylesheet"]', attr: 'href' },
  { selector: 'script[src]', attr: 'src' },
  { selector: 'img[src]', attr: 'src' },
];

export async function runCrawlCli(args: CrawlCliArgs): Promise<void> {
  const { url, maxPages, outDir } = args;
  const pagesDir = path.join(outDir, 'pages');
  const assetsDir = path.join(outDir, 'assets');
  fs.mkdirSync(pagesDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  const { pages } = await crawlSite(url, maxPages);
  const downloaded = new Map<string, string>(); // absolute asset URL -> local file name

  const manifest = {
    pages: await Promise.all(
      pages.map(async (page, i) => {
        const localizedHtml = await localizeAssets(page.html, page.url, assetsDir, downloaded);
        const fileName = `page-${i}.html`;
        fs.writeFileSync(path.join(pagesDir, fileName), localizedHtml, 'utf-8');
        return { url: page.url, htmlPath: path.join('pages', fileName), usedRenderer: page.usedRenderer };
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
          const res = await fetch(absoluteUrl);
          const buffer = Buffer.from(await res.arrayBuffer());
          const ext = path.extname(new URL(absoluteUrl).pathname) || guessExt(res.headers.get('content-type'));
          const localName = `${crypto.createHash('sha1').update(absoluteUrl).digest('hex')}${ext}`;
          fs.writeFileSync(path.join(assetsDir, localName), buffer);
          downloaded.set(absoluteUrl, localName);
        } catch {
          continue; // asset unreachable — leave the original attr untouched below
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
