'use client';

import React, { useState, useEffect } from 'react';
import type { AnimalGeneticPosition, GeneticMaterialType } from '@/lib/types/genetic-inventory';
import { Search, Dna, Package, X, RefreshCw, User, ShieldCheck } from 'lucide-react';
import { searchAnimalGeneticPositions } from '@/lib/services/geneticInventoryService';

interface AnimalGeneticLookupModalProps {
  farmId: string;
  farmName?: string;
  onSelectAction: (action: 'outbound' | 'transfer', position: AnimalGeneticPosition) => void;
  onClose: () => void;
}

export default function AnimalGeneticLookupModal({
  farmId,
  farmName = 'Fazenda',
  onSelectAction,
  onClose,
}: AnimalGeneticLookupModalProps) {
  const [animalType, setAnimalType] = useState<GeneticMaterialType>('SEMEN');
  const [queryText, setQueryText] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AnimalGeneticPosition[]>([]);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!queryText.trim() || queryText.trim().length < 2) return;
    setLoading(true);
    setSearched(true);
    const list = await searchAnimalGeneticPositions(farmId, queryText.trim(), animalType);
    setResults(list);
    setLoading(false);
  };

  useEffect(() => {
    if (queryText.trim().length >= 2) {
      const timer = setTimeout(() => {
        handleSearch();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setResults([]);
      setSearched(false);
    }
  }, [queryText, animalType]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="glass-card w-full max-w-3xl rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden flex flex-col my-auto max-h-[85vh]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-bold">
              <Dna className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Consulta Rápida de Animal — Localização de Doses
              </h3>
              <p className="text-xs text-slate-400">
                Localize imediatamente em quais botijões e canecas há sêmen ou embriões do animal
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search controls */}
        <div className="p-6 space-y-4 border-b border-slate-800/80 bg-slate-950/40">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Toggle Touro vs Doadora */}
            <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 self-start">
              <button
                type="button"
                onClick={() => setAnimalType('SEMEN')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  animalType === 'SEMEN'
                    ? 'bg-emerald-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Reprodutor (Touro)
              </button>
              <button
                type="button"
                onClick={() => setAnimalType('EMBRYO')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  animalType === 'EMBRYO'
                    ? 'bg-purple-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Doadora (Matriz)
              </button>
            </div>

            {/* Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                type="text"
                placeholder={animalType === 'SEMEN' ? 'Digite nome, código ou raça do touro...' : 'Digite nome, tag ou RGD da doadora...'}
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white text-xs pl-10 pr-4 py-2.5 rounded-xl focus:outline-none focus:border-cyan-500 font-sans"
              />
              {loading && (
                <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
              )}
            </div>
          </div>
        </div>

        {/* Results List */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-3">
          {queryText.trim().length < 2 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              <Search className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              Digite ao menos 2 caracteres para pesquisar a localização do material genético.
            </div>
          ) : loading ? (
            <div className="text-center py-12 text-slate-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
              Buscando nos botijões criogênicos...
            </div>
          ) : results.length === 0 && searched ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              <Package className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              Nenhum lote com saldo encontrado para &quot;{queryText}&quot; na fazenda {farmName}.
            </div>
          ) : (
            results.map((pos, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{pos.animalName}</span>
                    {pos.animalCode && (
                      <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                        {pos.animalCode}
                      </span>
                    )}
                    {pos.breedName && (
                      <span className="text-[10px] text-slate-300">({pos.breedName})</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 pt-1">
                    <span>Partida: <strong className="text-amber-400 font-mono">{pos.batchNumber}</strong></span>
                    {pos.rackCode && <span>• Rack: <strong className="text-slate-300 font-mono">{pos.rackCode}</strong></span>}
                    <span>• Local: <strong className="text-emerald-400 font-mono">{pos.tankNumber} ({pos.tankName})</strong></span>
                    <span>• Caneca #{pos.canisterPosition}</span>
                  </div>

                  <div className="text-[10px] text-slate-400 pt-0.5 flex items-center gap-2">
                    {pos.ownerClientName ? (
                      <span className="text-amber-300 flex items-center gap-1">
                        <User className="w-3 h-3 text-amber-400" />
                        Cliente: {pos.ownerClientName}
                      </span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        Estoque Próprio
                      </span>
                    )}
                    <span>• Sexagem: {pos.sexing}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <div className="text-right">
                    <span className="text-base font-extrabold text-white font-mono block">
                      {pos.quantityAvailable} <span className="text-xs font-normal text-slate-400">doses</span>
                    </span>
                    <span className="text-[10px] text-emerald-400 font-semibold">Disponível</span>
                  </div>

                  <div className="flex gap-1.5">
                    <button
                      onClick={() => onSelectAction('outbound', pos)}
                      className="bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-bold px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer"
                      title="Iniciar retirada deste lote"
                    >
                      Retirar
                    </button>
                    <button
                      onClick={() => onSelectAction('transfer', pos)}
                      className="bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 font-bold px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer"
                      title="Transferir para outro botijão/caneca"
                    >
                      Transferir
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
