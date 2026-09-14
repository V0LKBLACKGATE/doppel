import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { fetchStaticPage } from './single-page.js';
import { fetchRenderedPage } from './rendered-page.js';

export interface CrawledPage {
  url: string;
  html: string;
  usedRenderer: 'static' | 'headless';
}

export interface CrawlResult {
  pages: CrawledPage[];
}

export async function crawlSite(startUrl: string, maxPages = 20): Promise<CrawlResult> {
  const origin = new URL(startUrl).origin;
  const robots = await loadRobots(origin);

  const visited = new Set<string>();
  const queue: string[] = [normalize(startUrl)];
  const pages: CrawledPage[] = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    if (!robots.isAllowed(url, 'DoppelBot')) continue;

    const { html, isThin } = await fetchStaticPage(url);
    const finalHtml = isThin ? (await fetchRenderedPage(url)).html : html;
    pages.push({ url, html: finalHtml, usedRenderer: isThin ? 'headless' : 'static' });

    for (const link of extractSameDomainLinks(finalHtml, url, origin)) {
      if (!visited.has(link)) queue.push(link);
    }
  }

  return { pages };
}

async function loadRobots(origin: string) {
  try {
    const res = await fetch(`${origin}/robots.txt`);
    const body = res.ok ? await res.text() : '';
    return robotsParser(`${origin}/robots.txt`, body);
  } catch {
    return robotsParser(`${origin}/robots.txt`, '');
  }
}

function extractSameDomainLinks(html: string, pageUrl: string, origin: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const resolved = new URL(href, pageUrl);
      if (resolved.origin === origin) links.push(normalize(resolved.toString()));
    } catch {
      // ignore malformed hrefs
    }
  });
  return links;
}

function normalize(url: string): string {
  const u = new URL(url);
  u.hash = '';
  return u.toString();
}
