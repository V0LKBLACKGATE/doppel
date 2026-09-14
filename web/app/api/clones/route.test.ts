import { describe, it, expect, vi, afterEach } from 'vitest';
import * as pipeline from '@doppel/core/pipeline/index.js';
import { prisma } from '@doppel/core/db.js';
import { POST, GET } from './route.js';

afterEach(() => vi.restoreAllMocks());

describe('/api/clones', () => {
  it('POST creates a job by running the pipeline and returns its id/status', async () => {
    vi.spyOn(pipeline, 'runClonePipeline').mockResolvedValue({ id: 'job1', status: 'pronto_para_revisao' } as any);

    const request = new Request('http://localhost/api/clones', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://acme.example', brandName: 'Sorriso+', niche: 'odontologia' }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ jobId: 'job1', status: 'pronto_para_revisao' });
  });

  it('POST returns 400 for a malformed JSON body', async () => {
    const request = new Request('http://localhost/api/clones', { method: 'POST', body: 'not json at all' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeTruthy();
  });

  it('POST returns 400 when url or brandName is missing or blank', async () => {
    const missingUrl = await POST(
      new Request('http://localhost/api/clones', { method: 'POST', body: JSON.stringify({ brandName: 'Sorriso+' }) }),
    );
    expect(missingUrl.status).toBe(400);
    expect((await missingUrl.json()).error).toContain('url');

    const blankBrand = await POST(
      new Request('http://localhost/api/clones', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://acme.example', brandName: '   ' }),
      }),
    );
    expect(blankBrand.status).toBe(400);
    expect((await blankBrand.json()).error).toContain('brandName');
  });

  it('POST returns a clean 500 body when the pipeline throws', async () => {
    vi.spyOn(pipeline, 'runClonePipeline').mockRejectedValue(new Error('Failed to create CloneJob: database is locked'));

    const response = await POST(
      new Request('http://localhost/api/clones', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://acme.example', brandName: 'Sorriso+' }),
      }),
    );

    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('database is locked');
  });

  it('GET returns the job history ordered by newest first', async () => {
    vi.spyOn(prisma.cloneJob, 'findMany').mockResolvedValue([{ id: 'job1', status: 'exportado' }] as any);

    const response = await GET();
    const body = await response.json();
    expect(body.jobs).toHaveLength(1);
  });
});
