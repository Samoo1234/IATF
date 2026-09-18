'use client';

import React, { useState } from 'react';
import type { 
  SemenTank, 
  InventoryBalance, 
  TankCanister, 
  NitrogenMeasurement,
  GeneticMaterialType
} from '@/lib/types/genetic-inventory';
import { 
  Layers, 
  Plus, 
  Thermometer, 
  AlertTriangle, 
  CheckCircle2, 
  Activity, 
  History, 
  X, 
  Package, 
  RefreshCw 
} from 'lucide-react';
import CanisterVisualMap from './CanisterVisualMap';
import { createTank, recordNitrogenMeasurement, getCanisters, getNitrogenHistory } from '@/lib/services/geneticInventoryService';

interface TanksViewProps {
  farmId: string;
  tanks: SemenTank[];
  balances: InventoryBalance[];
  onRefresh: () => Promise<void>;
  onStartMovementAction?: (action: 'inbound' | 'outbound' | 'transfer', prefill?: { tankId?: string; canisterId?: string; batchId?: string; balanceId?: string; materialType?: GeneticMaterialType }) => void;
}

export default function TanksView({
  farmId,
  tanks,
  balances,
  onRefresh,
  onStartMovementAction,
}: TanksViewProps) {
  const [selectedTankForMap, setSelectedTankForMap] = useState<SemenTank | null>(null);
  const [tankCanisters, setTankCanisters] = useState<TankCanister[]>([]);
  const [loadingCanisters, setLoadingCanisters] = useState(false);

  // Modal Novo Botijão
  const [showNewTankModal, setShowNewTankModal] = useState(false);
  const [creatingTank, setCreatingTank] = useState(false);
  const [newTankForm, setNewTankForm] = useState({
    number: '',
    name: '',
    brand: '',
    model: '',
    serial_number: '',
    capacity_notes: '',
    current_nitrogen_level: 100,
    minimum_nitrogen_level: 25,
    initial_canisters_count: 10,
    notes: '',
  });

  // Modal Medição N2
  const [measuringTank, setMeasuringTank] = useState<SemenTank | null>(null);
  const [measurementLevel, setMeasurementLevel] = useState<number>(100);
  const [measurementNotes, setMeasurementNotes] = useState('');
  const [savingMeasurement, setSavingMeasurement] = useState(false);

  // Modal Histórico N2
  const [historyTank, setHistoryTank] = useState<SemenTank | null>(null);
  const [nitrogenHistory, setNitrogenHistory] = useState<NitrogenMeasurement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const handleOpenMap = async (tank: SemenTank) => {
    setSelectedTankForMap(tank);
    setLoadingCanisters(true);
    const canisters = await getCanisters(tank.id);
    setTankCanisters(canisters);
    setLoadingCanisters(false);
  };

  const handleCreateTank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTankForm.number || !newTankForm.name) return;
    setCreatingTank(true);
    const res = await createTank(farmId, newTankForm);
    setCreatingTank(false);
    if (res.success) {
      setShowNewTankModal(false);
      setNewTankForm({
        number: '',
        name: '',
        brand: '',
        model: '',
        serial_number: '',
        capacity_notes: '',
        current_nitrogen_level: 100,
        minimum_nitrogen_level: 25,
        initial_canisters_count: 10,
        notes: '',
      });
      await onRefresh();
    } else {
      alert(res.error || 'Erro ao criar botijão.');
    }
  };

  const handleSaveMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!measuringTank) return;
    setSavingMeasurement(true);
    const res = await recordNitrogenMeasurement(
      farmId,
      measuringTank.id,
      measurementLevel,
      measurementNotes
    );
    setSavingMeasurement(false);
    if (res.success) {
      setMeasuringTank(null);
      setMeasurementNotes('');
      await onRefresh();
    } else {
      alert(res.error || 'Erro ao registrar medição de N2.');
    }
  };

  const handleOpenHistory = async (tank: SemenTank) => {
    setHistoryTank(tank);
    setLoadingHistory(true);
    const history = await getNitrogenHistory(tank.id);
    setNitrogenHistory(history);
    setLoadingHistory(false);
  };

  return (
    <div className="space-y-6">
      {/* Header com Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Thermometer className="w-5 h-5 text-emerald-400" />
            Gestão de Botijões Criogênicos
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Monitore níveis de nitrogênio líquido, ocupação das canecas e capacidade de armazenamento.
          </p>
        </div>

        <button
          onClick={() => setShowNewTankModal(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-md self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Cadastrar Botijão
        </button>
      </div>

      {/* Mapa Visual de Canecas (quando um botijão for selecionado) */}
      {selectedTankForMap && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300">
          {loadingCanisters ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 flex items-center justify-center gap-2 text-sm">
              <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" /> Carregando canecas do botijão...
            </div>
          ) : (
            <CanisterVisualMap
              tank={selectedTankForMap}
              canisters={tankCanisters}
              balances={balances}
              onClose={() => setSelectedTankForMap(null)}
              onSelectCanisterForAction={(canister, action) => {
                if (onStartMovementAction) {
                  onStartMovementAction(action, {
                    tankId: selectedTankForMap.id,
                    canisterId: canister.id,
                  });
                }
              }}
            />
          )}
        </div>
      )}

      {/* Grid de Cards de Botijões */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {tanks.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-400 glass-card rounded-2xl border border-slate-800">
            <Package className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-base font-semibold text-slate-300">Nenhum botijão cadastrado nesta fazenda.</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">Cadastre o primeiro botijão criogênico para iniciar o controle.</p>
            <button
              onClick={() => setShowNewTankModal(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs"
            >
              Cadastrar Agora
            </button>
          </div>
        ) : (
          tanks.map((tank) => {
            const isLowN2 = tank.current_nitrogen_level <= tank.minimum_nitrogen_level;
            const isWarning = tank.current_nitrogen_level <= tank.minimum_nitrogen_level + 15 && !isLowN2;

            let n2Color = 'text-emerald-400';
            let barColor = 'bg-emerald-500';
            let statusBadge = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

            if (isLowN2) {
              n2Color = 'text-rose-400 font-bold';
              barColor = 'bg-rose-500';
              statusBadge = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
            } else if (isWarning) {
              n2Color = 'text-amber-400';
              barColor = 'bg-amber-500';
              statusBadge = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
            }

            return (
              <div
                key={tank.id}
                className="glass-card bg-slate-900/90 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all p-5 flex flex-col justify-between space-y-4 shadow-lg"
              >
                {/* Top header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-mono font-black uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                      {tank.number}
                    </span>
                    <h3 className="text-base font-bold text-white mt-1.5">{tank.name}</h3>
                    <p className="text-xs text-slate-400">
                      {tank.brand || 'Marca não informada'} {tank.model ? `• ${tank.model}` : ''}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${statusBadge}`}>
                    {tank.status}
                  </span>
                </div>

                {/* N2 Gauge & Progress */}
                <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Thermometer className="w-3.5 h-3.5 text-cyan-400" />
                      Nível de Nitrogênio (N2)
                    </span>
                    <span className={`font-mono text-sm font-bold ${n2Color}`}>
                      {tank.current_nitrogen_level.toFixed(0)}%
                    </span>
                  </div>

                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${Math.min(100, Math.max(0, tank.current_nitrogen_level))}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                    <span>Mínimo seguro: {tank.minimum_nitrogen_level}%</span>
                    {isLowN2 ? (
                      <span className="text-rose-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Reabastecer Urgente
                      </span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Nível Seguro
                      </span>
                    )}
                  </div>
                </div>

                {/* Storage metrics */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                    <p className="text-[10px] text-slate-400">Total Armazenado</p>
                    <p className="text-sm font-bold text-white font-mono mt-0.5">
                      {tank.total_doses || 0} <span className="text-[10px] font-normal text-slate-400">doses</span>
                    </p>
                  </div>
                  <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                    <p className="text-[10px] text-slate-400">Canecas Ativas</p>
                    <p className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
                      {tank.canisters_count || 0} <span className="text-[10px] font-normal text-slate-400">posições</span>
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                  <button
                    onClick={() => handleOpenMap(tank)}
                    className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-bold py-2 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" /> Mapa de Canecas
                  </button>

                  <button
                    onClick={() => {
                      setMeasuringTank(tank);
                      setMeasurementLevel(tank.current_nitrogen_level);
                    }}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors cursor-pointer"
                    title="Registrar medição de nitrogênio"
                  >
                    <Activity className="w-4 h-4 text-cyan-400" />
                  </button>

                  <button
                    onClick={() => handleOpenHistory(tank)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors cursor-pointer"
                    title="Histórico de medições de nitrogênio"
                  >
                    <History className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ===== Modal Novo Botijão ===== */}
      {showNewTankModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                Cadastrar Novo Botijão Criogênico
              </h3>
              <button
                onClick={() => setShowNewTankModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTank} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Identificação / Código *</label>
                  <input
                    required
                    type="text"
                    placeholder="Ex: BOT-03"
                    value={newTankForm.number}
                    onChange={(e) => setNewTankForm({ ...newTankForm, number: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Apelido / Nome *</label>
                  <input
                    required
                    type="text"
                    placeholder="Ex: Botijão Retiro Norte"
                    value={newTankForm.name}
                    onChange={(e) => setNewTankForm({ ...newTankForm, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Marca</label>
                  <input
                    type="text"
                    placeholder="Ex: MVE Chart"
                    value={newTankForm.brand}
                    onChange={(e) => setNewTankForm({ ...newTankForm, brand: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Modelo</label>
                  <input
                    type="text"
                    placeholder="Ex: XC 47/11"
                    value={newTankForm.model}
                    onChange={(e) => setNewTankForm({ ...newTankForm, model: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Número de Série</label>
                  <input
                    type="text"
                    placeholder="Ex: SN-88219"
                    value={newTankForm.serial_number}
                    onChange={(e) => setNewTankForm({ ...newTankForm, serial_number: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Nº de Canecas</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={newTankForm.initial_canisters_count}
                    onChange={(e) => setNewTankForm({ ...newTankForm, initial_canisters_count: parseInt(e.target.value) || 10 })}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Nível N2 Inicial (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newTankForm.current_nitrogen_level}
                    onChange={(e) => setNewTankForm({ ...newTankForm, current_nitrogen_level: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Mínimo Alerta (%)</label>
                  <input
                    type="number"
                    min="5"
                    max="50"
                    value={newTankForm.minimum_nitrogen_level}
                    onChange={(e) => setNewTankForm({ ...newTankForm, minimum_nitrogen_level: parseFloat(e.target.value) || 25 })}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Observações de Capacidade / Localização</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Armazenado no galpão central, rack 2."
                  value={newTankForm.notes}
                  onChange={(e) => setNewTankForm({ ...newTankForm, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={creatingTank}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {creatingTank ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {creatingTank ? 'Salvando...' : 'Salvar Botijão'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewTankModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Modal Medição de Nitrogênio ===== */}
      {measuringTank && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Thermometer className="w-5 h-5 text-cyan-400" />
                Medição de Nitrogênio — {measuringTank.number}
              </h3>
              <button
                onClick={() => setMeasuringTank(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMeasurement} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Nível Medido com a Régua (%) *
                </label>
                <input
                  required
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={measurementLevel}
                  onChange={(e) => setMeasurementLevel(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-base px-3 py-2 rounded-xl focus:outline-none focus:border-cyan-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Mínimo configurado: {measuringTank.minimum_nitrogen_level}%
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Observações (Ex: reposição feita, verificação de rotina)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Reabastecido com 20L de N2 líquido."
                  value={measurementNotes}
                  onChange={(e) => setMeasurementNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={savingMeasurement}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {savingMeasurement ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                  {savingMeasurement ? 'Salvando...' : 'Confirmar Medição'}
                </button>
                <button
                  type="button"
                  onClick={() => setMeasuringTank(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Modal Histórico de Nitrogênio ===== */}
      {historyTank && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-slate-400" />
                Histórico de N2 — {historyTank.name} ({historyTank.number})
              </h3>
              <button
                onClick={() => setHistoryTank(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingHistory ? (
              <div className="py-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" /> Carregando histórico...
              </div>
            ) : nitrogenHistory.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                Nenhuma medição registrada ainda para este botijão.
              </div>
            ) : (
              <div className="space-y-2 max-h-[350px] overflow-y-auto custom-scrollbar pr-1">
                {nitrogenHistory.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-bold text-white">
                        {new Date(m.measured_at).toLocaleString('pt-BR')}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Responsável: {m.measured_by || 'Operador'} {m.notes ? `• ${m.notes}` : ''}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-extrabold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-lg">
                      {m.level_percent}%
                    </span>
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
