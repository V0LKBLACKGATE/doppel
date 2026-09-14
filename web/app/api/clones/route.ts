import { NextResponse } from 'next/server';
import { prisma } from '@doppel/core/db.js';
import { runClonePipeline } from '@doppel/core/pipeline/index.js';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export async function POST(request: Request) {
  // A malformed body used to surface as a raw, bodyless 500 — reject it as the 400 it is.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido: esperado JSON.' }, { status: 400 });
  }

  const { url, brandName, niche } = (body ?? {}) as { url?: unknown; brandName?: unknown; niche?: unknown };

  if (!isNonEmptyString(url)) {
    return NextResponse.json({ error: 'O campo "url" é obrigatório e precisa ser uma string não vazia.' }, { status: 400 });
  }
  if (!isNonEmptyString(brandName)) {
    return NextResponse.json({ error: 'O campo "brandName" é obrigatório e precisa ser uma string não vazia.' }, { status: 400 });
  }
  if (niche !== undefined && niche !== null && typeof niche !== 'string') {
    return NextResponse.json({ error: 'O campo "niche", quando enviado, precisa ser uma string.' }, { status: 400 });
  }

  try {
    // Deliberately still synchronous: the caller waits for the pipeline. This only adds the
    // missing error boundary around it, it is not a job queue.
    const job = await runClonePipeline(url, brandName, niche ?? undefined);
    return NextResponse.json({ jobId: job.id, status: job.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const jobs = await prisma.cloneJob.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  return NextResponse.json({ jobs });
}
