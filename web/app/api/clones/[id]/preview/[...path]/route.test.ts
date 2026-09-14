import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '@doppel/core/db.js';
import { GET } from './route.js';

describe('/api/clones/[id]/preview/[...path]', () => {
  let previewPath: string;

  beforeAll(() => {
    previewPath = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-preview-'));
    fs.mkdirSync(path.join(previewPath, 'pages'));
    fs.writeFileSync(path.join(previewPath, 'pages', 'page-0.html'), '<html>hi</html>');
  });

  afterAll(() => fs.rmSync(previewPath, { recursive: true, force: true }));

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
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
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
