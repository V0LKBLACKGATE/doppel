import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { fetchRenderedPage } from './rendered-page.js';

describe('fetchRenderedPage', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<html><body><div id="root"></div><script>
        document.getElementById('root').innerHTML = '<h1>Rendered</h1>';
      </script></body></html>`);
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });

  afterAll(() => server.close());

  it('returns the DOM after JS execution', async () => {
    const result = await fetchRenderedPage(baseUrl);
    expect(result.html).toContain('Rendered');
  }, 20000);
});
