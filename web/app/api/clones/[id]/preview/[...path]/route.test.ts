import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '@doppel/core/db.js';
import { GET } from './route.js';

describe('/api/clones/[id]/preview/[...path]', () => {
  let previewPath: string;
  let sourcePreviewPath: string;

  beforeAll(() => {
    previewPath = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-preview-'));
    fs.mkdirSync(path.join(previewPath, 'pages'));
    fs.writeFileSync(path.join(previewPath, 'pages', 'page-0.html'), '<html>hi</html>');
    fs.mkdirSync(path.join(previewPath, 'assets'));
    fs.writeFileSync(path.join(previewPath, 'assets', 'photo.webp'), Buffer.from('fake-webp-bytes'));
    fs.writeFileSync(path.join(previewPath, 'assets', 'brand.woff2'), Buffer.from('fake-woff2-bytes'));

    sourcePreviewPath = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-source-preview-'));
    fs.mkdirSync(path.join(sourcePreviewPath, 'pages'));
    fs.writeFileSync(path.join(sourcePreviewPath, 'pages', 'page-0.html'), '<html>original</html>');
  });

  afterAll(() => {
    fs.rmSync(previewPath, { recursive: true, force: true });
    fs.rmSync(sourcePreviewPath, { recursive: true, force: true });
  });

  it('serves the original site when ?kind=source, even after previewPath has moved on to the rebranded output', async () => {
    vi.spyOn(prisma.cloneJob, 'findUniqueOrThrow').mockResolvedValue({ id: 'job1', previewPath, sourcePreviewPath } as any);

    const response = await GET(new Request('http://localhost/x?kind=source'), {
      params: Promise.resolve({ id: 'job1', path: ['pages', 'page-0.html'] }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<html>original</html>');
  });

  it('returns 404 for ?kind=source when the job has no sourcePreviewPath yet', async () => {
    vi.spyOn(prisma.cloneJob, 'findUniqueOrThrow').mockResolvedValue({ id: 'job1', previewPath, sourcePreviewPath: null } as any);

    const response = await GET(new Request('http://localhost/x?kind=source'), {
      params: Promise.resolve({ id: 'job1', path: ['pages', 'page-0.html'] }),
    });
    expect(response.status).toBe(404);
  });

  it('serves a file that exists inside previewPath', async () => {
    vi.spyOn(prisma.cloneJob, 'findUniqueOrThrow').mockResolvedValue({ id: 'job1', previewPath } as any);

    const response = await GET(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'job1', path: ['pages', 'page-0.html'] }) });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<html>hi</html>');
  });

  it('sandboxes the untrusted cloned content it serves', async () => {
    vi.spyOn(prisma.cloneJob, 'findUniqueOrThrow').mockResolvedValue({ id: 'job1', previewPath } as any);

    const response = await GET(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'job1', path: ['pages', 'page-0.html'] }) });

    const csp = response.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain('sandbox allow-scripts');
    // allow-same-origin would defeat the whole point: it would put the cloned site's own
    // scripts back on Doppel's origin, with access to our API routes.
    expect(csp).not.toContain('allow-same-origin');
    // ...and no default-src: it would cascade to style-src-elem/style-src-attr and strip the
    // cloned page's inline <style> blocks and style="..." attributes — exactly where the
    // rebranded palette is written, so the preview would render unstyled.
    expect(csp).not.toContain('default-src');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('serves image and font types that the renderer actually downloads, not just the original 6 extensions', async () => {
    vi.spyOn(prisma.cloneJob, 'findUniqueOrThrow').mockResolvedValue({ id: 'job1', previewPath } as any);

    const webpResponse = await GET(new Request('http://localhost/x'), {
      params: Promise.resolve({ id: 'job1', path: ['assets', 'photo.webp'] }),
    });
    expect(webpResponse.status).toBe(200);
    expect(webpResponse.headers.get('Content-Type')).toBe('image/webp');

    const fontResponse = await GET(new Request('http://localhost/x'), {
      params: Promise.resolve({ id: 'job1', path: ['assets', 'brand.woff2'] }),
    });
    expect(fontResponse.status).toBe(200);
    expect(fontResponse.headers.get('Content-Type')).toBe('font/woff2');
  });

  it('returns 404 for a path-traversal attempt', async () => {
    vi.spyOn(prisma.cloneJob, 'findUniqueOrThrow').mockResolvedValue({ id: 'job1', previewPath } as any);

    const response = await GET(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'job1', path: ['..', '..', 'etc', 'passwd'] }) });
    expect(response.status).toBe(404);
  });

  it('returns 404 when the job id does not exist', async () => {
    vi.spyOn(prisma.cloneJob, 'findUniqueOrThrow').mockRejectedValue(new Error('No CloneJob found'));

    const response = await GET(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'missing-job', path: ['pages', 'page-0.html'] }) });
    expect(response.status).toBe(404);
  });
});
