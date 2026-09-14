import path from 'node:path';
import { prisma as defaultPrisma } from '../db.js';
import { fetchSiteViaDocker } from '../fetcher/docker-fetch.js';
import { analyzeBrand } from '../brand-analyzer/index.js';
import { extractCopyExcerpts, rebrandSite } from '../claude-rebrander/index.js';
import { rewriteSite } from '../site-rewriter/index.js';
import { exportSite } from '../exporter/index.js';
import type { PrismaClient } from '../../generated/prisma/index.js';
import type { CloneJob } from '../../generated/prisma/index.js';

export interface PipelineDeps {
  prisma?: PrismaClient;
  fetchSite?: typeof fetchSiteViaDocker;
  analyze?: typeof analyzeBrand;
  rebrand?: typeof rebrandSite;
  rewrite?: typeof rewriteSite;
  exportZip?: typeof exportSite;
}

const jobWorkDirs = new Map<string, string>();

export async function runClonePipeline(
  sourceUrl: string,
  brandName: string,
  niche: string | undefined,
  deps: PipelineDeps = {},
): Promise<CloneJob> {
  const prisma = deps.prisma ?? defaultPrisma;
  const fetchSite = deps.fetchSite ?? fetchSiteViaDocker;
  const analyze = deps.analyze ?? analyzeBrand;
  const rebrand = deps.rebrand ?? rebrandSite;

  let job: CloneJob;
  try {
    job = await prisma.cloneJob.create({ data: { sourceUrl, brandName, niche, status: 'fetching' } });
  } catch (err) {
    throw new Error(`Failed to create CloneJob: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const { workDir, pages } = await fetchSite(sourceUrl, 20);
    jobWorkDirs.set(job.id, workDir);
    job = await prisma.cloneJob.update({ where: { id: job.id }, data: { status: 'analyzing', previewPath: workDir } });

    const profile = analyze(pages);
    job = await prisma.cloneJob.update({
      where: { id: job.id },
      data: { status: 'rebranding', brandProfile: JSON.stringify(profile) },
    });

    const copyExcerpts = extractCopyExcerpts(pages);
    const rebrandResult = await rebrand(profile, copyExcerpts, brandName, niche);

    job = await prisma.cloneJob.update({
      where: { id: job.id },
      data: {
        status: 'pronto_para_revisao',
        colorPalette: JSON.stringify(rebrandResult.colorPalette),
        copyChanges: JSON.stringify(rebrandResult.copyChanges),
        logoSvg: rebrandResult.logoSvg,
      },
    });
    return job;
  } catch (err) {
    return prisma.cloneJob.update({
      where: { id: job.id },
      data: { status: 'erro', errorReason: err instanceof Error ? err.message : String(err) },
    });
  }
}

export async function applyAndExport(jobId: string, deps: PipelineDeps = {}): Promise<CloneJob> {
  const prisma = deps.prisma ?? defaultPrisma;
  const rewrite = deps.rewrite ?? rewriteSite;
  const exportZip = deps.exportZip ?? exportSite;

  let job: CloneJob;
  try {
    job = await prisma.cloneJob.findUniqueOrThrow({ where: { id: jobId } });
  } catch (err) {
    throw new Error(`CloneJob not found: ${jobId}`);
  }

  const workDir = jobWorkDirs.get(jobId) ?? job.previewPath;
  if (!workDir) {
    return prisma.cloneJob.update({ where: { id: jobId }, data: { status: 'erro', errorReason: 'work directory not found for job' } });
  }

  try {
    const profile = JSON.parse(job.brandProfile ?? '{"logoSrc":null,"dominantColors":[],"brandName":null}');
    const rebrandResult = {
      colorPalette: JSON.parse(job.colorPalette ?? '[]'),
      copyChanges: JSON.parse(job.copyChanges ?? '{}'),
      logoSvg: job.logoSvg ?? '',
    };
    const { rewrittenDir } = await rewrite(workDir, profile, rebrandResult);
    const { zipPath } = await exportZip(rewrittenDir, path.join(workDir, 'export.zip'));

    return prisma.cloneJob.update({
      where: { id: jobId },
      data: { status: 'exportado', previewPath: rewrittenDir, exportPath: zipPath },
    });
  } catch (err) {
    return prisma.cloneJob.update({
      where: { id: jobId },
      data: { status: 'erro', errorReason: err instanceof Error ? err.message : String(err) },
    });
  }
}
