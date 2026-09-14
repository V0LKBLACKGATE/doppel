import { describe, it, expect, vi } from 'vitest';
import * as pipeline from '@doppel/core/pipeline/index.js';
import { prisma } from '@doppel/core/db.js';
import { POST, GET } from './route.js';

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

  it('GET returns the job history ordered by newest first', async () => {
    vi.spyOn(prisma.cloneJob, 'findMany').mockResolvedValue([{ id: 'job1', status: 'exportado' }] as any);

    const response = await GET();
    const body = await response.json();
    expect(body.jobs).toHaveLength(1);
  });
});
