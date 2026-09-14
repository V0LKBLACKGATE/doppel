import fs from 'node:fs';
import path from 'node:path';

// Every extension the renderer (renderer/src/cli.ts) can actually write to assets/ must be
// listed here. A missing entry falls back to application/octet-stream below, and combined
// with X-Content-Type-Options: nosniff, the browser refuses to render it as an image/font/
// script at all — a real file downloaded correctly can still show up broken in the preview.
export const PREVIEW_CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

export interface ResolvedPreviewFile {
  absolutePath: string;
  contentType: string;
}

// Shared by both the Next.js preview route (web/app/api/clones/[id]/preview/[...path]/route.ts)
// and the standalone isolated-origin preview server (web/preview-server.mjs), so the
// path-traversal and symlink defenses only need to be reasoned about in one place.
export function resolvePreviewFile(previewRoot: string, pathSegments: string[]): ResolvedPreviewFile | null {
  const root = path.resolve(previewRoot);
  const requested = path.resolve(root, ...pathSegments);

  if (!requested.startsWith(root + path.sep) && requested !== root) {
    return null;
  }
  if (!fs.existsSync(requested) || !fs.statSync(requested).isFile()) {
    return null;
  }

  // Defense in depth: path.resolve() only normalizes lexically, it does not follow
  // symlinks. If a symlink inside previewRoot pointed outside of it, the checks above
  // would pass while a file read would still follow the link and leak the external file.
  // Re-verify with the real (symlink-resolved) paths too.
  const realRoot = fs.realpathSync(root);
  const realRequested = fs.realpathSync(requested);
  if (!realRequested.startsWith(realRoot + path.sep) && realRequested !== realRoot) {
    return null;
  }

  const contentType = PREVIEW_CONTENT_TYPES[path.extname(requested)] ?? 'application/octet-stream';
  return { absolutePath: requested, contentType };
}
