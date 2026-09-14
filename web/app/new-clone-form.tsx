'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewCloneForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/clones', {
      method: 'POST',
      body: JSON.stringify({
        url: form.get('url'),
        brandName: form.get('brandName'),
        niche: form.get('niche') || undefined,
      }),
    });
    const { jobId } = await res.json();
    router.push(`/jobs/${jobId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-3">
      <input name="url" required placeholder="https://site-de-referencia.com" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
      <input name="brandName" required placeholder="Nome da nova marca" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
      <input name="niche" placeholder="Nicho (opcional)" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
      <button type="submit" disabled={loading} className="rounded bg-emerald-600 px-4 py-2 font-medium disabled:opacity-50">
        {loading ? 'Clonando…' : 'Clonar site'}
      </button>
    </form>
  );
}
