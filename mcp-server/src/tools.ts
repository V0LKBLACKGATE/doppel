import { prisma } from '@doppel/core/db.js';
import { runClonePipeline, applyAndExport } from '@doppel/core/pipeline/index.js';

const WEB_BASE_URL = process.env.DOPPEL_WEB_URL ?? 'http://localhost:3000';

export async function handleCloneSite(input: { url: string; brand_name: string; niche?: string }) {
  const job = await runClonePipeline(input.url, input.brand_name, input.niche);
  const previewUrl = job.previewPath ? `${WEB_BASE_URL}/jobs/${job.id}` : null;
  const message =
    job.status === 'erro'
      ? `Não consegui clonar esse site: ${job.errorReason}`
      : `Pronto para revisão. Abra ${previewUrl} para comparar lado a lado e aprovar.`;
  return { jobId: job.id, status: job.status, previewUrl, message };
}

export async function handleListClones() {
  const jobs = await prisma.cloneJob.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  return { jobs: jobs.map((j) => ({ id: j.id, sourceUrl: j.sourceUrl, brandName: j.brandName, status: j.status })) };
}

export async function handleGetClonePreview(input: { job_id: string }) {
  const job = await prisma.cloneJob.findUniqueOrThrow({ where: { id: input.job_id } });
  return { previewUrl: job.previewPath ? `${WEB_BASE_URL}/jobs/${job.id}` : null, status: job.status };
}

export async function handleExportClone(input: { job_id: string }) {
  const job = await applyAndExport(input.job_id);
  return { zipPath: job.exportPath ?? null, status: job.status };
}
