'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[App ErrorBoundary]', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full glass-card bg-slate-900/90 border border-rose-500/30 rounded-2xl p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white">Algo deu errado nesta tela</h2>
          <p className="text-xs text-slate-400">
            Ocorreu um erro inesperado ao renderizar este módulo. Seus dados salvos no banco estão seguros.
          </p>
        </div>
        <button
          onClick={() => reset()}
          className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" /> Tentar novamente
        </button>
      </div>
    </div>
  );
}
