import { prisma } from '@doppel/core/db.js';
import { runClonePipeline, applyAndExport, isRecordNotFoundError } from '@doppel/core/pipeline/index.js';

const WEB_BASE_URL = process.env.DOPPEL_WEB_URL ?? 'http://localhost:3000';

function notFoundMessage(jobId: string): string {
  return `Não encontrei nenhuma clonagem com o id "${jobId}". Use list_clones para ver os jobs existentes.`;
}

export async function handleCloneSite(input: { url: string; brand_name: string; niche?: string }) {
  const job = await runClonePipeline(input.url, input.brand_name, input.niche);
  const previewUrl = job.previewPath ? `${WEB_BASE_URL}/jobs/${job.id}` : null;
  const message =
    job.status === 'erro'
      ? `Não consegui clonar esse site: ${job.errorReason}`
      : `Pronto para revisão. Abra ${previewUrl} para revisar e editar a paleta, os textos e o logo antes de exportar.`;
  return { jobId: job.id, status: job.status, previewUrl, message };
}

export async function handleListClones() {
  const jobs = await prisma.cloneJob.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  return { jobs: jobs.map((j) => ({ id: j.id, sourceUrl: j.sourceUrl, brandName: j.brandName, status: j.status })) };
}

export async function handleGetClonePreview(input: { job_id: string }) {
  let job;
  try {
    job = await prisma.cloneJob.findUniqueOrThrow({ where: { id: input.job_id } });
  } catch (err) {
    // Same classification the web routes use (Prisma code P2025 = the row really is gone):
    // a bad job_id gets a friendly answer, while a genuine DB failure keeps propagating as
    // an error instead of being disguised as "no such job".
    if (isRecordNotFoundError(err)) {
      return { previewUrl: null, status: null, message: notFoundMessage(input.job_id) };
    }
    throw err;
  }
  return { previewUrl: job.previewPath ? `${WEB_BASE_URL}/jobs/${job.id}` : null, status: job.status };
}

export async function handleExportClone(input: { job_id: string }) {
  let job;
  try {
    job = await applyAndExport(input.job_id);
  } catch (err) {
    // applyAndExport already rewrites only the real P2025 miss into "CloneJob not found:
    // <id>"; anything else it rethrows untouched, so this check can't swallow a DB outage.
    const message = err instanceof Error ? err.message : String(err);
    if (isRecordNotFoundError(err) || message.includes('CloneJob not found')) {
      return { zipPath: null, status: null, message: notFoundMessage(input.job_id) };
    }
    throw err;
  }
  return { zipPath: job.exportPath ?? null, status: job.status };
}
