import fs from 'node:fs';
import path from 'node:path';
import { notFound } from 'next/navigation';
import { prisma } from '@doppel/core/db.js';
import ReviewForm from './review-form';

// Next.js 15 Server Component pages receive dynamic segment params as a Promise
// (async APIs), not a plain object — same requirement as the API route handlers.
export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let job;
  try {
    job = await prisma.cloneJob.findUniqueOrThrow({ where: { id } });
  } catch (err) {
    // Only render Next's 404 page when the lookup itself says the job doesn't exist.
    // Prisma's findUniqueOrThrow throws a NotFoundError with message "No CloneJob
    // found" (code P2025) for a missing row — verified empirically against this
    // project's actual Prisma client (see the sibling export route for the same
    // check and reasoning). Anything else (a database outage, a dropped connection,
    // ...) is a real server error: rethrow it so Next's default error handling (or an
    // error boundary) surfaces it as an actual failure instead of a fake "not found",
    // which would otherwise hide the real problem from whoever debugs it later.
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('found')) {
      notFound();
    }
    throw err;
  }

  let pages: { url: string; htmlPath: string }[] = [];
  if (job.previewPath) {
    const manifestPath = path.join(job.previewPath, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      pages = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')).pages;
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <a href="/" className="text-sm text-neutral-400">
        ← voltar
      </a>
      <h1 className="mt-2 text-2xl font-semibold">{job.brandName}</h1>
      <p className="text-neutral-400">
        {job.sourceUrl} — status: <span className="font-mono">{job.status}</span>
      </p>
      {job.status === 'erro' && <p className="mt-4 rounded bg-red-950 px-4 py-3 text-red-300">{job.errorReason}</p>}

      {(job.status === 'pronto_para_revisao' || job.status === 'erro') && (
        <ReviewForm
          jobId={job.id}
          colorPalette={JSON.parse(job.colorPalette ?? '[]')}
          copyChanges={JSON.parse(job.copyChanges ?? '{}')}
          logoSvg={job.logoSvg ?? ''}
        />
      )}

      {job.status === 'exportado' && pages.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 flex flex-wrap gap-2">
            {pages.map((p, i) => (
              <a
                key={p.htmlPath}
                href={`/api/clones/${job.id}/preview/${p.htmlPath}`}
                target="doppel-preview-frame"
                className="rounded border border-neutral-700 px-3 py-1 text-xs"
              >
                Página {i + 1}
              </a>
            ))}
            <a href={`/api/clones/${job.id}/export`} className="ml-auto rounded bg-emerald-600 px-3 py-1 text-xs font-medium">
              Baixar .zip
            </a>
          </div>
          <iframe
            name="doppel-preview-frame"
            src={`/api/clones/${job.id}/preview/${pages[0].htmlPath}`}
            className="h-[70vh] w-full rounded border border-neutral-800 bg-white"
          />
        </div>
      )}
    </main>
  );
}
