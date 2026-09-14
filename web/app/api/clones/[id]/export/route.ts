import fs from 'node:fs';
import { prisma } from '@doppel/core/db.js';

// Next.js 15 Route Handlers receive dynamic segment params as a Promise (async APIs),
// not a plain object — see the sibling apply/preview routes for the same pattern.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let job;
  try {
    job = await prisma.cloneJob.findUniqueOrThrow({ where: { id } });
  } catch {
    return new Response('Not found', { status: 404 });
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
