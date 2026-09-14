import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { exportSite } from './index.js';

describe('exportSite', () => {
  let rewrittenDir: string;
  let outZipPath: string;

  beforeAll(() => {
    rewrittenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-export-'));
    fs.mkdirSync(path.join(rewrittenDir, 'pages'));
    fs.writeFileSync(path.join(rewrittenDir, 'pages', 'page-0.html'), '<html>rewritten</html>');
    outZipPath = path.join(rewrittenDir, '..', 'export.zip');
  });

  afterAll(() => {
    fs.rmSync(rewrittenDir, { recursive: true, force: true });
    fs.rmSync(outZipPath, { force: true });
  });

  it('creates a zip containing the rewritten site files', async () => {
    const { zipPath } = await exportSite(rewrittenDir, outZipPath);
    expect(fs.existsSync(zipPath)).toBe(true);

    const zip = new AdmZip(zipPath);
    const entryNames = zip.getEntries().map((e) => e.entryName);
    expect(entryNames).toContain('pages/page-0.html');
  });
});
