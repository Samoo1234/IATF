'use client';

import { useEffect, useState } from 'react';
import { getOrgMetrics, getLots, getSemenBatches, type OrgMetrics, type LotStat, type SemenBatch } from '@/lib/db';
import {
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Layers,
  Dna,
  BarChart3,
  Award,
  ArrowUpRight,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<OrgMetrics | null>(null);
  const [lots, setLots] = useState<LotStat[]>([]);
  const [semenBatches, setSemenBatches] = useState<SemenBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [m, l, s] = await Promise.all([getOrgMetrics(), getLots(), getSemenBatches()]);
      setMetrics(m);
      setLots(l);
      setSemenBatches(s);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
          <span className="text-lg font-medium">Carregando dados do Supabase...</span>
        </div>
      </div>
    );
  }

  const overallRate = metrics?.overall_pregnancy_rate ?? 0;
  const totalPregnancies = metrics?.total_pregnancies ?? 0;
  const totalDiagnoses = metrics?.total_diagnoses ?? 0;
  const totalAnimals = metrics?.total_animals ?? 0;
  const activeLots = metrics?.active_lots ?? 0;
  const totalInseminations = metrics?.total_inseminations ?? 0;
  const deviceLosses = metrics?.total_device_losses ?? 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-linear-to-r from-slate-900 via-slate-800 to-emerald-950/60 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
             Painel de Controle Reprodutivo IATF
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Estação Reprodutiva <span className="text-emerald-400 font-semibold">2025/2026</span> • Fazenda Boi Gordo
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-500 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
              Supabase Live
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/agenda"
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-all shadow-lg glow-emerald text-sm"
          >
            <Calendar className="w-4 h-4" />
            Agenda de Campo (Manejos)
          </Link>
          <Link
            href="/import"
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium px-4 py-2.5 rounded-xl border border-slate-700 transition-all text-sm"
          >
            Importar Excel
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Taxa de Prenhez Geral */}
        <div className="glass-card p-5 rounded-2xl border border-emerald-500/30 bg-slate-900/60 relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Taxa de Prenhez Geral</span>
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {overallRate.toFixed(1)}%
            </div>
            {/* RN-10: Always show absolute + percentage */}
            <p className="text-xs font-medium text-emerald-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{totalPregnancies} prenhas / {totalDiagnoses} diagnosticadas</span>
            </p>
          </div>
        </div>

        {/* KPI 2: Matrizes Trabalhadas */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Matrizes Trabalhadas</span>
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
              <Dna className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {totalAnimals}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Em <strong className="text-slate-200">{activeLots}</strong> lotes ativos
            </p>
          </div>
        </div>

        {/* KPI 3: Inseminações */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Inseminações / DG</span>
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
              <BarChart3 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {totalInseminations}
            </div>
            <p className="text-xs text-purple-300 mt-1 font-medium">
              {totalDiagnoses} diagnósticos realizados
            </p>
          </div>
        </div>

        {/* KPI 4: Perdas de Implantes */}
        <div className="glass-card p-5 rounded-2xl border border-amber-500/20 bg-slate-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Perdas de Implantes P4</span>
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {deviceLosses} <span className="text-sm font-normal text-slate-400">dispositivos</span>
            </div>
            <p className="text-xs text-amber-400 mt-1">
              {totalAnimals > 0 ? ((deviceLosses / totalAnimals) * 100).toFixed(2) : '0.00'}% taxa de perda
            </p>
          </div>
        </div>
      </div>

      {/* Main Charts & Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Desempenho por Lote */}
        <div className="lg:col-span-2 glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-400" />
                Taxa de Prenhez por Lote de IATF
              </h2>
              <p className="text-xs text-slate-400">Resultado dos diagnósticos ultrassonográficos por lote</p>
            </div>
            <Link href="/lots" className="text-xs font-semibold text-emerald-400 hover:underline flex items-center gap-1">
              Ver todos <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {lots.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Nenhum lote cadastrado ainda.</p>
          ) : (
            <div className="space-y-3 pt-2">
              {lots.map((lot) => (
                <div key={lot.id} className="space-y-1.5 p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 transition-all">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white">{lot.code}</span>
                      <span className="text-slate-400">({lot.property_name ?? lot.farm_name})</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">D0: {lot.start_date}</span>
                    </div>
                    <div className="text-right font-bold text-emerald-400">
                      {lot.pregnancy_rate.toFixed(1)}%{' '}
                      <span className="text-xs text-slate-400 font-normal">({lot.pregnancies}/{lot.inseminated_qty})</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-linear-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${lot.pregnancy_rate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Estoque de Sêmen */}
        <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                Estoque de Sêmen
              </h2>
              <p className="text-xs text-slate-400">Palhetas e saldo por touro</p>
            </div>
            <Link href="/inputs" className="text-xs text-slate-400 hover:text-white">Estoque</Link>
          </div>

          <div className="space-y-3 pt-1">
            {semenBatches.map((batch) => {
              const current = batch.initial_quantity - batch.used_quantity - batch.lost_quantity;
              const pct = batch.initial_quantity > 0 ? (current / batch.initial_quantity) * 100 : 0;
              return (
                <div key={batch.id} className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-slate-200 truncate max-w-40">{batch.bulls?.name}</span>
                    <span className="text-xs font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded">
                      {batch.batch_number}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1 border-t border-slate-800">
                    <div>
                      <span className="text-slate-500 text-[10px] block">USADAS</span>
                      <span className="font-bold text-slate-300">{batch.used_quantity}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">PERDAS</span>
                      <span className="font-bold text-rose-400">{batch.lost_quantity}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">SALDO</span>
                      <span className={`font-bold ${current < 10 ? 'text-amber-400' : 'text-emerald-400'}`}>{current}</span>
                    </div>
                  </div>
                  {/* Stock level bar */}
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct < 20 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
