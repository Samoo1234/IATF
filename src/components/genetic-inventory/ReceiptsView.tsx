'use client';

import React, { useState } from 'react';
import type { WithdrawalReceipt } from '@/lib/types/genetic-inventory';
import { Search, Eye } from 'lucide-react';
import ReceiptViewerModal from './ReceiptViewerModal';

interface ReceiptsViewProps {
  receipts: WithdrawalReceipt[];
  farmName?: string;
}

export default function ReceiptsView({
  receipts,
  farmName = 'Fazenda',
}: ReceiptsViewProps) {
  const [search, setSearch] = useState('');
  const [activeReceipt, setActiveReceipt] = useState<WithdrawalReceipt | null>(null);

  const filteredReceipts = receipts.filter((r) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase().trim();
    const num = r.receipt_number.toLowerCase();
    const recipient = r.recipient_name?.toLowerCase() || '';
    const mov = r.genetic_inventory_movements;
    const animal = mov?.genetic_material_batches?.genetic_materials?.bulls?.name?.toLowerCase() || '';
    const batch = mov?.genetic_material_batches?.batch_number?.toLowerCase() || '';

    return num.includes(s) || recipient.includes(s) || animal.includes(s) || batch.includes(s);
  });

  return (
    <div className="space-y-4">
      {/* Search Header */}
      <div className="glass-card bg-slate-900/90 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por número de comprovante, recebedor, animal ou partida..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-white text-xs pl-10 pr-4 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Receipts Table */}
      <div className="glass-card bg-slate-900/95 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="p-3">Nº Comprovante</th>
                <th className="p-3">Data / Hora</th>
                <th className="p-3">Material / Animal</th>
                <th className="p-3">Partida</th>
                <th className="p-3 text-right">Qtd. Retirada</th>
                <th className="p-3">Recebedor</th>
                <th className="p-3">Operador</th>
                <th className="p-3 text-center">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/70 bg-slate-900/60 font-mono">
              {filteredReceipts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-400 font-sans">
                    Nenhum comprovante de retirada emitido até o momento.
                  </td>
                </tr>
              ) : (
                filteredReceipts.map((r) => {
                  const mov = r.genetic_inventory_movements;
                  const mat = mov?.genetic_material_batches?.genetic_materials;
                  const isSemen = mat?.type === 'SEMEN';
                  const aName = isSemen 
                    ? (mat?.bulls?.name || 'Touro') 
                    : (mat?.donor_name || mat?.animals?.tag_number || 'Doadora');

                  return (
                    <tr key={r.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-3 font-bold text-emerald-400">
                        {r.receipt_number}
                      </td>
                      <td className="p-3 font-sans text-slate-300">
                        {new Date(r.generated_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="p-3 font-sans">
                        <div className="font-bold text-white text-xs">{aName}</div>
                        <div className="text-[10px] text-slate-400">
                          {isSemen ? 'Sêmen Bovino' : 'Embrião'}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-slate-950 text-amber-400 border border-slate-800">
                          {mov?.genetic_material_batches?.batch_number || '-'}
                        </span>
                      </td>
                      <td className="p-3 text-right font-extrabold text-white">
                        {mov?.quantity || 0} doses
                      </td>
                      <td className="p-3 font-sans text-slate-200">
                        {r.recipient_name || '-'}
                      </td>
                      <td className="p-3 font-sans text-slate-400">
                        {r.generated_by || 'Sistema'}
                      </td>
                      <td className="p-3 text-center font-sans">
                        <button
                          onClick={() => setActiveReceipt(r)}
                          className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" /> Visualizar & Imprimir
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Viewer Modal */}
      {activeReceipt && (
        <ReceiptViewerModal
          receipt={activeReceipt}
          farmName={farmName}
          onClose={() => setActiveReceipt(null)}
        />
      )}
    </div>
  );
}
