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

  const readManifest = (dir: string | null): { url: string; htmlPath: string }[] => {
    if (!dir) return [];
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return [];
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')).pages;
  };

  // sourcePreviewPath is set once right after fetch and never overwritten, so the ORIGINAL
  // crawled site stays previewable even after export moves previewPath on to the rebranded
  // output — this is what actually lets you SEE what got cloned, not just edit hex codes blind.
  const sourcePages = readManifest(job.sourcePreviewPath);
  const outputPages = job.status === 'exportado' ? readManifest(job.previewPath) : [];

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

      {job.status === 'exportado' && outputPages.length > 0 && (
        <div className="mt-6 flex justify-end">
          <a href={`/api/clones/${job.id}/export`} className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium">
            Baixar .zip
          </a>
        </div>
      )}

      {(sourcePages.length > 0 || outputPages.length > 0) && (
        <div className={`mt-4 grid gap-6 ${outputPages.length > 0 ? 'md:grid-cols-2' : ''}`}>
          {sourcePages.length > 0 && (
            <PreviewPane
              jobId={job.id}
              label={outputPages.length > 0 ? 'Original' : 'Site clonado'}
              kind="source"
              pages={sourcePages}
              frameName={`doppel-preview-source-${job.id}`}
            />
          )}
          {outputPages.length > 0 && (
            <PreviewPane
              jobId={job.id}
              label="Rebrand"
              kind="output"
              pages={outputPages}
              frameName={`doppel-preview-output-${job.id}`}
            />
          )}
        </div>
      )}
    </main>
  );
}

function PreviewPane({
  jobId,
  label,
  kind,
  pages,
  frameName,
}: {
  jobId: string;
  label: string;
  kind: 'source' | 'output';
  pages: { url: string; htmlPath: string }[];
  frameName: string;
}) {
  const previewUrl = (htmlPath: string) => `/api/clones/${jobId}/preview/${htmlPath}${kind === 'source' ? '?kind=source' : ''}`;

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium text-neutral-400">{label}</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        {pages.map((p, i) => (
          <a
            key={p.htmlPath}
            href={previewUrl(p.htmlPath)}
            target={frameName}
            className="rounded border border-neutral-700 px-3 py-1 text-xs"
          >
            Página {i + 1}
          </a>
        ))}
      </div>
      {/* The preview renders a CLONED third-party site: its original HTML and its own
          downloaded/localized JS. Served from /api/clones/... it would otherwise run at
          the exact same origin as Doppel itself (localhost:3000), where a hostile script
          in the cloned page could call Doppel's own API routes with the viewer's session.
          `sandbox="allow-scripts"` (deliberately WITHOUT allow-same-origin) puts the frame
          in an opaque origin: scripts still run, so the clone still looks right, but it
          can't touch the parent's cookies/storage/DOM, call our API as the user, or
          navigate the top-level page. The preview route sends a matching CSP header. */}
      <iframe
        name={frameName}
        sandbox="allow-scripts"
        src={previewUrl(pages[0].htmlPath)}
        className="h-[70vh] w-full rounded border border-neutral-800 bg-white"
      />
    </div>
  );
}
