import { describe, it, expect, vi, afterEach } from 'vitest';
import { prisma } from '@doppel/core/db.js';
import * as pipeline from '@doppel/core/pipeline/index.js';
import { handleCloneSite, handleListClones, handleGetClonePreview, handleExportClone } from './tools.js';

afterEach(() => vi.restoreAllMocks());

describe('MCP tool handlers', () => {
  it('clone_site runs the pipeline and returns a preview URL when the job is ready for review', async () => {
    vi.spyOn(pipeline, 'runClonePipeline').mockResolvedValue({
      id: 'job1',
      status: 'pronto_para_revisao',
      previewPath: '/tmp/job1',
    } as any);

    const result = await handleCloneSite({ url: 'https://acme.example', brand_name: 'Sorriso+' });

    expect(result.jobId).toBe('job1');
    expect(result.status).toBe('pronto_para_revisao');
    expect(result.previewUrl).toBe('http://localhost:3000/jobs/job1');
  });

  it('list_clones reads job history from the database', async () => {
    vi.spyOn(prisma.cloneJob, 'findMany').mockResolvedValue([
      { id: 'job1', sourceUrl: 'https://acme.example', brandName: 'Sorriso+', status: 'exportado' },
    ] as any);

    const result = await handleListClones();
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].id).toBe('job1');
  });

  it('export_clone applies and exports a ready job', async () => {
    vi.spyOn(pipeline, 'applyAndExport').mockResolvedValue({ id: 'job1', status: 'exportado', exportPath: '/tmp/job1/export.zip' } as any);

    const result = await handleExportClone({ job_id: 'job1' });
    expect(result.zipPath).toBe('/tmp/job1/export.zip');
    expect(result.status).toBe('exportado');
  });

  it('get_clone_preview returns null previewUrl for a job with no previewPath yet', async () => {
    vi.spyOn(prisma.cloneJob, 'findUniqueOrThrow').mockResolvedValue({ id: 'job1', status: 'fetching', previewPath: null } as any);

    const result = await handleGetClonePreview({ job_id: 'job1' });
    expect(result.previewUrl).toBeNull();
    expect(result.status).toBe('fetching');
  });

  it('get_clone_preview answers with a clear message for an unknown job_id', async () => {
    const notFound = Object.assign(new Error('No CloneJob found'), { code: 'P2025' });
    vi.spyOn(prisma.cloneJob, 'findUniqueOrThrow').mockRejectedValue(notFound);

    const result = await handleGetClonePreview({ job_id: 'nope' });
    expect(result.previewUrl).toBeNull();
    expect((result as { message?: string }).message).toContain('nope');
  });

  it('get_clone_preview propagates a real database failure instead of calling it "not found"', async () => {
    vi.spyOn(prisma.cloneJob, 'findUniqueOrThrow').mockRejectedValue(new Error('database connection lost'));

    await expect(handleGetClonePreview({ job_id: 'job1' })).rejects.toThrow('database connection lost');
  });

  it('export_clone answers with a clear message for an unknown job_id', async () => {
    vi.spyOn(pipeline, 'applyAndExport').mockRejectedValue(new Error('CloneJob not found: nope'));

    const result = await handleExportClone({ job_id: 'nope' });
    expect(result.zipPath).toBeNull();
    expect((result as { message?: string }).message).toContain('nope');
  });

  it('export_clone propagates a real failure instead of calling it "not found"', async () => {
    vi.spyOn(pipeline, 'applyAndExport').mockRejectedValue(new Error('database connection lost'));

    await expect(handleExportClone({ job_id: 'job1' })).rejects.toThrow('database connection lost');
  });
});
