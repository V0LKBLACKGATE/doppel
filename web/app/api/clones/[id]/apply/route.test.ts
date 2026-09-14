import { describe, it, expect, vi } from 'vitest';
import * as pipeline from '@doppel/core/pipeline/index.js';
import { prisma } from '@doppel/core/db.js';
import { POST } from './route.js';

describe('/api/clones/[id]/apply', () => {
  it('persists edited suggestions before applying, then returns the export result', async () => {
    const updateSpy = vi.spyOn(prisma.cloneJob, 'update').mockResolvedValue({} as any);
    vi.spyOn(pipeline, 'applyAndExport').mockResolvedValue({ status: 'exportado', exportPath: '/tmp/job1/export.zip' } as any);

    const request = new Request('http://localhost/api/clones/job1/apply', {
      method: 'POST',
      body: JSON.stringify({ copyChanges: { Welcome: 'Bem-vindo (editado)' } }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'job1' }) });
    const body = await response.json();

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'job1' }, data: expect.objectContaining({ copyChanges: JSON.stringify({ Welcome: 'Bem-vindo (editado)' }) }) }),
    );
    expect(body).toEqual({ status: 'exportado', exportPath: '/tmp/job1/export.zip' });
  });

  it('returns 404 when applyAndExport cannot find the job', async () => {
    vi.spyOn(prisma.cloneJob, 'update').mockResolvedValue({} as any);
    vi.spyOn(pipeline, 'applyAndExport').mockRejectedValue(new Error('CloneJob not found: missing-job'));

    const request = new Request('http://localhost/api/clones/missing-job/apply', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'missing-job' }) });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: 'CloneJob not found: missing-job' });
  });

  it('returns 500 (not 404) when the failure is a real error rather than a missing job', async () => {
    // applyAndExport only relabels Prisma's genuine P2025 miss as "not found"; every other
    // failure keeps its own message, so this route can tell an outage from a bad id.
    vi.spyOn(prisma.cloneJob, 'update').mockResolvedValue({} as any);
    vi.spyOn(pipeline, 'applyAndExport').mockRejectedValue(new Error('database connection lost'));

    const request = new Request('http://localhost/api/clones/job1/apply', { method: 'POST', body: JSON.stringify({}) });
    const response = await POST(request, { params: Promise.resolve({ id: 'job1' }) });

    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('database connection lost');
  });
});
