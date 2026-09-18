'use client';

import React, { useState, useMemo } from 'react';
import type { InventoryBalance, SemenTank, GeneticClient, GeneticMaterialType } from '@/lib/types/genetic-inventory';
import { 
  Search, 
  Download, 
  ArrowUpDown, 
  Package, 
  AlertTriangle, 
  User, 
  ShieldCheck, 
  ArrowRightLeft, 
  LogOut, 
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { exportInventoryToExcel } from '@/lib/services/geneticInventoryService';

interface InventoryTableViewProps {
  balances: InventoryBalance[];
  tanks: SemenTank[];
  clients: GeneticClient[];
  farmName?: string;
  activeMaterialType?: GeneticMaterialType;
  onStartAction?: (action: 'outbound' | 'transfer', balance: InventoryBalance) => void;
}

export default function InventoryTableView({
  balances,
  tanks,
  clients,
  farmName = 'Fazenda',
  activeMaterialType,
  onStartAction,
}: InventoryTableViewProps) {
  const [search, setSearch] = useState('');
  const [selectedTank, setSelectedTank] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedSexing, setSelectedSexing] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'own' | 'client'>('all');
  const [sortField, setSortField] = useState<string>('quantity_available');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const filteredBalances = useMemo(() => {
    return balances.filter((b) => {
      const mat = b.genetic_material_batches?.genetic_materials;
      if (activeMaterialType && mat?.type !== activeMaterialType) {
        return false;
      }

      if (selectedTank && b.tank_id !== selectedTank) {
        return false;
      }

      if (selectedClient && b.owner_client_id !== selectedClient) {
        return false;
      }

      if (ownershipFilter === 'own' && b.owner_client_id !== null) {
        return false;
      }
      if (ownershipFilter === 'client' && b.owner_client_id === null) {
        return false;
      }

      if (selectedSexing && mat?.sexing !== selectedSexing) {
        return false;
      }

      if (lowStockOnly && b.quantity_available >= 10) {
        return false;
      }

      if (search.trim()) {
        const s = search.toLowerCase().trim();
        const isSemen = mat?.type === 'SEMEN';
        const animalName = isSemen 
          ? (mat?.bulls?.name?.toLowerCase() || '') 
          : (mat?.donor_name?.toLowerCase() || mat?.animals?.tag_number?.toLowerCase() || '');
        const bullCode = mat?.bulls?.code?.toLowerCase() || '';
        const batchNum = b.genetic_material_batches?.batch_number?.toLowerCase() || '';
        const rack = b.genetic_material_batches?.rack_code?.toLowerCase() || '';
        const tankName = b.semen_tanks?.name?.toLowerCase() || b.semen_tanks?.number?.toLowerCase() || '';
        const clientName = b.genetic_clients?.name?.toLowerCase() || '';
        const breed = mat?.breeds?.name?.toLowerCase() || '';

        return (
          animalName.includes(s) ||
          bullCode.includes(s) ||
          batchNum.includes(s) ||
          rack.includes(s) ||
          tankName.includes(s) ||
          clientName.includes(s) ||
          breed.includes(s)
        );
      }

      return true;
    }).sort((a, b) => {
      let valA: string | number = a.quantity_available;
      let valB: string | number = b.quantity_available;

      if (sortField === 'animal') {
        const matA = a.genetic_material_batches?.genetic_materials;
        const matB = b.genetic_material_batches?.genetic_materials;
        valA = matA?.bulls?.name || matA?.donor_name || '';
        valB = matB?.bulls?.name || matB?.donor_name || '';
      } else if (sortField === 'batch') {
        valA = a.genetic_material_batches?.batch_number || '';
        valB = b.genetic_material_batches?.batch_number || '';
      } else if (sortField === 'tank') {
        valA = a.semen_tanks?.number || '';
        valB = b.semen_tanks?.number || '';
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [
    balances,
    activeMaterialType,
    selectedTank,
    selectedClient,
    ownershipFilter,
    selectedSexing,
    lowStockOnly,
    search,
    sortField,
    sortDirection,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredBalances.length / pageSize));
  const paginatedBalances = filteredBalances.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleClearFilters = () => {
    setSearch('');
    setSelectedTank('');
    setSelectedClient('');
    setSelectedSexing('');
    setLowStockOnly(false);
    setOwnershipFilter('all');
    setCurrentPage(1);
  };

  const hasActiveFilters = search || selectedTank || selectedClient || selectedSexing || lowStockOnly || ownershipFilter !== 'all';

  return (
    <div className="space-y-4">
      {/* Search & Actions Bar */}
      <div className="glass-card bg-slate-900/90 p-4 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por reprodutor, doadora, código, partida, rack, botijão ou raça..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-950 border border-slate-800 text-white text-xs pl-10 pr-4 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => exportInventoryToExcel(filteredBalances, farmName)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold px-3.5 py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 cursor-pointer shrink-0"
              title="Exportar inventário filtrado para Excel (.xlsx)"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" /> Exportar Excel
            </button>
          </div>
        </div>

        {/* Filter controls row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1 border-t border-slate-800/60 text-xs">
          {/* Botijão */}
          <select
            value={selectedTank}
            onChange={(e) => {
              setSelectedTank(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-950 border border-slate-800 text-slate-300 px-2.5 py-1.5 rounded-xl focus:outline-none focus:border-emerald-500"
          >
            <option value="">Todos os Botijões</option>
            {tanks.map((t) => (
              <option key={t.id} value={t.id}>{t.number} - {t.name}</option>
            ))}
          </select>

          {/* Sexagem */}
          <select
            value={selectedSexing}
            onChange={(e) => {
              setSelectedSexing(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-950 border border-slate-800 text-slate-300 px-2.5 py-1.5 rounded-xl focus:outline-none focus:border-emerald-500"
          >
            <option value="">Todas Sexagens</option>
            <option value="convencional">Convencional</option>
            <option value="femea">Fêmea (Sexado)</option>
            <option value="macho">Macho (Sexado)</option>
          </select>

          {/* Tipo de Posse */}
          <select
            value={ownershipFilter}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              setOwnershipFilter(e.target.value as 'all' | 'own' | 'client');
              setCurrentPage(1);
            }}
            className="bg-slate-950 border border-slate-800 text-slate-300 px-2.5 py-1.5 rounded-xl focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Todo Estoque</option>
            <option value="own">Somente Próprio</option>
            <option value="client">Somente de Clientes</option>
          </select>

          {/* Cliente */}
          <select
            value={selectedClient}
            onChange={(e) => {
              setSelectedClient(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-950 border border-slate-800 text-slate-300 px-2.5 py-1.5 rounded-xl focus:outline-none focus:border-emerald-500"
          >
            <option value="">Todos Clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Botão Estoque Baixo */}
          <button
            onClick={() => {
              setLowStockOnly(!lowStockOnly);
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl font-medium border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              lowStockOnly 
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Estoque &lt; 10</span>
          </button>

          {/* Limpar filtros */}
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Limpar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Tabela de Inventário */}
      <div className="glass-card bg-slate-900/95 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="p-3">Tipo</th>
                <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort('animal')}>
                  <div className="flex items-center gap-1">
                    Animal / Genética <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="p-3">Raça</th>
                <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort('batch')}>
                  <div className="flex items-center gap-1">
                    Partida / Lote <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="p-3">Rack</th>
                <th className="p-3">Sexagem / Envase</th>
                <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort('tank')}>
                  <div className="flex items-center gap-1">
                    Localização (Botijão / Caneca) <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="p-3">Proprietário</th>
                <th className="p-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort('quantity_available')}>
                  <div className="flex items-center justify-end gap-1">
                    Saldo Disponível <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="p-3 text-center">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/70 bg-slate-900/60 font-mono">
              {paginatedBalances.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-400 font-sans">
                    <Package className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                    <p className="font-semibold text-slate-300">Nenhum lote encontrado com os filtros selecionados.</p>
                    <p className="text-xs text-slate-400 mt-1">Tente remover alguns filtros ou registrar uma nova entrada.</p>
                  </td>
                </tr>
              ) : (
                paginatedBalances.map((b) => {
                  const mat = b.genetic_material_batches?.genetic_materials;
                  const isSemen = mat?.type === 'SEMEN';
                  const animalName = isSemen 
                    ? (mat?.bulls?.name || 'Touro') 
                    : (mat?.donor_name || mat?.animals?.tag_number || 'Doadora');
                  const animalCode = isSemen ? mat?.bulls?.code : mat?.donor_rgd;
                  const isClient = !!b.owner_client_id;
                  const isLow = b.quantity_available < 10;

                  return (
                    <tr key={b.id} className="hover:bg-slate-800/50 transition-colors">
                      {/* Tipo */}
                      <td className="p-3 font-sans">
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                          isSemen 
                            ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' 
                            : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                        }`}>
                          {isSemen ? 'Sêmen' : 'Embrião'}
                        </span>
                      </td>

                      {/* Animal */}
                      <td className="p-3 font-sans">
                        <div className="font-bold text-white text-xs">{animalName}</div>
                        {animalCode && (
                          <div className="text-[10px] text-slate-400 font-mono">{animalCode}</div>
                        )}
                      </td>

                      {/* Raça */}
                      <td className="p-3 font-sans text-slate-300">
                        {mat?.breeds?.name || '-'}
                      </td>

                      {/* Partida */}
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-slate-950 text-amber-400 border border-slate-800 font-bold">
                          {b.genetic_material_batches?.batch_number}
                        </span>
                      </td>

                      {/* Rack */}
                      <td className="p-3 text-slate-400">
                        {b.genetic_material_batches?.rack_code || '-'}
                      </td>

                      {/* Sexagem / Envase */}
                      <td className="p-3 font-sans">
                        <div className="text-xs text-slate-200 capitalize">{mat?.sexing}</div>
                        <div className="text-[10px] text-slate-400">
                          {isSemen ? mat?.package_type?.replace('_', ' ') : mat?.cryopreservation}
                        </div>
                      </td>

                      {/* Localização */}
                      <td className="p-3 font-sans">
                        <div className="text-white font-medium flex items-center gap-1.5">
                          <span className="font-mono text-emerald-400 font-bold">{b.semen_tanks?.number}</span>
                          <span>({b.semen_tanks?.name})</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Caneca #{b.semen_tank_canisters?.position_number}
                          {b.semen_tank_canisters?.nickname ? ` • ${b.semen_tank_canisters.nickname}` : ''}
                        </div>
                      </td>

                      {/* Proprietário */}
                      <td className="p-3 font-sans">
                        {isClient ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-medium">
                            <User className="w-3 h-3 text-amber-400" />
                            {b.genetic_clients?.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px]">
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            Fazenda (Próprio)
                          </span>
                        )}
                      </td>

                      {/* Saldo Disponível */}
                      <td className="p-3 text-right">
                        <span className={`text-sm font-extrabold ${isLow ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {b.quantity_available} <span className="text-[10px] font-normal text-slate-400">doses</span>
                        </span>
                        {isLow && (
                          <div className="text-[9px] text-amber-400 font-sans font-semibold">Baixo Estoque</div>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="p-3 text-center font-sans">
                        <div className="inline-flex items-center gap-1">
                          {onStartAction && (
                            <>
                              <button
                                onClick={() => onStartAction('outbound', b)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-400 hover:text-rose-300 border border-slate-700 transition-colors cursor-pointer"
                                title="Registrar saída / retirada deste lote"
                              >
                                <LogOut className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => onStartAction('transfer', b)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 border border-slate-700 transition-colors cursor-pointer"
                                title="Transferir para outro botijão/caneca"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>
            Mostrando <span className="text-white font-mono">{paginatedBalances.length}</span> de{' '}
            <span className="text-white font-mono">{filteredBalances.length}</span> registros
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg bg-slate-850 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 font-mono font-bold text-slate-300">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg bg-slate-850 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
