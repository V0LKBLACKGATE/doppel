import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@doppel/core/db.js';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

// Next.js 15 Route Handlers receive dynamic segment params as a Promise (async APIs),
// not a plain object. The destructured field is renamed to `pathSegments` to avoid
// shadowing the `path` module imported above.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path: pathSegments } = await params;

  let job;
  try {
    job = await prisma.cloneJob.findUniqueOrThrow({ where: { id } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
  if (!job.previewPath) return new Response('Not found', { status: 404 });

  const root = path.resolve(job.previewPath);
  const requested = path.resolve(root, ...pathSegments);

  if (!requested.startsWith(root + path.sep) && requested !== root) {
    return new Response('Not found', { status: 404 });
  }
  if (!fs.existsSync(requested) || !fs.statSync(requested).isFile()) {
    return new Response('Not found', { status: 404 });
  }

  // Defense in depth: path.resolve() only normalizes lexically, it does not follow
  // symlinks. If a symlink inside previewPath pointed outside of it, the checks above
  // would pass while fs.readFileSync would still follow the link and leak the external
  // file. Re-verify with the real (symlink-resolved) paths too.
  const realRoot = fs.realpathSync(root);
  const realRequested = fs.realpathSync(requested);
  if (!realRequested.startsWith(realRoot + path.sep) && realRequested !== realRoot) {
    return new Response('Not found', { status: 404 });
  }

  const contentType = CONTENT_TYPES[path.extname(requested)] ?? 'application/octet-stream';
  return new Response(fs.readFileSync(requested), {
    headers: {
      'Content-Type': contentType,
      // Everything served here is UNTRUSTED third-party content (a cloned site's own HTML,
      // CSS and JS). Without this it would execute same-origin with the Doppel app and could
      // drive our own API routes as the logged-in viewer. The CSP `sandbox` directive applies
      // the iframe sandbox at the response level, so the protection holds even if the file is
      // opened directly in a tab instead of through the sandboxed <iframe> on the job page.
      // `allow-scripts` is kept (and `allow-same-origin` deliberately is not) so the clone
      // still renders and behaves like the original while staying in an opaque origin.
      'Content-Security-Policy': "sandbox allow-scripts; default-src 'self' data: blob:",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
