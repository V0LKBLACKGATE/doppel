'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewCloneForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/clones', {
        method: 'POST',
        body: JSON.stringify({
          url: form.get('url'),
          brandName: form.get('brandName'),
          niche: form.get('niche') || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(`A clonagem falhou (HTTP ${res.status}). Verifique a URL e tente novamente.`);
      }

      const data = await res.json();
      if (!data.jobId) {
        throw new Error('Resposta inesperada do servidor: nenhum job foi criado.');
      }

      router.push(`/jobs/${data.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível iniciar a clonagem. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-3">
      <input name="url" required placeholder="https://site-de-referencia.com" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
      <input name="brandName" required placeholder="Nome da nova marca" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
      <input name="niche" placeholder="Nicho (opcional)" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
      <button type="submit" disabled={loading} className="rounded bg-emerald-600 px-4 py-2 font-medium disabled:opacity-50">
        {loading ? 'Clonando…' : 'Clonar site'}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
