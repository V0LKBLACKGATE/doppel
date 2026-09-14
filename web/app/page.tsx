import { prisma } from '@doppel/core/db.js';
import NewCloneForm from './new-clone-form';

// The dashboard reads live CloneJob rows on every request, so it must never be
// statically prerendered/cached at build time (Next 15 defaults async Server
// Components with no dynamic APIs to static generation).
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  fetching: 'Buscando site',
  analyzing: 'Analisando marca',
  rebranding: 'Gerando rebrand',
  pronto_para_revisao: 'Pronto para revisão',
  aplicado: 'Aplicado',
  exportado: 'Exportado',
  erro: 'Erro',
};

export default async function DashboardPage() {
  const jobs = await prisma.cloneJob.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Doppel</h1>
      <p className="mt-1 text-neutral-400">Cole a URL de um site e gere uma versão rebrandada.</p>

      <NewCloneForm />

      <ul className="mt-10 space-y-2">
        {jobs.map((job) => (
          <li key={job.id} className="flex items-center justify-between rounded border border-neutral-800 px-4 py-3">
            <a href={`/jobs/${job.id}`} className="text-sm">
              {job.brandName} <span className="text-neutral-500">← {job.sourceUrl}</span>
            </a>
            <span className="text-xs text-neutral-400">{STATUS_LABEL[job.status] ?? job.status}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
