'use client';

import { useEffect, useState } from 'react';
import { getLots, getSemenBatches, type LotStat, type SemenBatch } from '@/lib/db';
import { FileText, Printer, Layers, Syringe, RefreshCw } from 'lucide-react';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'lotes' | 'matrizes' | 'semen'>('lotes');
  const [lots, setLots] = useState<LotStat[]>([]);
  const [semenBatches, setSemenBatches] = useState<SemenBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [l, s] = await Promise.all([getLots(), getSemenBatches()]);
      setLots(l);
      setSemenBatches(s);
      setLoading(false);
    }
    load();
  }, []);

  const totalWorked = lots.reduce((s, l) => s + l.worked_qty, 0);
  const totalInseminated = lots.reduce((s, l) => s + l.inseminated_qty, 0);
  const totalPregnant = lots.reduce((s, l) => s + l.pregnancies, 0);
  const totalEmpty = lots.reduce((s, l) => s + l.empty_count, 0);
  const overallRate = totalInseminated > 0 ? (totalPregnant / totalInseminated) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-400" />
            Central de Relatórios & Exportação
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Relatórios da estação 2025/2026 — dados ao vivo do Supabase.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium px-4 py-2 rounded-xl border border-slate-700 text-xs sm:text-sm transition-all flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" /> Imprimir
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Lotes', value: lots.length, color: 'text-blue-400' },
            { label: 'Matrizes', value: totalWorked, color: 'text-slate-200' },
            { label: 'Inseminadas', value: totalInseminated, color: 'text-purple-400' },
            { label: 'Prenhas', value: totalPregnant, color: 'text-emerald-400' },
            { label: 'Taxa Geral', value: `${overallRate.toFixed(1)}%`, color: 'text-emerald-400' },
          ].map((m) => (
            <div key={m.label} className="glass-card p-4 rounded-2xl border border-slate-800 text-center">
              <span className="text-slate-400 text-xs block uppercase tracking-wider">{m.label}</span>
              <span className={`text-2xl font-bold ${m.color}`}>{m.value}</span>
              {m.label === 'Prenhas' && totalInseminated > 0 && (
                <span className="text-xs text-slate-500 block">({totalPregnant}/{totalInseminated})</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-800 pb-2">
        {[
          { id: 'lotes' as const, label: `Relatório por Lote (${lots.length})`, icon: Layers },
          { id: 'semen' as const, label: `Estoque de Sêmen (${semenBatches.length})`, icon: Syringe },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === id
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white uppercase tracking-wider">
            Relatório Oficial da Estação 2025/2026 — FAZENDA BOI GORDO
          </h2>
          <span className="text-xs text-slate-400">DR. SAMOEL DUARTE</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 gap-3">
            <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
            Carregando dados...
          </div>
        ) : activeTab === 'lotes' ? (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Lote</th>
                  <th className="p-3">Retiro</th>
                  <th className="p-3">Protocolo</th>
                  <th className="p-3">D0</th>
                  <th className="p-3">IA</th>
                  <th className="p-3">DG</th>
                  <th className="p-3">Matrizes</th>
                  <th className="p-3">Inseminadas</th>
                  <th className="p-3">Prenhas</th>
                  <th className="p-3">Vazias</th>
                  <th className="p-3">Taxa %</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-900/60 font-mono">
                {lots.map((lot) => (
                  <tr key={lot.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="p-3 font-bold text-white font-sans">{lot.code}</td>
                    <td className="p-3 font-sans">{lot.property_name ?? '-'}</td>
                    <td className="p-3 font-sans text-[10px]">{lot.protocol_name}</td>
                    <td className="p-3">{lot.start_date}</td>
                    <td className="p-3">{lot.ia_planned_date ?? '-'}</td>
                    <td className="p-3">{lot.dg_planned_date ?? '-'}</td>
                    <td className="p-3">{lot.worked_qty}</td>
                    <td className="p-3">{lot.inseminated_qty}</td>
                    <td className="p-3 text-emerald-400 font-bold">{lot.pregnancies}</td>
                    <td className="p-3 text-slate-400">{lot.empty_count}</td>
                    <td className="p-3 text-emerald-400 font-bold">
                      {lot.pregnancy_rate.toFixed(2)}%
                      {lot.inseminated_qty > 0 && (
                        <span className="text-slate-500 font-normal text-[10px] ml-1">
                          ({lot.pregnancies}/{lot.inseminated_qty})
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-sans">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        lot.status === 'concluido' ? 'text-emerald-400 bg-emerald-500/10' :
                        lot.status === 'em_andamento' ? 'text-blue-400 bg-blue-500/10' :
                        'text-slate-400 bg-slate-800'
                      }`}>
                        {lot.status === 'concluido' ? 'Concluído' : lot.status === 'em_andamento' ? 'Em andamento' : 'Planejado'}
                      </span>
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="bg-slate-800/60 font-bold text-slate-200">
                  <td className="p-3 font-sans" colSpan={6}>TOTAL GERAL</td>
                  <td className="p-3">{totalWorked}</td>
                  <td className="p-3">{totalInseminated}</td>
                  <td className="p-3 text-emerald-400">{totalPregnant}</td>
                  <td className="p-3 text-slate-400">{totalEmpty}</td>
                  <td className="p-3 text-emerald-400">
                    {overallRate.toFixed(2)}%
                    <span className="text-slate-500 font-normal text-[10px] ml-1">
                      ({totalPregnant}/{totalInseminated})
                    </span>
                  </td>
                  <td className="p-3" />
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Touro</th>
                  <th className="p-3">Partida</th>
                  <th className="p-3">Compradas</th>
                  <th className="p-3">Usadas</th>
                  <th className="p-3">Perdas</th>
                  <th className="p-3">Saldo</th>
                  <th className="p-3">% Utilizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-900/60 font-mono">
                {semenBatches.map((b) => {
                  const current = b.initial_quantity - b.used_quantity - b.lost_quantity;
                  const used_pct = b.initial_quantity > 0 ? ((b.used_quantity / b.initial_quantity) * 100).toFixed(1) : '0';
                  return (
                    <tr key={b.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-3 font-bold text-white font-sans">{b.bulls?.name}</td>
                      <td className="p-3"><span className="bg-slate-800 text-amber-400 border border-slate-700 px-2 py-0.5 rounded">{b.batch_number}</span></td>
                      <td className="p-3">{b.initial_quantity}</td>
                      <td className="p-3">{b.used_quantity}</td>
                      <td className="p-3 text-rose-400 font-bold">{b.lost_quantity}</td>
                      <td className={`p-3 font-bold ${current < 10 ? 'text-amber-400' : 'text-emerald-400'}`}>{current}</td>
                      <td className="p-3 text-slate-400">{used_pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
