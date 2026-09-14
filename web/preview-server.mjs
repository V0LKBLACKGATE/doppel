// Standalone static file server for rendering cloned sites, deliberately run as its OWN
// origin (a different port) instead of inside the main Next.js app.
//
// Why this exists: the Next.js route at app/api/clones/[id]/preview/[...path]/route.ts
// serves the exact same files but sends `Content-Security-Policy: sandbox allow-scripts`
// (no allow-same-origin), which forces the browser into an opaque origin. That's correct
// there, because that route lives on Doppel's own origin — but it also means a cloned
// site's own bootstrap script crashes the instant it touches document.cookie,
// localStorage or sessionStorage (all throw in an opaque origin), which for JS-heavy
// storefronts (React/Vue SPAs, VTEX, etc.) leaves the whole page blank even though every
// asset downloaded and localized correctly.
//
// This server has no cookies, no auth, no API routes beyond a read-only GET of exported
// static files — so an iframe pointed at it CAN safely use
// sandbox="allow-scripts allow-same-origin": the cloned site's JS gets a real origin
// (cookies/storage work, so client-rendered content actually paints), but that origin has
// nothing worth attacking and cannot reach Doppel's real origin, its API routes, or any
// session — those all live on the main Next.js port, a completely different origin.
import http from 'node:http';
import fs from 'node:fs';
import { prisma } from '@doppel/core/db.js';
import { resolvePreviewFile } from '@doppel/core/preview/resolve.js';

const PORT = process.env.PREVIEW_PORT ? Number(process.env.PREVIEW_PORT) : 3501;

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end('Method not allowed');
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const segments = url.pathname.split('/').filter(Boolean);
  const [jobId, ...pathSegments] = segments;
  if (!jobId || pathSegments.length === 0) {
    res.writeHead(404);
    return res.end('Not found');
  }

  let job;
  try {
    job = await prisma.cloneJob.findUniqueOrThrow({ where: { id: jobId } });
  } catch {
    res.writeHead(404);
    return res.end('Not found');
  }

  const kind = url.searchParams.get('kind');
  const previewPath = kind === 'source' ? job.sourcePreviewPath : job.previewPath;
  if (!previewPath) {
    res.writeHead(404);
    return res.end('Not found');
  }

  const resolved = resolvePreviewFile(previewPath, pathSegments);
  if (!resolved) {
    res.writeHead(404);
    return res.end('Not found');
  }

  res.writeHead(200, {
    'Content-Type': resolved.contentType,
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(resolved.absolutePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Doppel preview server (isolated origin) listening on http://localhost:${PORT}`);
});
