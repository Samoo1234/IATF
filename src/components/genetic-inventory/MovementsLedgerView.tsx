'use client';

import React, { useState } from 'react';
import type { InventoryMovement, GeneticMaterialType } from '@/lib/types/genetic-inventory';
import { 
  Download, 
  RotateCcw, 
  Search, 
  X, 
  RefreshCw 
} from 'lucide-react';
import { exportMovementsToExcel, processReversal } from '@/lib/services/geneticInventoryService';

interface MovementsLedgerViewProps {
  farmId: string;
  movements: InventoryMovement[];
  farmName?: string;
  activeMaterialType?: GeneticMaterialType;
  onRefresh: () => Promise<void>;
}

export default function MovementsLedgerView({
  farmId,
  movements,
  farmName = 'Fazenda',
  activeMaterialType,
  onRefresh,
}: MovementsLedgerViewProps) {
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [reversingMovement, setReversingMovement] = useState<InventoryMovement | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [submittingReversal, setSubmittingReversal] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);

  const filteredMovements = movements.filter((m) => {
    if (activeMaterialType && m.material_type !== activeMaterialType) {
      return false;
    }
    if (selectedType && m.movement_type !== selectedType) {
      return false;
    }
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      const mat = m.genetic_material_batches?.genetic_materials;
      const animal = mat?.bulls?.name?.toLowerCase() || mat?.donor_name?.toLowerCase() || '';
      const batch = m.genetic_material_batches?.batch_number?.toLowerCase() || '';
      const reason = m.reason?.toLowerCase() || '';
      const operator = m.created_by?.toLowerCase() || '';
      const client = m.genetic_clients?.name?.toLowerCase() || '';

      return (
        animal.includes(s) ||
        batch.includes(s) ||
        reason.includes(s) ||
        operator.includes(s) ||
        client.includes(s)
      );
    }
    return true;
  });

  const handleConfirmReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingMovement || !reversalReason.trim()) return;
    setSubmittingReversal(true);
    setReversalError(null);

    const res = await processReversal(farmId, reversingMovement.id, reversalReason.trim());
    setSubmittingReversal(false);
    if (res.success) {
      setReversingMovement(null);
      setReversalReason('');
      await onRefresh();
    } else {
      setReversalError(res.error || 'Erro ao processar estorno.');
    }
  };

  const getMovementBadge = (type: string) => {
    switch (type) {
      case 'INBOUND':
        return <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-bold">ENTRADA</span>;
      case 'OUTBOUND':
        return <span className="bg-rose-500/15 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded font-bold">RETIRADA</span>;
      case 'TRANSFER_IN':
        return <span className="bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded font-bold">TRANSF. ENTRADA</span>;
      case 'TRANSFER_OUT':
        return <span className="bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded font-bold">TRANSF. SAÍDA</span>;
      case 'USAGE':
        return <span className="bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded font-bold">USO IATF</span>;
      case 'LOSS':
        return <span className="bg-red-500/20 text-red-300 border border-red-500/40 px-2 py-0.5 rounded font-bold">PERDA</span>;
      case 'ADJUSTMENT_POSITIVE':
        return <span className="bg-teal-500/15 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded font-bold">AJUSTE (+)</span>;
      case 'ADJUSTMENT_NEGATIVE':
        return <span className="bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-bold">AJUSTE (-)</span>;
      case 'REVERSAL':
        return <span className="bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded font-bold">ESTORNO</span>;
      default:
        return <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded">{type}</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and export bar */}
      <div className="glass-card bg-slate-900/90 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por animal, partida, motivo, operador ou cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-white text-xs pl-10 pr-4 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
            />
          </div>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs px-3 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
          >
            <option value="">Todos os Tipos</option>
            <option value="INBOUND">Entrada</option>
            <option value="OUTBOUND">Retirada</option>
            <option value="TRANSFER_IN">Transferência (Entrada)</option>
            <option value="TRANSFER_OUT">Transferência (Saída)</option>
            <option value="USAGE">Uso em IATF</option>
            <option value="LOSS">Perda</option>
            <option value="ADJUSTMENT_POSITIVE">Ajuste (+)</option>
            <option value="ADJUSTMENT_NEGATIVE">Ajuste (-)</option>
            <option value="REVERSAL">Estorno</option>
          </select>
        </div>

        <button
          onClick={() => exportMovementsToExcel(filteredMovements, farmName)}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-colors shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-emerald-400" /> Exportar Livro Razão
        </button>
      </div>

      {/* Movements Table */}
      <div className="glass-card bg-slate-900/95 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="p-3">Data / Hora</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Animal / Genética</th>
                <th className="p-3">Partida</th>
                <th className="p-3 text-right">Qtd.</th>
                <th className="p-3">Origem</th>
                <th className="p-3">Destino</th>
                <th className="p-3">Motivo / Operador</th>
                <th className="p-3 text-center">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/70 bg-slate-900/60 font-mono">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-slate-400 font-sans">
                    Nenhuma movimentação encontrada no livro razão.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => {
                  const mat = m.genetic_material_batches?.genetic_materials;
                  const isSemen = m.material_type === 'SEMEN';
                  const aName = isSemen 
                    ? (mat?.bulls?.name || 'Touro') 
                    : (mat?.donor_name || mat?.animals?.tag_number || 'Doadora');
                  const canReverse = m.movement_type !== 'REVERSAL';

                  return (
                    <tr key={m.id} className="hover:bg-slate-800/50 transition-colors">
                      {/* Data / Hora */}
                      <td className="p-3 font-sans whitespace-nowrap text-slate-300 text-[11px]">
                        {new Date(m.occurred_at).toLocaleString('pt-BR')}
                      </td>

                      {/* Tipo */}
                      <td className="p-3 font-sans whitespace-nowrap">
                        {getMovementBadge(m.movement_type)}
                      </td>

                      {/* Animal */}
                      <td className="p-3 font-sans">
                        <div className="font-bold text-white text-xs">{aName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {isSemen ? 'Sêmen' : 'Embrião'} • {mat?.sexing || 'convencional'}
                        </div>
                      </td>

                      {/* Partida */}
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-slate-950 text-amber-400 border border-slate-800 font-bold text-[11px]">
                          {m.genetic_material_batches?.batch_number}
                        </span>
                      </td>

                      {/* Qtd */}
                      <td className="p-3 text-right">
                        <span className="text-sm font-extrabold text-white">
                          {m.quantity}
                        </span>
                      </td>

                      {/* Origem */}
                      <td className="p-3 font-sans text-[11px]">
                        {m.source_tank ? (
                          <div>
                            <span className="font-bold text-slate-300 font-mono">{m.source_tank.number}</span>
                            <span className="text-slate-400 block text-[10px]">
                              Caneca #{m.source_canister?.position_number}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>

                      {/* Destino */}
                      <td className="p-3 font-sans text-[11px]">
                        {m.dest_tank ? (
                          <div>
                            <span className="font-bold text-emerald-400 font-mono">{m.dest_tank.number}</span>
                            <span className="text-slate-400 block text-[10px]">
                              Caneca #{m.dest_canister?.position_number}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>

                      {/* Motivo & Operador */}
                      <td className="p-3 font-sans">
                        <div className="text-xs text-slate-200">{m.reason || '-'}</div>
                        <div className="text-[10px] text-slate-400">
                          Operador: <span className="text-slate-300">{m.created_by || 'Sistema'}</span>
                          {m.genetic_clients && ` • Cliente: ${m.genetic_clients.name}`}
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="p-3 text-center font-sans">
                        {canReverse && (
                          <button
                            onClick={() => {
                              setReversingMovement(m);
                              setReversalReason('');
                              setReversalError(null);
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-purple-400 hover:text-purple-300 border border-slate-700 transition-colors cursor-pointer"
                            title="Estornar movimentação de forma imutável"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Modal de Confirmação de Estorno ===== */}
      {reversingMovement && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md rounded-2xl border border-purple-500/30 bg-slate-900 p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-purple-400" />
                Confirmar Estorno de Movimentação
              </h3>
              <button
                onClick={() => setReversingMovement(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200 space-y-1">
              <p className="font-bold">Aviso de Auditoria Imutável:</p>
              <p className="text-[11px] text-purple-300">
                O registro original não será apagado. Uma nova movimentação de estorno inverso será gravada e o saldo será ajustado atomicamente.
              </p>
            </div>

            {reversalError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {reversalError}
              </div>
            )}

            <form onSubmit={handleConfirmReversal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Justificativa Obrigatória do Estorno *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Ex: Lançamento incorreto de quantidade; corrigido conforme conferência física."
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submittingReversal}
                  className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
                >
                  {submittingReversal ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  {submittingReversal ? 'Gravando Estorno...' : 'Confirmar Estorno'}
                </button>
                <button
                  type="button"
                  onClick={() => setReversingMovement(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white cursor-pointer text-xs"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
