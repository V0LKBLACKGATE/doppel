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
    server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
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

  it('continues crawl on per-page fetch errors', async () => {
    let serverWithErrors: http.Server;
    let errorBaseUrl: string = '';

    await new Promise<void>((resolve) => {
      const pages: Record<string, string> = {
        '/robots.txt': 'User-agent: *\nDisallow:\n',
        '/': '<html><body><a href="/good1">Good1</a><a href="http://127.0.0.1:1">Error</a><a href="/good2">Good2</a></body></html>',
        '/good1': '<html><body>Good page 1.</body></html>',
        '/good2': '<html><body>Good page 2.</body></html>',
      };
      serverWithErrors = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
        const body = pages[req.url ?? ''];
        if (body) {
          res.setHeader('Content-Type', 'text/plain');
          res.end(body);
        } else {
          res.statusCode = 404;
          res.end();
        }
      });
      serverWithErrors.listen(0, () => {
        const address = serverWithErrors.address();
        errorBaseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
        resolve();
      });
    });

    const result = await crawlSite(errorBaseUrl, 20);
    const urls = result.pages.map((p) => p.url);

    // Should successfully fetch the root page and the two good pages
    expect(urls).toContain(`${errorBaseUrl}/`);
    expect(urls).toContain(`${errorBaseUrl}/good1`);
    expect(urls).toContain(`${errorBaseUrl}/good2`);
    // Should NOT include the error page (http://127.0.0.1:1 won't be reachable)
    expect(urls.every((u) => !u.includes(':1'))).toBe(true);
    // Should have 3 pages, not 0 (proving the crawl continued after the error)
    expect(result.pages.length).toBeGreaterThan(0);

    await new Promise<void>((resolve) => serverWithErrors.close(() => resolve()));
  });

  it('treats trailing-slash variants as the same page', async () => {
    let serverWithSlash: http.Server;
    let slashBaseUrl: string = '';

    await new Promise<void>((resolve) => {
      const pages: Record<string, string> = {
        '/robots.txt': 'User-agent: *\nDisallow:\n',
        '/': '<html><body><a href="/about/">About with slash</a><a href="/contact">Contact</a></body></html>',
        '/about': '<html><body>About page (no slash).</body></html>',
        '/about/': '<html><body>About page (with slash).</body></html>',
        '/contact': '<html><body><a href="/about">About without slash</a></body></html>',
      };
      serverWithSlash = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
        const body = pages[req.url ?? ''];
        if (body) {
          res.setHeader('Content-Type', 'text/plain');
          res.end(body);
        } else {
          res.statusCode = 404;
          res.end();
        }
      });
      serverWithSlash.listen(0, () => {
        const address = serverWithSlash.address();
        slashBaseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
        resolve();
      });
    });

    const result = await crawlSite(slashBaseUrl, 20);
    const urls = result.pages.map((p) => p.url);

    // Both `/about` and `/about/` should resolve to the same normalized URL
    const aboutUrls = urls.filter((u) => u.includes('/about'));
    expect(aboutUrls.length).toBe(1);
    expect(aboutUrls[0]).toBe(`${slashBaseUrl}/about`);

    await new Promise<void>((resolve) => serverWithSlash.close(() => resolve()));
  });
});
