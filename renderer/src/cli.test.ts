import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runCrawlCli } from './cli.js';

const execFileAsync = promisify(execFile);

describe('runCrawlCli', () => {
  let server: http.Server;
  let baseUrl: string;
  let outDir: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/style.css') {
        res.setHeader('Content-Type', 'text/css');
        res.end('body { color: #1B7964; }');
        return;
      }
      res.end(
        '<html><head><link rel="stylesheet" href="/style.css"></head><body><h1>Fixture page with enough text to not be thin.</h1></body></html>',
      );
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-cli-'));
  });

  afterAll(() => {
    server.close();
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it('writes manifest.json, page HTML files, and localizes linked assets', async () => {
    await runCrawlCli({ url: baseUrl, maxPages: 5, outDir });

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf-8'));
    expect(manifest.pages.length).toBeGreaterThan(0);

    // htmlPath is concatenated straight into a URL by the web app, so it must always use
    // forward slashes — including when the crawl runs on Windows.
    for (const page of manifest.pages) {
      expect(page.htmlPath).toMatch(/^pages\/page-\d+\.html$/);
      expect(page.htmlPath).not.toContain('\\');
    }

    const firstPagePath = path.join(outDir, manifest.pages[0].htmlPath);
    const pageHtml = fs.readFileSync(firstPagePath, 'utf-8');
    expect(pageHtml).toContain('Fixture page');
    expect(pageHtml).toMatch(/href="\.\.\/assets\/[^"]+\.css"/);

    const assetFiles = fs.readdirSync(path.join(outDir, 'assets'));
    expect(assetFiles.length).toBeGreaterThan(0);
    const cssContent = fs.readFileSync(path.join(outDir, 'assets', assetFiles[0]), 'utf-8');
    expect(cssContent).toContain('#1B7964');
  });

  it('localizes CSS url() references (background image, @font-face) inside a linked stylesheet', async () => {
    let outDirCss: string = '';
    let serverCss: http.Server;
    let baseUrlCss: string = '';

    await new Promise<void>((resolve) => {
      serverCss = http.createServer((req, res) => {
        if (req.url === '/theme.css') {
          res.setHeader('Content-Type', 'text/css');
          res.end(
            `@font-face { font-family: "Brand"; src: url('/fonts/brand.woff2') format('woff2'); }
             .hero { background-image: url("/img/hero-bg.jpg"); }`,
          );
          return;
        }
        if (req.url === '/fonts/brand.woff2') {
          res.setHeader('Content-Type', 'font/woff2');
          res.end(Buffer.from('fake-font-bytes'));
          return;
        }
        if (req.url === '/img/hero-bg.jpg') {
          res.setHeader('Content-Type', 'image/jpeg');
          res.end(Buffer.from('fake-jpeg-bytes'));
          return;
        }
        res.end(
          '<html><head><link rel="stylesheet" href="/theme.css"></head><body><h1>Page with a CSS background and a web font.</h1></body></html>',
        );
      });
      serverCss.listen(0, () => {
        const address = serverCss.address();
        baseUrlCss = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
        outDirCss = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-cli-cssurl-'));
        resolve();
      });
    });

    try {
      await runCrawlCli({ url: baseUrlCss, maxPages: 1, outDir: outDirCss });

      const manifest = JSON.parse(fs.readFileSync(path.join(outDirCss, 'manifest.json'), 'utf-8'));
      const pageHtml = fs.readFileSync(path.join(outDirCss, manifest.pages[0].htmlPath), 'utf-8');
      const stylesheetLocalName = pageHtml.match(/href="\.\.\/assets\/([^"]+\.css)"/)?.[1];
      expect(stylesheetLocalName).toBeTruthy();

      const cssContent = fs.readFileSync(path.join(outDirCss, 'assets', stylesheetLocalName!), 'utf-8');
      // The stylesheet's own url() references must now point at localized files, not the
      // original site — this is what makes the exported clone actually self-contained.
      expect(cssContent).toMatch(/url\(\.\.\/assets\/[0-9a-f]+\.woff2\)/);
      expect(cssContent).toMatch(/url\(\.\.\/assets\/[0-9a-f]+\.jpg\)/);
      expect(cssContent).not.toContain('/fonts/brand.woff2');
      expect(cssContent).not.toContain('/img/hero-bg.jpg');

      // Both referenced assets (font + background image) actually landed on disk.
      const assetFiles = fs.readdirSync(path.join(outDirCss, 'assets'));
      expect(assetFiles.some((f) => f.endsWith('.woff2'))).toBe(true);
      expect(assetFiles.some((f) => f.endsWith('.jpg'))).toBe(true);
    } finally {
      await new Promise<void>((resolve) => serverCss.close(() => resolve()));
      fs.rmSync(outDirCss, { recursive: true, force: true });
    }
  });

  it('localizes url() inside an inline <style> block and a srcset with multiple responsive variants', async () => {
    let outDirInline: string = '';
    let serverInline: http.Server;
    let baseUrlInline: string = '';

    await new Promise<void>((resolve) => {
      serverInline = http.createServer((req, res) => {
        if (req.url === '/img/small.jpg' || req.url === '/img/large.jpg') {
          res.setHeader('Content-Type', 'image/jpeg');
          res.end(Buffer.from(`fake-${req.url}`));
          return;
        }
        res.end(
          `<html><head><style>.banner { background: url(/img/small.jpg); }</style></head>
           <body>
             <h1>Page with an inline style background and a responsive image.</h1>
             <img src="/img/small.jpg" srcset="/img/small.jpg 480w, /img/large.jpg 1200w">
           </body></html>`,
        );
      });
      serverInline.listen(0, () => {
        const address = serverInline.address();
        baseUrlInline = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
        outDirInline = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-cli-inline-'));
        resolve();
      });
    });

    try {
      await runCrawlCli({ url: baseUrlInline, maxPages: 1, outDir: outDirInline });

      const manifest = JSON.parse(fs.readFileSync(path.join(outDirInline, 'manifest.json'), 'utf-8'));
      const pageHtml = fs.readFileSync(path.join(outDirInline, manifest.pages[0].htmlPath), 'utf-8');

      // Inline <style> url() localized, not left pointing at the original site.
      expect(pageHtml).toMatch(/<style>\.banner\s*\{\s*background:\s*url\(\.\.\/assets\/[0-9a-f]+\.jpg\)/);

      // srcset: both the 480w and 1200w variants localized independently, descriptors kept.
      const srcsetMatch = pageHtml.match(/srcset="([^"]+)"/);
      expect(srcsetMatch).toBeTruthy();
      const srcset = srcsetMatch![1];
      expect(srcset).toMatch(/\.\.\/assets\/[0-9a-f]+\.jpg 480w/);
      expect(srcset).toMatch(/\.\.\/assets\/[0-9a-f]+\.jpg 1200w/);

      // small.jpg is referenced 3 times (style url(), plain src, and srcset) but must only be
      // downloaded once — the same content-addressed dedup already proven for stylesheets.
      const assetFiles = fs.readdirSync(path.join(outDirInline, 'assets'));
      expect(assetFiles).toHaveLength(2); // small.jpg + large.jpg, not 4
    } finally {
      await new Promise<void>((resolve) => serverInline.close(() => resolve()));
      fs.rmSync(outDirInline, { recursive: true, force: true });
    }
  });

  it('resolves lazy-loaded images (data-src, left empty/absent until scroll-triggered JS runs) into a real localized src', async () => {
    let outDirLazy: string = '';
    let serverLazy: http.Server;
    let baseUrlLazy: string = '';

    await new Promise<void>((resolve) => {
      serverLazy = http.createServer((req, res) => {
        if (req.url === '/img/product.jpg') {
          res.setHeader('Content-Type', 'image/jpeg');
          res.end(Buffer.from('fake-product-bytes'));
          return;
        }
        res.end(
          `<html><body>
             <h1>Page with a lazy-loaded product image, VTEX-style.</h1>
             <img class="lazyload" alt="" data-src="/img/product.jpg" src="" loading="lazy">
           </body></html>`,
        );
      });
      serverLazy.listen(0, () => {
        const address = serverLazy.address();
        baseUrlLazy = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
        outDirLazy = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-cli-lazy-'));
        resolve();
      });
    });

    try {
      await runCrawlCli({ url: baseUrlLazy, maxPages: 1, outDir: outDirLazy });

      const manifest = JSON.parse(fs.readFileSync(path.join(outDirLazy, 'manifest.json'), 'utf-8'));
      const pageHtml = fs.readFileSync(path.join(outDirLazy, manifest.pages[0].htmlPath), 'utf-8');

      // The crawl never scrolls, so the site's own lazy-load JS never fires — src must be
      // resolved directly from data-src, not left empty, or the image is just broken.
      expect(pageHtml).toMatch(/<img[^>]*\ssrc="\.\.\/assets\/[0-9a-f]+\.jpg"/);
      expect(pageHtml).not.toMatch(/\ssrc=""/);

      const assetFiles = fs.readdirSync(path.join(outDirLazy, 'assets'));
      expect(assetFiles).toHaveLength(1);
      expect(assetFiles[0].endsWith('.jpg')).toBe(true);
    } finally {
      await new Promise<void>((resolve) => serverLazy.close(() => resolve()));
      fs.rmSync(outDirLazy, { recursive: true, force: true });
    }
  });

  it('strips crossorigin/integrity from elements whose asset got localized (they only apply to the original CDN, and break loading a same-preview-route copy)', async () => {
    let outDirCors: string = '';
    let serverCors: http.Server;
    let baseUrlCors: string = '';

    await new Promise<void>((resolve) => {
      serverCors = http.createServer((req, res) => {
        if (req.url === '/img/product.jpg') {
          res.setHeader('Content-Type', 'image/jpeg');
          res.end(Buffer.from('fake-product-bytes'));
          return;
        }
        res.end(
          `<html><body>
             <h1>Page with an image copied straight from the original site's markup.</h1>
             <img src="/img/product.jpg" crossorigin="anonymous" integrity="sha384-abc123">
           </body></html>`,
        );
      });
      serverCors.listen(0, () => {
        const address = serverCors.address();
        baseUrlCors = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
        outDirCors = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-cli-cors-'));
        resolve();
      });
    });

    try {
      await runCrawlCli({ url: baseUrlCors, maxPages: 1, outDir: outDirCors });

      const manifest = JSON.parse(fs.readFileSync(path.join(outDirCors, 'manifest.json'), 'utf-8'));
      const pageHtml = fs.readFileSync(path.join(outDirCors, manifest.pages[0].htmlPath), 'utf-8');

      expect(pageHtml).toContain('src="../assets/');
      expect(pageHtml).not.toContain('crossorigin');
      expect(pageHtml).not.toContain('integrity');
    } finally {
      await new Promise<void>((resolve) => serverCors.close(() => resolve()));
      fs.rmSync(outDirCors, { recursive: true, force: true });
    }
  });

  it('skips unreachable assets and preserves original href for 404s', async () => {
    let outDir404: string = '';
    let server404: http.Server;
    let baseUrl404: string = '';

    await new Promise<void>((resolve) => {
      server404 = http.createServer((req, res) => {
        if (req.url === '/good.css') {
          res.setHeader('Content-Type', 'text/css');
          res.end('body { color: green; }');
          return;
        }
        if (req.url === '/missing.css') {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }
        res.end(
          '<html><head><link rel="stylesheet" href="/good.css"><link rel="stylesheet" href="/missing.css"></head><body><h1>Page with missing asset.</h1></body></html>',
        );
      });
      server404.listen(0, () => {
        const address = server404.address();
        baseUrl404 = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
        outDir404 = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-cli-404-'));
        resolve();
      });
    });

    try {
      await runCrawlCli({ url: baseUrl404, maxPages: 5, outDir: outDir404 });

      const manifest = JSON.parse(fs.readFileSync(path.join(outDir404, 'manifest.json'), 'utf-8'));
      const pageHtml = fs.readFileSync(path.join(outDir404, manifest.pages[0].htmlPath), 'utf-8');

      // Good asset should be localized with relative path
      expect(pageHtml).toContain('href="../assets/');
      expect(pageHtml).toMatch(/href="\.\.\/assets\/[^"]+\.css"/);

      // Missing asset should NOT be converted to localized path
      expect(pageHtml).toContain('href="/missing.css"');
      // and the error response body should NOT be written to assets
      expect(pageHtml).not.toContain('Not Found');

      // Only the good asset should be in assets folder
      const assetFiles = fs.readdirSync(path.join(outDir404, 'assets'));
      expect(assetFiles.length).toBe(1);
      const cssContent = fs.readFileSync(path.join(outDir404, 'assets', assetFiles[0]), 'utf-8');
      expect(cssContent).toContain('green');
    } finally {
      await new Promise<void>((resolve) => server404.close(() => resolve()));
      fs.rmSync(outDir404, { recursive: true, force: true });
    }
  });

  it('times out a hanging asset host instead of stalling the crawl, keeping the original href', async () => {
    let outDirHang: string = '';
    let serverHang: http.Server;
    let baseUrlHang: string = '';
    const openResponses: http.ServerResponse[] = [];

    await new Promise<void>((resolve) => {
      serverHang = http.createServer((req, res) => {
        if (req.url === '/hangs.css') {
          // Accept the request and never answer — the exact failure mode a per-asset
          // timeout exists for.
          openResponses.push(res);
          return;
        }
        res.end(
          '<html><head><link rel="stylesheet" href="/hangs.css"></head><body><h1>Page whose stylesheet host hangs.</h1></body></html>',
        );
      });
      serverHang.listen(0, () => {
        const address = serverHang.address();
        baseUrlHang = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
        outDirHang = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-cli-hang-'));
        resolve();
      });
    });

    try {
      const started = Date.now();
      await runCrawlCli({ url: baseUrlHang, maxPages: 1, outDir: outDirHang, assetTimeoutMs: 150 });
      expect(Date.now() - started).toBeLessThan(10000); // returned, did not hang

      const manifest = JSON.parse(fs.readFileSync(path.join(outDirHang, 'manifest.json'), 'utf-8'));
      const pageHtml = fs.readFileSync(path.join(outDirHang, manifest.pages[0].htmlPath), 'utf-8');

      // Timed-out asset is treated like any other failed fetch: attribute left untouched.
      expect(pageHtml).toContain('href="/hangs.css"');
      expect(fs.readdirSync(path.join(outDirHang, 'assets'))).toHaveLength(0);
    } finally {
      for (const res of openResponses) res.destroy();
      await new Promise<void>((resolve) => serverHang.close(() => resolve()));
      fs.rmSync(outDirHang, { recursive: true, force: true });
    }
  });

});
