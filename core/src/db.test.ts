import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from './db.js';

describe('CloneJob DB', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates and reads back a CloneJob', async () => {
    const job = await prisma.cloneJob.create({
      data: {
        sourceUrl: 'https://example.com',
        brandName: 'Acme',
        status: 'fetching',
      },
    });

    const found = await prisma.cloneJob.findUnique({ where: { id: job.id } });
    expect(found?.sourceUrl).toBe('https://example.com');
    expect(found?.status).toBe('fetching');
  });
});
