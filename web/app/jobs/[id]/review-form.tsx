'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  jobId: string;
  colorPalette: string[];
  copyChanges: Record<string, string>;
  logoSvg: string;
}

export default function ReviewForm({ jobId, colorPalette, copyChanges, logoSvg }: Props) {
  const router = useRouter();
  const [palette, setPalette] = useState(colorPalette.join(', '));
  const [copy, setCopy] = useState(JSON.stringify(copyChanges, null, 2));
  const [logo, setLogo] = useState(logoSvg);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    setLoading(true);
    setError(null);
    try {
      let parsedCopyChanges: Record<string, string>;
      try {
        parsedCopyChanges = JSON.parse(copy || '{}');
      } catch {
        throw new Error('JSON inválido no campo de textos reescritos. Corrija o formato e tente novamente.');
      }

      const res = await fetch(`/api/clones/${jobId}/apply`, {
        method: 'POST',
        body: JSON.stringify({
          colorPalette: palette.split(',').map((c) => c.trim()).filter(Boolean),
          copyChanges: parsedCopyChanges,
          logoSvg: logo,
        }),
      });

      if (!res.ok) {
        throw new Error(`A aplicação falhou (HTTP ${res.status}). Tente novamente.`);
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível aplicar as alterações. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div>
        <label className="block text-sm text-neutral-400">Paleta de cores (hex, separado por vírgula)</label>
        <input value={palette} onChange={(e) => setPalette(e.target.value)} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm text-neutral-400">Textos reescritos (JSON: original → novo)</label>
        <textarea value={copy} onChange={(e) => setCopy(e.target.value)} rows={8} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-xs" />
      </div>
      <div>
        <label className="block text-sm text-neutral-400">Logo (SVG)</label>
        <textarea value={logo} onChange={(e) => setLogo(e.target.value)} rows={4} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-xs" />
      </div>
      <button onClick={handleApply} disabled={loading} className="rounded bg-emerald-600 px-4 py-2 font-medium disabled:opacity-50">
        {loading ? 'Aplicando…' : 'Aplicar e exportar'}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
