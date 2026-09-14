import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolvePreviewFile, PREVIEW_CONTENT_TYPES } from './resolve.js';

describe('resolvePreviewFile', () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-preview-resolve-'));
    fs.mkdirSync(path.join(root, 'pages'));
    fs.writeFileSync(path.join(root, 'pages', 'page-0.html'), '<html>hi</html>');
    fs.mkdirSync(path.join(root, 'assets'));
    fs.writeFileSync(path.join(root, 'assets', 'photo.webp'), Buffer.from('fake'));

    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-preview-outside-'));
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'nope');
    if (process.platform !== 'win32') {
      fs.symlinkSync(path.join(outsideDir, 'secret.txt'), path.join(root, 'escape.txt'));
    }
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolves a file that exists inside the root', () => {
    const resolved = resolvePreviewFile(root, ['pages', 'page-0.html']);
    expect(resolved?.absolutePath).toBe(path.join(root, 'pages', 'page-0.html'));
    expect(resolved?.contentType).toBe(PREVIEW_CONTENT_TYPES['.html']);
  });

  it('maps known extensions to their content type', () => {
    const resolved = resolvePreviewFile(root, ['assets', 'photo.webp']);
    expect(resolved?.contentType).toBe('image/webp');
  });

  it('returns null for a path-traversal attempt', () => {
    expect(resolvePreviewFile(root, ['..', '..', 'etc', 'passwd'])).toBeNull();
  });

  it('returns null for a nonexistent file', () => {
    expect(resolvePreviewFile(root, ['pages', 'missing.html'])).toBeNull();
  });

  it.skipIf(process.platform === 'win32')('returns null for a symlink that escapes the root', () => {
    expect(resolvePreviewFile(root, ['escape.txt'])).toBeNull();
  });
});
