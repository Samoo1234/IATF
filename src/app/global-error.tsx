'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-rose-500/30 rounded-2xl p-6 text-center space-y-4">
          <h2 className="text-lg font-bold text-white">Erro Crítico na Aplicação</h2>
          <p className="text-xs text-slate-400">
            Recarregue a página para restaurar a sessão. Nenhum dado foi perdido.
          </p>
          <button
            onClick={() => reset()}
            className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs cursor-pointer"
          >
            Recarregar Sistema
          </button>
        </div>
      </body>
    </html>
  );
}
