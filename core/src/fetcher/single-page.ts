import * as cheerio from 'cheerio';

const THIN_TEXT_THRESHOLD = 200;

export async function fetchStaticPage(url: string): Promise<{ html: string; isThin: boolean }> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'DoppelBot/0.1 (+https://github.com/V0LKBLACKGATE/doppel)' },
  });
  const html = await response.text();
  const $ = cheerio.load(html);
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const scriptCount = $('script[src]').length;
  const isThin = bodyText.length < THIN_TEXT_THRESHOLD && scriptCount > 0;
  return { html, isThin };
}
