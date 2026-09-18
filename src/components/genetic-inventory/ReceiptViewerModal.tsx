'use client';

import React from 'react';
import type { WithdrawalReceipt } from '@/lib/types/genetic-inventory';
import { Printer, X } from 'lucide-react';

interface ReceiptViewerModalProps {
  receipt: WithdrawalReceipt;
  farmName?: string;
  onClose: () => void;
}

export default function ReceiptViewerModal({
  receipt,
  farmName = 'Fazenda Modelo',
  onClose,
}: ReceiptViewerModalProps) {
  const mov = receipt.genetic_inventory_movements;
  const batch = mov?.genetic_material_batches;
  const mat = batch?.genetic_materials;
  const isSemen = mat?.type === 'SEMEN';
  const animalName = isSemen 
    ? (mat?.bulls?.name || 'Touro') 
    : (mat?.donor_name || mat?.animals?.tag_number || 'Doadora');
  const animalCode = isSemen ? mat?.bulls?.code : mat?.donor_rgd;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col print:border-none print:shadow-none print:w-full print:max-w-full print:bg-white print:text-black">
        
        {/* Modal Controls (Hidden in Print) */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Comprovante Oficial de Retirada
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimir / Salvar PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="p-8 space-y-6 text-slate-200 print:text-black print:p-6 print:space-y-4">
          
          {/* Header */}
          <div className="flex items-start justify-between border-b-2 border-slate-800 pb-5 print:border-slate-300">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-linear-to-tr from-emerald-600 to-teal-400 flex items-center justify-center font-black text-slate-950 text-xs shadow-md print:border print:border-black">
                  IATF
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-white print:text-black tracking-tight">
                    IATF Master
                  </h1>
                  <p className="text-xs text-slate-400 print:text-slate-600 font-medium">
                    {farmName} • Sistema de Reprodução Bovina
                  </p>
                </div>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-bold uppercase text-emerald-400 print:text-emerald-800 tracking-wider">
                COMPROVANTE DE RETIRADA
              </span>
              <p className="text-sm font-mono font-extrabold text-white print:text-black mt-0.5">
                {receipt.receipt_number}
              </p>
              <p className="text-[11px] text-slate-400 print:text-slate-600 mt-0.5">
                Emissão: {new Date(receipt.generated_at).toLocaleString('pt-BR')}
              </p>
            </div>
          </div>

          {/* Dados do Material */}
          <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 print:border-slate-300 print:bg-slate-50 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 print:text-emerald-800 border-b border-slate-800/60 pb-1.5 print:border-slate-300">
              Identificação do Material Genético
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 print:text-slate-600 block">Tipo:</span>
                <span className="font-bold text-white print:text-black">{isSemen ? 'Sêmen Bovino' : 'Embrião'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 print:text-slate-600 block">Animal:</span>
                <span className="font-bold text-white print:text-black">{animalName}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 print:text-slate-600 block">Código / RGD:</span>
                <span className="font-mono text-white print:text-black">{animalCode || '-'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 print:text-slate-600 block">Raça:</span>
                <span className="text-white print:text-black">{mat?.breeds?.name || '-'}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-t border-slate-800/60 pt-2 print:border-slate-300">
              <div>
                <span className="text-[10px] text-slate-400 print:text-slate-600 block">Partida / Lote:</span>
                <span className="font-mono font-bold text-amber-400 print:text-amber-800">{batch?.batch_number}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 print:text-slate-600 block">Rack:</span>
                <span className="font-mono text-white print:text-black">{batch?.rack_code || '-'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 print:text-slate-600 block">Central Fornecedora:</span>
                <span className="text-white print:text-black">{batch?.genetic_centers?.name || '-'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 print:text-slate-600 block">Sexagem:</span>
                <span className="text-white print:text-black capitalize">{mat?.sexing || 'convencional'}</span>
              </div>
            </div>
          </div>

          {/* Origem e Quantidade */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="bg-slate-950/50 p-3.5 rounded-xl border border-slate-800 print:border-slate-300 print:bg-slate-50">
              <span className="text-[10px] text-slate-400 print:text-slate-600 block">Botijão & Caneca de Origem</span>
              <p className="font-bold text-white print:text-black text-sm mt-0.5 font-mono">
                {mov?.source_tank?.number} {mov?.source_canister ? `(Caneca ${mov.source_canister.position_number})` : ''}
              </p>
              <p className="text-[10px] text-slate-400 print:text-slate-600">{mov?.source_tank?.name}</p>
            </div>

            <div className="bg-slate-950/50 p-3.5 rounded-xl border border-slate-800 print:border-slate-300 print:bg-slate-50">
              <span className="text-[10px] text-slate-400 print:text-slate-600 block">Propriedade do Material</span>
              <p className="font-bold text-white print:text-black text-sm mt-0.5">
                {mov?.genetic_clients?.name ? `Cliente: ${mov.genetic_clients.name}` : 'Estoque Próprio'}
              </p>
              <p className="text-[10px] text-slate-400 print:text-slate-600">
                {mov?.genetic_clients?.document_number || 'Fazenda'}
              </p>
            </div>

            <div className="bg-emerald-500/10 p-3.5 rounded-xl border border-emerald-500/30 print:border-emerald-700 print:bg-emerald-50">
              <span className="text-[10px] text-emerald-400 print:text-emerald-800 block font-bold">Quantidade Retirada</span>
              <p className="font-black text-emerald-400 print:text-emerald-800 text-xl font-mono mt-0.5">
                {mov?.quantity} doses
              </p>
            </div>
          </div>

          {/* Finalidade e Observações */}
          <div className="text-xs space-y-2 border-t border-slate-800/80 pt-3 print:border-slate-300">
            <div>
              <span className="text-[10px] text-slate-400 print:text-slate-600 block font-bold">Finalidade Registrada:</span>
              <span className="text-white print:text-black font-semibold">{mov?.reason || '-'}</span>
            </div>
            {mov?.notes && (
              <div>
                <span className="text-[10px] text-slate-400 print:text-slate-600 block">Observações:</span>
                <span className="text-slate-300 print:text-slate-700">{mov.notes}</span>
              </div>
            )}
          </div>

          {/* Assinaturas */}
          <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-800 print:border-slate-400">
            <div className="text-center space-y-1">
              <div className="border-b border-slate-700 print:border-black h-8 mb-1" />
              <p className="text-xs font-bold text-white print:text-black">
                {receipt.recipient_name || 'Recebedor'}
              </p>
              <p className="text-[10px] text-slate-400 print:text-slate-600">
                {receipt.recipient_document ? `Documento: ${receipt.recipient_document}` : 'Assinatura do Responsável'}
              </p>
            </div>

            <div className="text-center space-y-1">
              <div className="border-b border-slate-700 print:border-black h-8 mb-1" />
              <p className="text-xs font-bold text-white print:text-black">
                {receipt.generated_by || 'Operador Responsável'}
              </p>
              <p className="text-[10px] text-slate-400 print:text-slate-600">
                Operador do Sistema IATF Master
              </p>
            </div>
          </div>

          {/* Footer & Hash */}
          <div className="flex items-center justify-between text-[9px] text-slate-500 print:text-slate-600 pt-4 border-t border-slate-800/60 print:border-slate-300">
            <span>Autenticação: {receipt.file_hash || receipt.receipt_number}</span>
            <span>Documento gerado eletronicamente pelo Sistema IATF Master</span>
          </div>
        </div>

      </div>
    </div>
  );
}
