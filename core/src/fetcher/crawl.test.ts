import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { crawlSite } from './crawl.js';

describe('crawlSite', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const pages: Record<string, string> = {
      '/robots.txt': 'User-agent: *\nDisallow: /private\n',
      '/': '<html><body><a href="/about">About</a><a href="/private">Private</a><a href="https://external.example/x">External</a></body></html>',
      '/about': '<html><body>About page content here for real.</body></html>',
      '/private': '<html><body>Should never be fetched.</body></html>',
    };
    server = http.createServer((req, res) => {
      const body = pages[req.url ?? ''];
      if (body) {
        res.setHeader('Content-Type', 'text/plain');
        res.end(body);
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });

  afterAll(() => server.close());

  it('follows same-domain links, respects robots.txt, skips external links', async () => {
    const result = await crawlSite(baseUrl, 20);
    const urls = result.pages.map((p) => p.url);
    expect(urls).toContain(`${baseUrl}/`);
    expect(urls).toContain(`${baseUrl}/about`);
    expect(urls).not.toContain(`${baseUrl}/private`);
    expect(urls.every((u) => u.startsWith(baseUrl))).toBe(true);
  });

  it('caps the crawl at maxPages', async () => {
    const result = await crawlSite(baseUrl, 1);
    expect(result.pages.length).toBeLessThanOrEqual(1);
  });
});
