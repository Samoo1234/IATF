'use client';

import { useEffect, useState } from 'react';
import { searchAnimals, getAnimalHistory, type Animal } from '@/lib/db';
import { Search, Syringe, Calendar, MapPin, RefreshCw, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function AnimalsPage() {
  const [query, setQuery] = useState('');
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (query.length >= 1) {
      const t = setTimeout(() => doSearch(query), 300);
      return () => clearTimeout(t);
    } else {
      setAnimals([]);
    }
  }, [query]);

  async function doSearch(q: string) {
    setLoading(true);
    const data = await searchAnimals(q);
    setAnimals(data);
    setLoading(false);
  }

  async function selectAnimal(a: Animal) {
    setSelectedAnimal(a);
    setLoadingHistory(true);
    const h = await getAnimalHistory(a.id);
    setHistory(h as Record<string, unknown>[]);
    setLoadingHistory(false);
  }

  const statusColor = (s: string) =>
    s === 'prenha'
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      : 'bg-slate-800 text-slate-400 border-slate-700';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Syringe className="w-6 h-6 text-emerald-400" />
            Ficha Reprodutiva da Matriz
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Consulta por brinco com histórico de IATF e previsão de parto.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Digite o brinco (ex: 1001)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-white font-bold text-sm pl-9 pr-4 py-2 rounded-xl focus:outline-none focus:border-emerald-500 transition-all w-52 sm:w-64"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search Results */}
        <div className="space-y-3">
          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
              Buscando...
            </div>
          )}

          {!loading && query.length > 0 && animals.length === 0 && (
            <p className="text-slate-400 text-sm py-4">Nenhuma matriz encontrada para &quot;{query}&quot;.</p>
          )}

          {!loading && animals.length === 0 && query.length === 0 && (
            <div className="glass-card p-6 rounded-2xl border border-slate-800 text-center space-y-2">
              <Search className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-slate-400 text-sm">Digite o número do brinco para buscar uma matriz.</p>
            </div>
          )}

          {animals.map((a) => (
            <div
              key={a.id}
              onClick={() => selectAnimal(a)}
              className={`glass-card p-4 rounded-2xl border transition-all cursor-pointer ${
                selectedAnimal?.id === a.id
                  ? 'border-emerald-500/50 bg-emerald-950/10'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-black text-sm">
                    {a.tag_number}
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm">Brinco {a.tag_number}</p>
                    <p className="text-xs text-slate-400">
                      {a.breeds?.name ?? '-'} • {a.animal_categories?.name ?? '-'}
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusColor(a.reproductive_status)}`}>
                  {a.reproductive_status === 'prenha' ? 'Prenha' : 'Vazia'}
                </span>
              </div>
              {a.properties?.name && (
                <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {a.farms?.name} — {a.properties.name}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Animal Detail */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedAnimal ? (
            <div className="glass-card p-12 rounded-2xl border border-slate-800 text-center space-y-3">
              <Syringe className="w-10 h-10 text-slate-700 mx-auto" />
              <p className="text-slate-400">Selecione uma matriz nos resultados para ver sua ficha reprodutiva.</p>
            </div>
          ) : (
            <>
              {/* Header Card */}
              <div className="glass-card p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-black text-2xl shadow-lg glow-emerald">
                    {selectedAnimal.tag_number}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-2xl font-bold text-white">Brinco {selectedAnimal.tag_number}</h2>
                      <span className={`text-xs font-semibold px-3 py-0.5 rounded-full border ${statusColor(selectedAnimal.reproductive_status)}`}>
                        {selectedAnimal.reproductive_status === 'prenha' ? 'Prenha' : 'Vazia'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {selectedAnimal.breeds?.name ?? '-'} • {selectedAnimal.animal_categories?.name ?? '-'}
                    </p>
                    {selectedAnimal.farms?.name && (
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" /> {selectedAnimal.farms.name} — {selectedAnimal.properties?.name}
                      </p>
                    )}
                  </div>
                </div>
                <Link
                  href={`/animals/${selectedAnimal.id}`}
                  className="flex items-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  Ver ficha completa <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              {/* Timeline */}
              <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-emerald-400" />
                  Linha do Tempo Reprodutiva
                </h3>

                {loadingHistory ? (
                  <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                    Carregando histórico...
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-slate-400 text-sm py-4">Esta matriz ainda não participou de nenhum lote de IATF.</p>
                ) : (
                  <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                    {history.map((h: Record<string, unknown>, i) => {
                      const lot = h.iatf_lots as Record<string, unknown> | null;
                      const bull = h.bulls as Record<string, unknown> | null;
                      const season = lot?.reproductive_seasons as Record<string, unknown> | null;
                      const protocol = lot?.protocols as Record<string, unknown> | null;
                      const isPrenha = h.pregnancy_status === 'prenha';
                      return (
                        <div key={i} className="relative space-y-1">
                          <div className={`absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full border-2 ${
                            isPrenha ? 'bg-emerald-500 border-emerald-400' : 'bg-slate-700 border-slate-600'
                          }`} />
                          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-white text-sm">{String(season?.name ?? '—')}</span>
                                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">{String(lot?.code ?? '—')}</span>
                                <span className="text-xs text-slate-400">({String(lot?.ia_planned_date ?? '—')})</span>
                              </div>
                              <p className="text-xs text-slate-300 mt-1">
                                Touro: <strong className="text-emerald-400">{String(bull?.name ?? '—')}</strong>
                                {protocol?.name != null && <> • Protocolo: {String(protocol.name)}</>}
                                {h.inseminator_name != null && <> • Inseminador: {String(h.inseminator_name)}</>}
                              </p>
                              {h.expected_parturition_date != null && (
                                <p className="text-xs text-emerald-400 mt-0.5">
                                  Prev. Parto: <strong>{String(h.expected_parturition_date)}</strong>
                                </p>
                              )}
                            </div>
                            <span className={`px-3 py-1 rounded-lg font-bold text-xs ${
                              isPrenha
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {String(h.pregnancy_status === 'prenha' ? 'Prenha' : h.pregnancy_status === 'vazia' ? 'Vazia' : 'Pendente')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
