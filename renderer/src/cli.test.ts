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
