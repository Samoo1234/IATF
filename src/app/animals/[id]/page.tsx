'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { getAnimalHistory, type Animal } from '@/lib/db';
import { Syringe, ArrowLeft, Calendar, MapPin, RefreshCw } from 'lucide-react';

export default function AnimalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      // Search by ID via tag_number (we use the UUID as query context)
      // Actually fetch all animals and filter by ID since searchAnimals uses tag_number
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data } = await supabase
        .from('animals')
        .select('*, breeds(name), animal_categories(name), properties(name), farms(name)')
        .eq('id', id)
        .single();

      if (data) {
        setAnimal(data as unknown as Animal);
        const h = await getAnimalHistory(id);
        setHistory(h as Record<string, unknown>[]);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] gap-3 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
        Carregando ficha da matriz...
      </div>
    );
  }

  if (!animal) {
    return (
      <div className="space-y-4">
        <Link href="/animals" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <p className="text-slate-400">Matriz não encontrada.</p>
      </div>
    );
  }

  const statusColor = (s: string) =>
    s === 'prenha'
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      : 'bg-slate-800 text-slate-400 border-slate-700';

  // Get current season data from latest history entry
  const currentEntry = history[0] as Record<string, unknown> | undefined;
  const currentLot = currentEntry?.iatf_lots as Record<string, unknown> | null | undefined;
  const currentSeason = currentLot?.reproductive_seasons as Record<string, unknown> | null | undefined;

  return (
    <div className="space-y-6">
      <Link href="/animals" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Voltar para Busca de Matrizes
      </Link>

      {/* Header */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-black text-2xl shadow-lg glow-emerald">
            {animal.tag_number}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-bold text-white">Matriz Brinco {animal.tag_number}</h1>
              <span className={`text-xs font-semibold px-3 py-0.5 rounded-full border ${statusColor(animal.reproductive_status)}`}>
                {animal.reproductive_status === 'prenha' ? 'Prenha' : 'Vazia'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Raça: <strong className="text-slate-200">{animal.breeds?.name ?? '-'}</strong> •
              Categoria: <strong className="text-slate-200">{animal.animal_categories?.name ?? '-'}</strong>
            </p>
            {animal.farms && (
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" />
                {animal.farms.name} — {animal.properties?.name ?? '-'}
              </p>
            )}
          </div>
        </div>

        {currentEntry?.expected_parturition_date != null && (
          <div className="text-right border-t md:border-t-0 md:border-l border-slate-800 pt-3 md:pt-0 md:pl-6">
            <span className="text-xs text-slate-400 block">Previsão de Parto (IA + 295 dias)</span>
            <span className="text-xl font-bold text-emerald-400 font-mono">
              {String(currentEntry.expected_parturition_date)}
            </span>
          </div>
        )}
      </div>

      {/* Details + Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Current Season Details */}
        <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Syringe className="w-5 h-5 text-emerald-400" />
            Situação Atual {currentLot ? `(${currentLot.code})` : ''}
          </h2>

          {!currentEntry ? (
            <p className="text-slate-400 text-sm">Sem registros de IATF.</p>
          ) : (
            <div className="space-y-3 text-xs divide-y divide-slate-800">
              {currentSeason?.name != null && (
                <div className="pt-2 flex justify-between text-slate-300">
                  <span className="text-slate-400">Estação:</span>
                  <strong className="text-white">{String(currentSeason.name)}</strong>
                </div>
              )}
              {currentLot?.code != null && (
                <div className="pt-2 flex justify-between text-slate-300">
                  <span className="text-slate-400">Lote:</span>
                  <strong className="text-white font-mono">{String(currentLot.code)}</strong>
                </div>
              )}
              {(currentLot?.protocols as Record<string, unknown> | null)?.name != null && (
                <div className="pt-2 flex justify-between text-slate-300">
                  <span className="text-slate-400">Protocolo:</span>
                  <strong className="text-white">{String((currentLot?.protocols as Record<string, unknown>).name)}</strong>
                </div>
              )}
              {currentLot?.ia_planned_date != null && (
                <div className="pt-2 flex justify-between text-slate-300">
                  <span className="text-slate-400">Data IA:</span>
                  <strong className="text-white font-mono">{String(currentLot.ia_planned_date)}</strong>
                </div>
              )}
              {(currentEntry.bulls as Record<string, unknown> | null)?.name != null && (
                <div className="pt-2 flex justify-between text-slate-300">
                  <span className="text-slate-400">Touro:</span>
                  <strong className="text-emerald-400">{String((currentEntry.bulls as Record<string, unknown>).name)}</strong>
                </div>
              )}
              {currentEntry.inseminator_name != null && (
                <div className="pt-2 flex justify-between text-slate-300">
                  <span className="text-slate-400">Inseminador:</span>
                  <strong className="text-slate-200">{String(currentEntry.inseminator_name)}</strong>
                </div>
              )}
              {currentEntry.ecc_ia != null && (
                <div className="pt-2 flex justify-between text-slate-300">
                  <span className="text-slate-400">ECC na IA / DG:</span>
                  <strong className="text-white font-mono">
                    {Number(currentEntry.ecc_ia).toFixed(2)} / {currentEntry.ecc_dg != null ? Number(currentEntry.ecc_dg).toFixed(2) : '—'}
                  </strong>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="lg:col-span-2 glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-400" />
            Histórico Reprodutivo (Timeline Imutável)
          </h2>

          {history.length === 0 ? (
            <p className="text-slate-400 text-sm">Sem histórico de IATF registrado.</p>
          ) : (
            <div className="space-y-4">
              {history.map((h: Record<string, unknown>, i) => {
                const lot = h.iatf_lots as Record<string, unknown> | null;
                const bull = h.bulls as Record<string, unknown> | null;
                const season = lot?.reproductive_seasons as Record<string, unknown> | null;
                const protocol = lot?.protocols as Record<string, unknown> | null;
                const isPrenha = h.pregnancy_status === 'prenha';
                return (
                  <div key={i} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-sm">{String(season?.name ?? '—')}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">{String(lot?.code ?? '—')}</span>
                        <span className="text-xs text-slate-400">({String(lot?.ia_planned_date ?? '—')})</span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">
                        Touro: <strong className="text-emerald-400">{String(bull?.name ?? '—')}</strong>
                        {h.inseminator_name != null && <> • {String(h.inseminator_name)}</>}
                        {protocol?.name != null && <> • {String(protocol.name)}</>}
                        {h.ecc_ia != null && <> • ECC: {Number(h.ecc_ia).toFixed(2)}</>}
                      </p>
                      {h.expected_parturition_date != null && (
                        <p className="text-xs text-emerald-400 mt-0.5">Prev. Parto: <strong>{String(h.expected_parturition_date)}</strong></p>
                      )}
                    </div>
                    <span className={`px-3 py-1 rounded-lg font-bold text-xs ${
                      isPrenha ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {isPrenha ? 'Prenha' : h.pregnancy_status === 'vazia' ? 'Vazia' : 'Pendente'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
