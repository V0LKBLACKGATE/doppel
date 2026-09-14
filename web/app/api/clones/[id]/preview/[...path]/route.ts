import fs from 'node:fs';
import { prisma } from '@doppel/core/db.js';
import { resolvePreviewFile } from '@doppel/core/preview/resolve.js';

// Next.js 15 Route Handlers receive dynamic segment params as a Promise (async APIs),
// not a plain object.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path: pathSegments } = await params;

  let job;
  try {
    job = await prisma.cloneJob.findUniqueOrThrow({ where: { id } });
  } catch {
    return new Response('Not found', { status: 404 });
  }

  // ?kind=source serves the ORIGINAL crawled site (job.sourcePreviewPath), which is set once
  // right after fetch and never overwritten. Default (no kind, or kind=output) keeps serving
  // job.previewPath — the rebranded output once exported, or the original before that.
  const kind = new URL(request.url).searchParams.get('kind');
  const previewPath = kind === 'source' ? job.sourcePreviewPath : job.previewPath;
  if (!previewPath) return new Response('Not found', { status: 404 });

  const resolved = resolvePreviewFile(previewPath, pathSegments);
  if (!resolved) return new Response('Not found', { status: 404 });

  return new Response(fs.readFileSync(resolved.absolutePath), {
    headers: {
      'Content-Type': resolved.contentType,
      // Everything served here is UNTRUSTED third-party content (a cloned site's own HTML,
      // CSS and JS). Without this it would execute same-origin with the Doppel app and could
      // drive our own API routes as the logged-in viewer. The CSP `sandbox` directive applies
      // the iframe sandbox at the response level, so the protection holds even if the file is
      // opened directly in a tab instead of through the sandboxed <iframe> on the job page.
      // `allow-scripts` is kept (and `allow-same-origin` deliberately is not) so the clone
      // still renders and behaves like the original while staying in an opaque origin.
      //
      // Deliberately NO `default-src`: without `'unsafe-inline'`, style-src-elem/style-src-attr
      // (and their script counterparts) fall back to it and the browser would drop every
      // <style> block and style="..." attribute in the cloned page. That is precisely where
      // this product's output lives — brand-analyzer reads dominantColors out of those inline
      // styles and site-rewriter writes the rebranded palette back into them — so a default-src
      // here would render the rebrand as an unstyled page. `sandbox allow-scripts` alone fully
      // covers the actual threat (same-origin script access to Doppel's own API).
      'Content-Security-Policy': 'sandbox allow-scripts',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
