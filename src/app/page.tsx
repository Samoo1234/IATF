'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  getOrgMetrics,
  getLots,
  getSemenBatches,
  getFarms,
  type OrgMetrics,
  type LotStat,
  type SemenBatch,
  type Farm,
} from '@/lib/db';
import { useActiveFarm } from '@/context/FarmContext';
import { useActiveSeason } from '@/context/SeasonContext';
import {
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Layers,
  Dna,
  BarChart3,
  ArrowUpRight,
  RefreshCw,
  Building2,
  Package,
  ArrowRight,
  Sparkles,
  MapPin,
  User,
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { farms, activeFarmId, activeFarm, setActiveFarmId } = useActiveFarm();
  const { activeSeason } = useActiveSeason();
  const [viewScope, setViewScope] = useState<'farm' | 'consolidated'>('farm');
  const [metrics, setMetrics] = useState<OrgMetrics | null>(null);
  const [lots, setLots] = useState<LotStat[]>([]);
  const [semenBatches, setSemenBatches] = useState<SemenBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const [m, l, s] = await Promise.all([
        getOrgMetrics(),
        getLots(),
        getSemenBatches(),
      ]);
      if (!mounted) return;
      setMetrics(m);
      setLots(l);
      setSemenBatches(s);
      setLoading(false);
    }
    load();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSelectFarm = (farmId: string) => {
    setActiveFarmId(farmId);
    setViewScope('farm');
  };

  const selectedFarm = activeFarm;

  // Compute stats for each farm using accurate farm_id
  const farmStats = useMemo(() => {
    return farms.map((farm) => {
      const farmLotsList = lots.filter(
        (l) =>
          l.farm_id === farm.id ||
          l.farm_name?.toLowerCase() === farm.name.toLowerCase()
      );

      const totalLots = farmLotsList.length;
      const totalWorked = farmLotsList.reduce((acc, l) => acc + (l.worked_qty || 0), 0);
      const totalInseminated = farmLotsList.reduce((acc, l) => acc + (l.inseminated_qty || 0), 0);
      const totalPregnancies = farmLotsList.reduce((acc, l) => acc + (l.pregnancies || 0), 0);
      const totalEmpty = farmLotsList.reduce((acc, l) => acc + (l.empty_count || 0), 0);
      const rate = totalInseminated > 0 ? (totalPregnancies / totalInseminated) * 100 : 0;
      const dosesUsed = totalInseminated;

      return {
        farm,
        totalLots,
        totalWorked,
        totalInseminated,
        totalPregnancies,
        totalEmpty,
        rate,
        dosesUsed,
        lots: farmLotsList,
      };
    });
  }, [farms, lots]);

  // Total semen balance available across batches
  const totalSemenAvailable = useMemo(() => {
    return semenBatches.reduce(
      (acc, b) => acc + Math.max(0, b.initial_quantity - b.used_quantity - b.lost_quantity),
      0
    );
  }, [semenBatches]);

  // Filter lots based on selected viewScope
  const displayedLots = useMemo(() => {
    if (viewScope === 'consolidated') return lots;
    return lots.filter(
      (l) =>
        l.farm_id === activeFarmId ||
        (selectedFarm && l.farm_name?.toLowerCase() === selectedFarm.name.toLowerCase())
    );
  }, [lots, activeFarmId, selectedFarm, viewScope]);

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

  // Active farm stats if filtered
  const activeFarmStat = farmStats.find((fs) => fs.farm.id === activeFarmId);
  const isFarmView = viewScope === 'farm' && activeFarmStat;

  const overallRate = isFarmView
    ? activeFarmStat.rate
    : (metrics?.overall_pregnancy_rate ?? 0);

  const totalPregnancies = isFarmView
    ? activeFarmStat.totalPregnancies
    : (metrics?.total_pregnancies ?? 0);

  const totalDiagnoses = isFarmView
    ? activeFarmStat.totalInseminated
    : (metrics?.total_diagnoses ?? 0);

  const totalAnimals = isFarmView
    ? activeFarmStat.totalWorked
    : (metrics?.total_animals ?? 0);

  const activeLotsCount = displayedLots.length;
  const totalInseminations = isFarmView
    ? activeFarmStat.totalInseminated
    : (metrics?.total_inseminations ?? 0);
  const deviceLosses = metrics?.total_device_losses ?? 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-linear-to-r from-slate-900 via-slate-800 to-emerald-950/60 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Painel de Controle Reprodutivo IATF
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400 mt-1">
            <span>Estação Reprodutiva <span className="text-emerald-400 font-semibold">{activeSeason?.name || 'Ativa'}</span></span>
            <span>•</span>
            <span className="font-semibold text-slate-200">
              {viewScope === 'farm' ? (selectedFarm?.name || 'Fazenda Ativa') : 'Visão Geral Consolidada'}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-emerald-500 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
              Supabase Live
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Toggle de Escopo: Fazenda Selecionada vs Consolidado Geral */}
          <div className="flex items-center bg-slate-950/90 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setViewScope('farm')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                viewScope === 'farm'
                  ? 'bg-emerald-600 text-slate-950 font-bold shadow-md glow-emerald'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {selectedFarm?.name || 'Fazenda Ativa'}
            </button>
            <button
              onClick={() => setViewScope('consolidated')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                viewScope === 'consolidated'
                  ? 'bg-emerald-600 text-slate-950 font-bold shadow-md glow-emerald'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Consolidado Geral
            </button>
          </div>

          <Link
            href="/agenda"
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium px-4 py-2.5 rounded-xl border border-slate-700 transition-all text-sm cursor-pointer"
          >
            <Calendar className="w-4 h-4" />
            Agenda
          </Link>
          <Link
            href="/lots"
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-all shadow-lg glow-emerald text-sm cursor-pointer"
          >
            <Layers className="w-4 h-4" />
            Lotes
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Taxa de Prenhez */}
        <div className="glass-card p-5 rounded-2xl border border-emerald-500/30 bg-slate-900/60 relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {selectedFarm ? `Taxa Prenhez (${selectedFarm.name})` : 'Taxa de Prenhez Geral'}
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {overallRate.toFixed(1)}%
            </div>
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
              Em <strong className="text-slate-200">{activeLotsCount}</strong> lotes {selectedFarm ? 'da fazenda' : 'ativos'}
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

      {/* Main Grid: Taxa de Prenhez por Fazenda & Estoque de Sêmen por Fazenda */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* BLOCO 1: Taxa de Prenhez por Fazenda */}
        <div className="lg:col-span-2 glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-400" />
                Taxa de Prenhez por Fazenda
              </h2>
              <p className="text-xs text-slate-400">Desempenho reprodutivo consolidado de cada propriedade</p>
            </div>
            {viewScope === 'farm' ? (
              <button
                onClick={() => setViewScope('consolidated')}
                className="text-xs font-semibold text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                Ver Consolidado <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => setViewScope('farm')}
                className="text-xs font-semibold text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                Focar na Fazenda Ativa <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {farmStats.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Nenhuma fazenda cadastrada ainda.</p>
          ) : (
            <div className="space-y-3 pt-2">
              {farmStats.map(({ farm, totalLots, totalInseminated, totalPregnancies, rate }) => {
                const isSelected = activeFarmId === farm.id;
                return (
                  <div
                    key={farm.id}
                    onClick={() => handleSelectFarm(farm.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                      isSelected
                        ? 'bg-slate-900 border-emerald-500/60 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-400/30'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-base text-white hover:text-emerald-400 transition-colors">
                            {farm.name}
                          </span>
                          {isSelected && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              Ativa
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                          {(farm.city || farm.state) && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-500" />
                              {[farm.city, farm.state].filter(Boolean).join(' - ')}
                            </span>
                          )}
                          {farm.technical_responsible && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-500" />
                              {farm.technical_responsible}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-left sm:text-right">
                        <div className="text-lg font-black text-emerald-400">
                          {rate.toFixed(1)}%
                        </div>
                        <span className="text-xs text-slate-400">
                          {totalPregnancies} prenhas / {totalInseminated} inseminadas • {totalLots} lotes
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-linear-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                        style={{ width: `${rate}%` }}
                      />
                    </div>

                    {/* Link / CTA para abrir o Workflow da Fazenda */}
                    <div className="pt-1 flex items-center justify-between text-xs border-t border-slate-800/60">
                      <span className="text-slate-400">
                        {totalLots > 0 ? `${totalLots} lotes registrados` : 'Nenhum lote criado'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectFarm(farm.id);
                        }}
                        className="font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <span>{isSelected ? 'Workflow Ativo no Painel' : 'Abrir Workflow desta Fazenda'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* BLOCO 2: Estoque de Sêmen por Fazenda */}
        <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-400" />
                Estoque de Sêmen por Fazenda
              </h2>
              <p className="text-xs text-slate-400">Consumo e disponibilidade nas propriedades</p>
            </div>
            <Link href="/inputs" className="text-xs text-slate-400 hover:text-white cursor-pointer">
              Gerenciar Estoque
            </Link>
          </div>

          <div className="space-y-3 pt-1">
            {farmStats.map(({ farm, dosesUsed }) => {
              const isSelected = activeFarmId === farm.id;
              return (
                <div
                  key={farm.id}
                  onClick={() => handleSelectFarm(farm.id)}
                  className={`p-3.5 rounded-xl border space-y-2 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-slate-900 border-amber-500/50 ring-1 ring-amber-400/25'
                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white truncate max-w-44 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      {farm.name}
                    </span>
                    <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
                      Botijão Ativo
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center text-xs pt-1 border-t border-slate-800/80">
                    <div>
                      <span className="text-slate-500 text-[10px] block">DOSES APLICADAS</span>
                      <span className="font-bold text-slate-200">{dosesUsed}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">SALDO BOTIJÃO</span>
                      <span className="font-bold text-emerald-400">{totalSemenAvailable}</span>
                    </div>
                  </div>

                  <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{farm.technical_responsible || 'Responsável Técnico'}</span>
                    <span className="text-emerald-400 font-semibold flex items-center gap-1 hover:underline">
                      Ver Workflow <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* BLOCO 3: Painel de Workflow da Fazenda Selecionada */}
      {selectedFarm && (
        <div className="glass-card p-6 rounded-2xl border border-emerald-500/40 bg-slate-900/90 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Workflow Ativo
                </span>
                <h3 className="text-xl font-bold text-white tracking-tight">
                  {selectedFarm.name}
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Acompanhamento operacional, lotes de IATF e agenda de campo desta fazenda
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/lots"
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md glow-emerald transition-all cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                Lotes desta Fazenda
                <ArrowRight className="w-3 h-3" />
              </Link>
              <Link
                href="/agenda"
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                Agenda de Manejos
              </Link>
              <button
                onClick={() => handleSelectFarm('all')}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white text-xs border border-slate-800 transition-colors cursor-pointer"
              >
                Ver Todas
              </button>
            </div>
          </div>

          {/* Lotes vinculados a esta fazenda */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Lotes em Operação ({displayedLots.length})
            </h4>

            {displayedLots.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Nenhum lote cadastrado para esta fazenda ainda.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {displayedLots.map((lot) => (
                  <div
                    key={lot.id}
                    className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 transition-all space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-sm text-white">{lot.code}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {lot.pregnancy_rate.toFixed(1)}% Prenhez
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 space-y-0.5">
                      <p>Protocolo: <strong className="text-slate-300">{lot.protocol_name || 'Padrão'}</strong></p>
                      <p>D0: <strong className="text-slate-300">{lot.start_date}</strong> {lot.ia_planned_date && `• IA: ${lot.ia_planned_date}`}</p>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-slate-500 text-[11px]">{lot.worked_qty} matrizes</span>
                      <Link
                        href="/lots"
                        className="text-emerald-400 hover:underline flex items-center gap-1 font-semibold text-[11px]"
                      >
                        Abrir Lote <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
