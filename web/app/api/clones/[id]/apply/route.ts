import { NextResponse } from 'next/server';
import { prisma } from '@doppel/core/db.js';
import { applyAndExport } from '@doppel/core/pipeline/index.js';

// Next.js 15 Route Handlers receive dynamic segment params as a Promise (async APIs),
// not a plain object — see the sibling preview route for the same pattern.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const edits = await request.json().catch(() => ({}));

  const data: Record<string, string> = {};
  if (edits.colorPalette) data.colorPalette = JSON.stringify(edits.colorPalette);
  if (edits.copyChanges) data.copyChanges = JSON.stringify(edits.copyChanges);
  if (edits.logoSvg) data.logoSvg = edits.logoSvg;
  if (Object.keys(data).length > 0) {
    await prisma.cloneJob.update({ where: { id }, data });
  }

  let job;
  try {
    job = await applyAndExport(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ status: job.status, exportPath: job.exportPath });
}
