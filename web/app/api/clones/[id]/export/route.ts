import fs from 'node:fs';
import { prisma } from '@doppel/core/db.js';

// Next.js 15 Route Handlers receive dynamic segment params as a Promise (async APIs),
// not a plain object — see the sibling apply/preview routes for the same pattern.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let job;
  try {
    job = await prisma.cloneJob.findUniqueOrThrow({ where: { id } });
  } catch (err) {
    // Only report 404 when the lookup itself says the job doesn't exist. Prisma's
    // findUniqueOrThrow throws a NotFoundError with message "No CloneJob found" (code
    // P2025) for a missing row — verified empirically against this project's actual
    // Prisma client, not assumed; note this wording differs from the apply route's
    // check, which matches applyAndExport's own re-thrown "CloneJob not found: {id}"
    // message, because that route goes through the pipeline's wrapper while this one
    // calls findUniqueOrThrow directly. Anything else (a database outage, a dropped
    // connection, ...) is a real server error and must not be masked as a plain 404 —
    // that would hide the actual problem from whoever debugs it later.
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('found')) {
      return new Response('Not found', { status: 404 });
    }
    return new Response(`Internal Server Error: ${message}`, { status: 500 });
  }
  if (!job.exportPath || !fs.existsSync(job.exportPath)) return new Response('Not found', { status: 404 });

  // Brand names commonly include characters like "+" (e.g. "Sorriso+"); only strip
  // characters that would be unsafe or ambiguous inside a quoted Content-Disposition
  // filename (path separators, quotes, control characters, whitespace, etc).
  const safeName = job.brandName.replace(/[^a-zA-Z0-9-_+]+/g, '-');
  return new Response(fs.readFileSync(job.exportPath), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName}.zip"`,
    },
  });
}
