import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '@doppel/core/db.js';
import { GET } from './route.js';

describe('/api/clones/[id]/export', () => {
  let zipPath: string;

  beforeAll(() => {
    zipPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-dl-')), 'export.zip');
    fs.writeFileSync(zipPath, Buffer.from('fake-zip-bytes'));
  });

  afterAll(() => fs.rmSync(path.dirname(zipPath), { recursive: true, force: true }));

  it('streams the export zip with a download-friendly content-disposition', async () => {
    vi.spyOn(prisma.cloneJob, 'findUniqueOrThrow').mockResolvedValue({ id: 'job1', brandName: 'Sorriso+', exportPath: zipPath } as any);

    const response = await GET(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'job1' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/zip');
    expect(response.headers.get('Content-Disposition')).toContain('Sorriso+');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('fake-zip-bytes');
  });

  it('returns 404 when the job has no export yet', async () => {
    vi.spyOn(prisma.cloneJob, 'findUniqueOrThrow').mockResolvedValue({ id: 'job1', brandName: 'Sorriso+', exportPath: null } as any);

    const response = await GET(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'job1' }) });
    expect(response.status).toBe(404);
  });

  it('returns 404 when the job id does not exist', async () => {
    vi.spyOn(prisma.cloneJob, 'findUniqueOrThrow').mockRejectedValue(new Error('No CloneJob found'));

    const response = await GET(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'missing-job' }) });
    expect(response.status).toBe(404);
  });
});
