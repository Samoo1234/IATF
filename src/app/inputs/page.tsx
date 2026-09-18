'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Package } from 'lucide-react';

export default function InputsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/estoque-semen');
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-slate-400">
      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-lg">
        <Package className="w-6 h-6 animate-pulse" />
      </div>
      <div className="flex items-center gap-2 text-sm text-slate-300">
        <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
        <span>Redirecionando para o novo módulo de Estoque de Sêmen & Doses...</span>
      </div>
    </div>
  );
}
