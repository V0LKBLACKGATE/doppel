import { describe, it, expect, afterAll, vi } from 'vitest';
import { prisma } from '../db.js';
import { runClonePipeline, applyAndExport } from './index.js';
import type { PipelineDeps } from './index.js';
import type { PrismaClient } from '../../generated/prisma/index.js';

const fakeDeps: PipelineDeps = {
  fetchSite: async () =>
    ({
      workDir: '/tmp/doppel-fake-job',
      pages: [{ url: 'https://acme.example', html: '<html><body><h1>Welcome to Acme</h1></body></html>', usedRenderer: 'static' }],
    }) as any,
  analyze: () => ({ logoSrc: null, dominantColors: ['#1b7964'], brandName: 'Acme' }),
  rebrand: async () => ({ colorPalette: ['#7c3aed'], copyChanges: { 'Welcome to Acme': 'Bem-vindo' }, logoSvg: '<svg/>' }),
  rewrite: async (workDir: string) => ({ rewrittenDir: `${workDir}/rewritten` }),
  exportZip: async (_dir: string, outZipPath: string) => ({ zipPath: outZipPath }),
};

describe('pipeline', () => {
  afterAll(() => prisma.$disconnect());

  it('runs fetch through rebrand and lands on pronto_para_revisao', async () => {
    const job = await runClonePipeline('https://acme.example', 'Sorriso+', 'clínica odontológica', fakeDeps);
    expect(job.status).toBe('pronto_para_revisao');
    expect(job.errorReason).toBeNull();
    expect(JSON.parse(job.colorPalette ?? '[]')).toEqual(['#7c3aed']);
  });

  it('sets status=erro with a reason when a stage throws', async () => {
    const failingDeps: PipelineDeps = { ...fakeDeps, fetchSite: async () => { throw new Error('site unreachable'); } };
    const job = await runClonePipeline('https://broken.example', 'Sorriso+', undefined, failingDeps);
    expect(job.status).toBe('erro');
    expect(job.errorReason).toContain('site unreachable');
  });

  it('applies and exports a job that is ready for review', async () => {
    const job = await runClonePipeline('https://acme.example', 'Sorriso+', undefined, fakeDeps);
    const exported = await applyAndExport(job.id, fakeDeps);
    expect(exported.status).toBe('exportado');
    expect(exported.exportPath).toBeTruthy();
  });

  it('rejects with a clear error when CloneJob creation fails', async () => {
    const mockPrisma = {
      cloneJob: {
        create: vi.fn().mockRejectedValue(new Error('database connection lost')),
      },
    } as unknown as PrismaClient;

    const depsWithFailingCreate: PipelineDeps = { ...fakeDeps, prisma: mockPrisma };
    await expect(runClonePipeline('https://acme.example', 'Sorriso+', undefined, depsWithFailingCreate)).rejects.toThrow(
      'Failed to create CloneJob: database connection lost',
    );
  });

  it('rejects with a clear error when CloneJob is not found in applyAndExport', async () => {
    await expect(applyAndExport('non-existent-job-id', fakeDeps)).rejects.toThrow('CloneJob not found: non-existent-job-id');
  });
});
