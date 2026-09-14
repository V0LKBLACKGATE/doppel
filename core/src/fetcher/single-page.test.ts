import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { fetchStaticPage } from './single-page.js';

describe('fetchStaticPage', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
      if (req.url === '/static') {
        res.end('<html><body><h1>Hello</h1><p>Real content here, plenty of it to read.</p></body></html>');
      } else if (req.url === '/spa') {
        res.end('<html><body><div id="root"></div><script src="/app.js"></script></body></html>');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });

  afterAll(() => server.close());

  it('returns isThin=false for a static content page', async () => {
    const result = await fetchStaticPage(`${baseUrl}/static`);
    expect(result.isThin).toBe(false);
    expect(result.html).toContain('Hello');
  });

  it('returns isThin=true for a near-empty SPA shell', async () => {
    const result = await fetchStaticPage(`${baseUrl}/spa`);
    expect(result.isThin).toBe(true);
  });
});
