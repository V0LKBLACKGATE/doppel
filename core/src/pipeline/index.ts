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

/**
 * True only for Prisma's genuine "record does not exist" error.
 *
 * `findUniqueOrThrow` rejects with a PrismaClientKnownRequestError subclass carrying
 * `code === 'P2025'` (verified against this project's generated client: class NotFoundError,
 * code P2025, message "No CloneJob found"). Checking the code — rather than the message, or
 * treating every failure as a miss — is what keeps a real database outage from being
 * reported to callers as "job not found", which the web/MCP layers translate into a 404.
 *
 * Exported so the MCP tool handlers classify errors exactly the way the web routes do.
 */
export function isRecordNotFoundError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2025';
}

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
    job = await prisma.cloneJob.update({
      where: { id: job.id },
      data: { status: 'analyzing', previewPath: workDir, sourcePreviewPath: workDir },
    });

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
    // Only relabel a genuine missing row. Blindly rewriting every failure as "not found"
    // would make a database outage during this lookup indistinguishable from a bad job id,
    // and callers classify on that wording (the apply route turns "not found" into a 404) —
    // so a real outage would be reported to the user as a 404 instead of a 500.
    if (isRecordNotFoundError(err)) throw new Error(`CloneJob not found: ${jobId}`);
    throw err;
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
