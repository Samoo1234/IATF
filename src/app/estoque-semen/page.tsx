'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useActiveFarm } from '@/context/FarmContext';
import { 
  Package, 
  Dna, 
  Layers, 
  Plus, 
  LogOut, 
  ArrowRightLeft, 
  User, 
  History, 
  FileText, 
  BarChart3, 
  Search, 
  Building2, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import type { 
  GeneticMaterialType, 
  SemenTank, 
  InventoryBalance, 
  InventoryMovement, 
  WithdrawalReceipt, 
  GeneticClient, 
  GeneticCenter, 
  InventoryDashboardMetrics, 
  AnimalGeneticPosition 
} from '@/lib/types/genetic-inventory';
import { 
  getInventoryDashboardMetrics, 
  getTanks, 
  getInventoryBalances, 
  getMovementHistory, 
  getWithdrawalReceipts, 
  getClients, 
  getGeneticCenters 
} from '@/lib/services/geneticInventoryService';
import { getBulls, type Bull } from '@/lib/db';

// Views
import GeneticDashboardView from '@/components/genetic-inventory/GeneticDashboardView';
import TanksView from '@/components/genetic-inventory/TanksView';
import InventoryTableView from '@/components/genetic-inventory/InventoryTableView';
import ClientsView from '@/components/genetic-inventory/ClientsView';
import MovementsLedgerView from '@/components/genetic-inventory/MovementsLedgerView';
import ReceiptsView from '@/components/genetic-inventory/ReceiptsView';
import ReportsView from '@/components/genetic-inventory/ReportsView';
import MovementWizard, { type MovementWizardMode } from '@/components/genetic-inventory/MovementWizard';
import AnimalGeneticLookupModal from '@/components/genetic-inventory/AnimalGeneticLookupModal';

type ModuleTab = 
  | 'overview' 
  | 'tanks' 
  | 'inventory' 
  | 'inbound' 
  | 'outbound' 
  | 'transfer' 
  | 'clients' 
  | 'movements' 
  | 'receipts' 
  | 'reports';

export default function EstoqueSemenPage() {
  const { activeFarm, activeFarmId } = useActiveFarm();

  // Seletor de Modo Sêmen / Embriões com cancelamento de requisições obsoletas
  const [materialType, setMaterialType] = useState<GeneticMaterialType>('SEMEN');
  const [activeTab, setActiveTab] = useState<ModuleTab>('overview');

  // Estados de dados
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<InventoryDashboardMetrics>({
    totalSemenDoses: 0,
    totalEmbryoDoses: 0,
    activeTanksCount: 0,
    lowStockItemsCount: 0,
    tanksBelowNitrogenCount: 0,
    movementsLast30DaysCount: 0,
    monthlyStats: [],
    tanksSummary: [],
  });

  const [tanks, setTanks] = useState<SemenTank[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [receipts, setReceipts] = useState<WithdrawalReceipt[]>([]);
  const [clients, setClients] = useState<GeneticClient[]>([]);
  const [centers, setCenters] = useState<GeneticCenter[]>([]);
  const [bulls, setBulls] = useState<Bull[]>([]);

  // Modais
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<MovementWizardMode>('inbound');
  const [wizardPrefill, setWizardPrefill] = useState<{
    tankId?: string;
    canisterId?: string;
    batchId?: string;
    balanceId?: string;
    materialType?: GeneticMaterialType;
  } | null>(null);

  const [animalLookupOpen, setAnimalLookupOpen] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Referência para cancelamento de requisições obsoletas
  const requestIdRef = useRef(0);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const loadData = useCallback(async (forceRefresh = false) => {
    if (!activeFarmId) return;

    const currentReqId = ++requestIdRef.current;
    setLoading(true);

    try {
      const [
        metricsData,
        tanksData,
        balancesData,
        movementsData,
        receiptsData,
        clientsData,
        centersData,
        bullsData,
      ] = await Promise.all([
        getInventoryDashboardMetrics(activeFarmId, materialType),
        getTanks(activeFarmId, forceRefresh),
        getInventoryBalances(activeFarmId, { materialType }),
        getMovementHistory(activeFarmId, { materialType, limit: 100 }),
        getWithdrawalReceipts(activeFarmId),
        getClients(activeFarmId),
        getGeneticCenters(),
        getBulls(forceRefresh),
      ]);

      // Se outra requisição mais nova foi disparada, descartar
      if (currentReqId !== requestIdRef.current) return;

      setMetrics(metricsData);
      setTanks(tanksData);
      setBalances(balancesData);
      setMovements(movementsData);
      setReceipts(receiptsData);
      setClients(clientsData);
      setCenters(centersData);
      setBulls(bullsData);
    } catch (err) {
      console.error('Erro ao carregar dados do estoque genético:', err);
    } finally {
      if (currentReqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [activeFarmId, materialType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Abertura de assistente
  const handleOpenWizard = (
    mode: MovementWizardMode, 
    prefill?: { 
      tankId?: string; 
      canisterId?: string; 
      batchId?: string; 
      balanceId?: string; 
      materialType?: GeneticMaterialType 
    }
  ) => {
    setWizardMode(mode);
    setWizardPrefill(prefill || null);
    setWizardOpen(true);
  };

  // Callback de sucesso no wizard
  const handleWizardSuccess = (res?: { action?: string; receiptNumber?: string; [key: string]: unknown }) => {
    if (res?.action === 'inbound') {
      showToast('Entrada de doses registrada com sucesso!');
    } else if (res?.action === 'outbound') {
      showToast(`Retirada realizada com sucesso! Comprovante: ${res.receiptNumber || ''}`);
    } else if (res?.action === 'transfer') {
      showToast('Transferência atômica concluída com sucesso!');
    } else if (res?.action === 'adjustment') {
      showToast('Ajuste de estoque gravado na auditoria!');
    }
    loadData(true);
  };

  // Callback ao selecionar animal na consulta rápida
  const handleSelectAnimalPosition = (action: 'outbound' | 'transfer', pos: AnimalGeneticPosition) => {
    setAnimalLookupOpen(false);
    const targetBalance = balances.find((b) => b.batch_id === pos.batchId && b.canister_id === pos.canisterId);
    handleOpenWizard(action, {
      balanceId: targetBalance?.id,
      batchId: pos.batchId,
      tankId: pos.tankId,
      canisterId: pos.canisterId,
      materialType: pos.materialType,
    });
  };

  const farmName = activeFarm?.name || 'Fazenda Principal';

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5">
          <div className={`p-4 rounded-2xl border shadow-2xl flex items-center gap-3 text-xs font-semibold ${
            toast.type === 'success' 
              ? 'bg-slate-900 border-emerald-500/50 text-emerald-300' 
              : 'bg-slate-900 border-rose-500/50 text-rose-300'
          }`}>
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header Principal do Módulo */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/90 p-6 rounded-3xl border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-black text-white flex items-center gap-2.5 tracking-tight">
              <Package className="w-7 h-7 text-emerald-400 shrink-0" />
              Estoque de Sêmen & Doses
            </h1>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold">
              <Building2 className="w-3.5 h-3.5" />
              {farmName}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Controle criogênico auditável, rastreabilidade por botijão/caneca, livro razão imutável e comprovantes de retirada.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Seletor Sêmen | Embriões */}
          <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
            <button
              onClick={() => setMaterialType('SEMEN')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                materialType === 'SEMEN'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Dna className="w-3.5 h-3.5" />
              Sêmen
            </button>
            <button
              onClick={() => setMaterialType('EMBRYO')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                materialType === 'EMBRYO'
                  ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              Embriões
            </button>
          </div>

          {/* Consulta Rápida Animal */}
          <button
            onClick={() => setAnimalLookupOpen(true)}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold rounded-2xl text-xs transition-colors flex items-center gap-2 cursor-pointer"
            title="Localizar doses por reprodutor ou doadora"
          >
            <Search className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Localizar Animal</span>
          </button>

          {/* Botão Principal: Nova Movimentação */}
          <button
            onClick={() => handleOpenWizard('inbound')}
            className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-4 py-2.5 rounded-2xl text-xs sm:text-sm transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Nova Movimentação
          </button>
        </div>
      </div>

      {/* Sub-navegação por Abas do Módulo */}
      <div className="flex border-b border-slate-800 bg-slate-900/60 p-1.5 rounded-2xl gap-1 overflow-x-auto custom-scrollbar text-xs font-semibold select-none">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" /> Visão Geral
        </button>

        <button
          onClick={() => setActiveTab('tanks')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'tanks'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> Botijões & Canecas
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'inventory'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Package className="w-3.5 h-3.5" /> Inventário de Lotes
        </button>

        <button
          onClick={() => { handleOpenWizard('inbound'); }}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-emerald-400" /> Entradas
        </button>

        <button
          onClick={() => { handleOpenWizard('outbound'); }}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all whitespace-nowrap cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 text-rose-400" /> Saídas
        </button>

        <button
          onClick={() => { handleOpenWizard('transfer'); }}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all whitespace-nowrap cursor-pointer"
        >
          <ArrowRightLeft className="w-3.5 h-3.5 text-cyan-400" /> Transferências
        </button>

        <button
          onClick={() => setActiveTab('clients')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'clients'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <User className="w-3.5 h-3.5" /> Clientes (Custódia)
        </button>

        <button
          onClick={() => setActiveTab('movements')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'movements'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <History className="w-3.5 h-3.5" /> Movimentações (Ledger)
        </button>

        <button
          onClick={() => setActiveTab('receipts')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'receipts'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <FileText className="w-3.5 h-3.5" /> Comprovantes
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'reports'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" /> Relatórios
        </button>
      </div>

      {/* Conteúdo Dinâmico da Aba */}
      {loading ? (
        <div className="py-24 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
          <p className="text-sm font-semibold text-slate-300">Carregando dados do estoque criogênico...</p>
        </div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <GeneticDashboardView
              metrics={metrics}
              recentMovements={movements}
              activeMaterialType={materialType}
              onOpenWizard={handleOpenWizard}
              onOpenAnimalLookup={() => setAnimalLookupOpen(true)}
              onSelectTankMap={() => setActiveTab('tanks')}
            />
          )}

          {activeTab === 'tanks' && (
            <TanksView
              farmId={activeFarmId!}
              tanks={tanks}
              balances={balances}
              onRefresh={() => loadData(true)}
              onStartMovementAction={(action, prefill) => handleOpenWizard(action, prefill)}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryTableView
              balances={balances}
              tanks={tanks}
              clients={clients}
              farmName={farmName}
              activeMaterialType={materialType}
              onStartAction={(action, balance) => {
                handleOpenWizard(action, {
                  balanceId: balance.id,
                  batchId: balance.batch_id,
                  tankId: balance.tank_id,
                  canisterId: balance.canister_id,
                  materialType: balance.genetic_material_batches?.genetic_materials?.type,
                });
              }}
            />
          )}

          {activeTab === 'clients' && (
            <ClientsView
              farmId={activeFarmId!}
              clients={clients}
              balances={balances}
              onRefresh={() => loadData(true)}
            />
          )}

          {activeTab === 'movements' && (
            <MovementsLedgerView
              farmId={activeFarmId!}
              movements={movements}
              farmName={farmName}
              activeMaterialType={materialType}
              onRefresh={() => loadData(true)}
            />
          )}

          {activeTab === 'receipts' && (
            <ReceiptsView
              receipts={receipts}
              farmName={farmName}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              farmName={farmName}
              balances={balances}
              tanks={tanks}
              clients={clients}
            />
          )}
        </>
      )}

      {/* Modal Assistente de Movimentação */}
      {wizardOpen && activeFarmId && (
        <MovementWizard
          farmId={activeFarmId}
          initialMode={wizardMode}
          tanks={tanks}
          clients={clients}
          centers={centers}
          bulls={bulls}
          balances={balances}
          prefill={wizardPrefill || undefined}
          onSuccess={handleWizardSuccess}
          onClose={() => setWizardOpen(false)}
        />
      )}

      {/* Modal Consulta Rápida de Animal */}
      {animalLookupOpen && activeFarmId && (
        <AnimalGeneticLookupModal
          farmId={activeFarmId}
          farmName={farmName}
          onSelectAction={handleSelectAnimalPosition}
          onClose={() => setAnimalLookupOpen(false)}
        />
      )}

    </div>
  );
}
