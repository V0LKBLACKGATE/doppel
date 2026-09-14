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

export async function GET(_request: Request, { params }: { params: { id: string; path: string[] } }) {
  const job = await prisma.cloneJob.findUniqueOrThrow({ where: { id: params.id } });
  if (!job.previewPath) return new Response('Not found', { status: 404 });

  const root = path.resolve(job.previewPath);
  const requested = path.resolve(root, ...params.path);

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
  return new Response(fs.readFileSync(requested), { headers: { 'Content-Type': contentType } });
}
