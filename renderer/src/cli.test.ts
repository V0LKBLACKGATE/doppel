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
    const firstPagePath = path.join(outDir, manifest.pages[0].htmlPath);
    const pageHtml = fs.readFileSync(firstPagePath, 'utf-8');
    expect(pageHtml).toContain('Fixture page');
    expect(pageHtml).toMatch(/href="\.\.\/assets\/[^"]+\.css"/);

    const assetFiles = fs.readdirSync(path.join(outDir, 'assets'));
    expect(assetFiles.length).toBeGreaterThan(0);
    const cssContent = fs.readFileSync(path.join(outDir, 'assets', assetFiles[0]), 'utf-8');
    expect(cssContent).toContain('#1B7964');
  });
});
