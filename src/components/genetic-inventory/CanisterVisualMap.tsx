'use client';

import React, { useState } from 'react';
import type { SemenTank, TankCanister, InventoryBalance } from '@/lib/types/genetic-inventory';
import { Layers, Package, X, ArrowRight, ShieldCheck, User } from 'lucide-react';

interface CanisterVisualMapProps {
  tank: SemenTank;
  canisters: TankCanister[];
  balances: InventoryBalance[];
  onSelectCanisterForAction?: (canister: TankCanister, action: 'inbound' | 'outbound' | 'transfer') => void;
  onClose?: () => void;
}

export default function CanisterVisualMap({
  tank,
  canisters,
  balances,
  onSelectCanisterForAction,
  onClose,
}: CanisterVisualMapProps) {
  const [selectedCanister, setSelectedCanister] = useState<TankCanister | null>(null);

  // Filtrar saldos do botijão
  const tankBalances = balances.filter((b) => b.tank_id === tank.id);

  // Agrupar saldos por caneca
  const canisterBalancesMap = new Map<string, InventoryBalance[]>();
  tankBalances.forEach((b) => {
    const list = canisterBalancesMap.get(b.canister_id) || [];
    list.push(b);
    canisterBalancesMap.set(b.canister_id, list);
  });

  const activeCanister = selectedCanister || canisters[0] || null;
  const activeBalances = activeCanister ? canisterBalancesMap.get(activeCanister.id) || [] : [];
  const activeDoses = activeBalances.reduce((acc, b) => acc + (b.quantity_available || 0), 0);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-bold text-xs">
              {tank.number}
            </span>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              {tank.name}
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Mapa criogênico e ocupação por caneca • {tank.brand || 'Marca n/d'} • {tank.model || 'Modelo n/d'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right pr-2">
            <p className="text-[11px] text-slate-400">Total no Botijão</p>
            <p className="text-base font-extrabold text-emerald-400 font-mono">
              {tank.total_doses || 0} <span className="text-xs font-normal text-slate-400">doses</span>
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Fechar mapa"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Visual Canister Grid (Esquerda) */}
        <div className="lg:col-span-7 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              Canecas Criogênicas ({canisters.length} posições)
            </span>
            <span className="text-[11px] text-slate-400">Clique em uma caneca para inspecionar</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
            {canisters.map((canister) => {
              const bList = canisterBalancesMap.get(canister.id) || [];
              const doses = bList.reduce((acc, b) => acc + (b.quantity_available || 0), 0);
              const isSelected = activeCanister?.id === canister.id;

              // Cor baseada em ocupação
              let badgeColor = 'bg-slate-800 text-slate-400 border-slate-700';
              let fillPct = 0;
              if (doses > 0) {
                fillPct = Math.min(100, Math.round((doses / 150) * 100)); // ref ~150 doses máx estimada por caneca
                badgeColor = doses >= 80 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                  : 'bg-teal-500/15 text-teal-300 border-teal-500/30';
              }

              return (
                <button
                  key={canister.id}
                  onClick={() => setSelectedCanister(canister)}
                  className={`relative flex flex-col items-center justify-between p-3 rounded-xl border transition-all cursor-pointer text-center group ${
                    isSelected
                      ? 'bg-emerald-500/15 border-emerald-500 shadow-md shadow-emerald-500/10 scale-[1.02]'
                      : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                  }`}
                >
                  {/* Top indicator */}
                  <div className="w-full flex items-center justify-between mb-2">
                    <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center font-mono font-bold text-[10px] text-slate-300 group-hover:text-emerald-400">
                      {canister.position_number}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${badgeColor}`}>
                      {doses} un
                    </span>
                  </div>

                  {/* Canister visual shape */}
                  <div className="w-12 h-16 rounded-b-xl border-2 border-slate-700 relative overflow-hidden bg-slate-950 flex flex-col justify-end p-0.5 group-hover:border-emerald-400/60 transition-colors">
                    <div
                      className="w-full rounded-b-lg bg-linear-to-t from-emerald-600 to-teal-400 transition-all duration-300"
                      style={{ height: `${Math.max(6, fillPct)}%` }}
                    />
                  </div>

                  <span className="text-[11px] font-semibold text-slate-300 mt-2 truncate max-w-full">
                    {canister.nickname || `Caneca ${canister.position_number}`}
                  </span>
                  <span className="text-[9px] text-slate-400">
                    {bList.length} {bList.length === 1 ? 'partida' : 'partidas'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Canister Details (Direita) */}
        <div className="lg:col-span-5 bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-4">
          {activeCanister ? (
            <>
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-mono text-xs">
                      #{activeCanister.position_number}
                    </span>
                    {activeCanister.nickname || `Caneca ${activeCanister.position_number}`}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Detalhes do conteúdo armazenado nesta posição
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-extrabold text-emerald-400">
                    {activeDoses} doses
                  </span>
                  <p className="text-[10px] text-slate-400">Disponíveis</p>
                </div>
              </div>

              {/* Lotes na Caneca */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                {activeBalances.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    <Package className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    Esta caneca está vazia no momento.
                  </div>
                ) : (
                  activeBalances.map((b) => {
                    const mat = b.genetic_material_batches?.genetic_materials;
                    const isSemen = mat?.type === 'SEMEN';
                    const animalName = isSemen 
                      ? (mat?.bulls?.name || 'Touro') 
                      : (mat?.donor_name || mat?.animals?.tag_number || 'Doadora');
                    const isClient = !!b.owner_client_id;

                    return (
                      <div
                        key={b.id}
                        className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded ${
                                isSemen ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              }`}>
                                {isSemen ? 'Sêmen' : 'Embrião'}
                              </span>
                              <span className="text-xs font-bold text-white">{animalName}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Partida: <span className="font-mono text-amber-400">{b.genetic_material_batches?.batch_number}</span>
                              {b.genetic_material_batches?.rack_code && (
                                <> • Rack: <span className="text-slate-300 font-mono">{b.genetic_material_batches.rack_code}</span></>
                              )}
                            </p>
                          </div>
                          <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                            {b.quantity_available} un
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/60">
                          <span className="flex items-center gap-1 truncate">
                            {isClient ? (
                              <span className="text-amber-300 flex items-center gap-1">
                                <User className="w-3 h-3 text-amber-400" />
                                Cliente: {b.genetic_clients?.name}
                              </span>
                            ) : (
                              <span className="text-slate-400 flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                Estoque Próprio
                              </span>
                            )}
                          </span>
                          <span className="text-slate-400 font-mono">
                            {mat?.sexing}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Quick action buttons */}
              {onSelectCanisterForAction && (
                <div className="flex gap-2 pt-2 border-t border-slate-800/80">
                  <button
                    onClick={() => onSelectCanisterForAction(activeCanister, 'inbound')}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1 transition-all"
                  >
                    Entrada Aqui <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  {activeBalances.length > 0 && (
                    <button
                      onClick={() => onSelectCanisterForAction(activeCanister, 'transfer')}
                      className="px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium py-2 rounded-xl text-xs transition-colors"
                    >
                      Transferir
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-slate-400 text-xs">
              Nenhuma caneca selecionada.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
