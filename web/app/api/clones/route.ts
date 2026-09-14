import { NextResponse } from 'next/server';
import { prisma } from '@doppel/core/db.js';
import { runClonePipeline } from '@doppel/core/pipeline/index.js';

export async function POST(request: Request) {
  const { url, brandName, niche } = await request.json();
  const job = await runClonePipeline(url, brandName, niche);
  return NextResponse.json({ jobId: job.id, status: job.status });
}

export async function GET() {
  const jobs = await prisma.cloneJob.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  return NextResponse.json({ jobs });
}
