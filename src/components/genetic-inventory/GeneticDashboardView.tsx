'use client';

import React from 'react';
import type { InventoryDashboardMetrics, GeneticMaterialType, InventoryMovement } from '@/lib/types/genetic-inventory';
import { 
  Package, 
  Thermometer, 
  AlertTriangle, 
  TrendingUp, 
  Layers, 
  Dna, 
  Plus, 
  LogOut, 
  ArrowRightLeft, 
  Search, 
  CheckCircle2
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend 
} from 'recharts';

interface GeneticDashboardViewProps {
  metrics: InventoryDashboardMetrics;
  recentMovements: InventoryMovement[];
  activeMaterialType: GeneticMaterialType;
  onOpenWizard: (mode: 'inbound' | 'outbound' | 'transfer' | 'adjustment') => void;
  onOpenAnimalLookup: () => void;
  onSelectTankMap?: (tankId: string) => void;
}

export default function GeneticDashboardView({
  metrics,
  recentMovements,
  activeMaterialType,
  onOpenWizard,
  onOpenAnimalLookup,
  onSelectTankMap,
}: GeneticDashboardViewProps) {
  return (
    <div className="space-y-6">
      
      {/* 1. Quick Actions Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => onOpenWizard('inbound')}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-850 transition-all text-left flex items-center gap-3.5 group cursor-pointer shadow-md"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
            <Plus className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">Nova Entrada</h4>
            <p className="text-[10px] text-slate-400">Adicionar doses ou partida</p>
          </div>
        </button>

        <button
          onClick={() => onOpenWizard('outbound')}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-rose-500/50 hover:bg-slate-850 transition-all text-left flex items-center gap-3.5 group cursor-pointer shadow-md"
        >
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
            <LogOut className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white group-hover:text-rose-300 transition-colors">Nova Saída</h4>
            <p className="text-[10px] text-slate-400">Retirada com comprovante</p>
          </div>
        </button>

        <button
          onClick={() => onOpenWizard('transfer')}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-850 transition-all text-left flex items-center gap-3.5 group cursor-pointer shadow-md"
        >
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">Transferir</h4>
            <p className="text-[10px] text-slate-400">Entre canecas / botijões</p>
          </div>
        </button>

        <button
          onClick={onOpenAnimalLookup}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-teal-500/50 hover:bg-slate-850 transition-all text-left flex items-center gap-3.5 group cursor-pointer shadow-md"
        >
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white group-hover:text-teal-300 transition-colors">Consultar Animal</h4>
            <p className="text-[10px] text-slate-400">Localizar estoque em botijão</p>
          </div>
        </button>
      </div>

      {/* 2. KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Doses Sêmen */}
        <div className="glass-card bg-slate-900/90 p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>Doses Sêmen</span>
            <Dna className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-white font-mono">
            {metrics.totalSemenDoses.toLocaleString('pt-BR')}
          </p>
          <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Em estoque físico
          </span>
        </div>

        {/* Embriões */}
        <div className="glass-card bg-slate-900/90 p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>Embriões</span>
            <Package className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-black text-white font-mono">
            {metrics.totalEmbryoDoses.toLocaleString('pt-BR')}
          </p>
          <span className="text-[10px] text-purple-400 font-medium">
            Criopreservados
          </span>
        </div>

        {/* Botijões Ativos */}
        <div className="glass-card bg-slate-900/90 p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>Botijões</span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-black text-white font-mono">
            {metrics.activeTanksCount}
          </p>
          <span className="text-[10px] text-cyan-400 font-medium">
            Tanques operacionais
          </span>
        </div>

        {/* Estoque Baixo */}
        <div className="glass-card bg-slate-900/90 p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>Estoque Baixo</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-black text-amber-400 font-mono">
            {metrics.lowStockItemsCount}
          </p>
          <span className="text-[10px] text-amber-400/80 font-medium">
            Partidas &lt; 10 doses
          </span>
        </div>

        {/* Alerta de N2 */}
        <div className="glass-card bg-slate-900/90 p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>Alerta N2</span>
            <Thermometer className="w-4 h-4 text-rose-400" />
          </div>
          <p className={`text-2xl font-black font-mono ${metrics.tanksBelowNitrogenCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {metrics.tanksBelowNitrogenCount}
          </p>
          <span className={`text-[10px] font-medium ${metrics.tanksBelowNitrogenCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {metrics.tanksBelowNitrogenCount > 0 ? 'Abaixo do limite!' : 'Níveis seguros'}
          </span>
        </div>

        {/* Movimentações 30d */}
        <div className="glass-card bg-slate-900/90 p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>Últimos 30d</span>
            <TrendingUp className="w-4 h-4 text-teal-400" />
          </div>
          <p className="text-2xl font-black text-white font-mono">
            {metrics.movementsLast30DaysCount}
          </p>
          <span className="text-[10px] text-slate-400 font-medium">
            Operações no ledger
          </span>
        </div>
      </div>

      {/* 3. Gráficos & Resumo por Botijão */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gráfico Recharts de Entradas vs Saídas */}
        <div className="lg:col-span-7 glass-card bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Movimentação Histórica (Entradas vs Saídas)
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">
              {activeMaterialType === 'SEMEN' ? 'Sêmen' : 'Embriões'} • Últimos 6 meses
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.monthlyStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px', color: '#fff' }} 
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="inbound" name="Entradas (Doses)" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outbound" name="Saídas (Doses)" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Resumo por Botijão */}
        <div className="lg:col-span-5 glass-card bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-cyan-400" />
              Nível dos Botijões Criogênicos
            </h3>
            <span className="text-[11px] text-slate-400">{metrics.tanksSummary.length} tanques</span>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-[220px] custom-scrollbar pr-1">
            {metrics.tanksSummary.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">Nenhum botijão cadastrado.</p>
            ) : (
              metrics.tanksSummary.map((t) => {
                const isLow = t.currentNitrogen <= t.minimumNitrogen;
                const isWarn = t.currentNitrogen <= t.minimumNitrogen + 15 && !isLow;
                let barColor = 'bg-emerald-500';
                if (isLow) barColor = 'bg-rose-500';
                else if (isWarn) barColor = 'bg-amber-500';

                return (
                  <div
                    key={t.tankId}
                    onClick={() => onSelectTankMap?.(t.tankId)}
                    className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-emerald-500/50 transition-colors space-y-1.5 cursor-pointer"
                    title="Clique para visualizar o mapa de canecas deste botijão"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-400">{t.tankNumber}</span>
                        <span className="font-semibold text-white truncate max-w-[140px]">{t.tankName}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-slate-400 text-[11px]">{t.totalDoses} doses</span>
                        <span className={`font-bold ${isLow ? 'text-rose-400' : 'text-cyan-400'}`}>
                          {t.currentNitrogen}% N2
                        </span>
                      </div>
                    </div>

                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${Math.min(100, Math.max(0, t.currentNitrogen))}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-2 text-center">
            Medição regular recomendada semanalmente para preservação de palhetas.
          </p>
        </div>
      </div>

      {/* 4. Movimentações Recentes */}
      <div className="glass-card bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-400" />
            Movimentações Recentes do Livro Razão
          </h3>
          <span className="text-[11px] text-slate-400">Últimos registros imutáveis</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-2.5">Data / Hora</th>
                <th className="p-2.5">Operação</th>
                <th className="p-2.5">Animal</th>
                <th className="p-2.5">Partida</th>
                <th className="p-2.5 text-right">Qtd.</th>
                <th className="p-2.5">Localização</th>
                <th className="p-2.5">Operador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {recentMovements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-400 font-sans">
                    Nenhuma movimentação registrada recentemente.
                  </td>
                </tr>
              ) : (
                recentMovements.slice(0, 5).map((m) => {
                  const mat = m.genetic_material_batches?.genetic_materials;
                  const animalName = mat?.type === 'SEMEN' 
                    ? (mat?.bulls?.name || 'Touro') 
                    : (mat?.donor_name || mat?.animals?.tag_number || 'Doadora');

                  return (
                    <tr key={m.id} className="hover:bg-slate-800/40">
                      <td className="p-2.5 font-sans text-slate-400 text-[11px]">
                        {new Date(m.occurred_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="p-2.5 font-sans">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">
                          {m.movement_type}
                        </span>
                      </td>
                      <td className="p-2.5 font-sans font-bold text-white">{animalName}</td>
                      <td className="p-2.5 text-amber-400">{m.genetic_material_batches?.batch_number}</td>
                      <td className="p-2.5 text-right font-bold text-white">{m.quantity}</td>
                      <td className="p-2.5 font-sans text-slate-400">
                        {m.source_tank ? m.source_tank.number : m.dest_tank?.number || '-'}
                      </td>
                      <td className="p-2.5 font-sans text-slate-400">{m.created_by || 'Sistema'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
