'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  type LotStat,
  type LotAnimal,
  type Bull,
  type SemenBatch,
  getBulls,
  getSemenBatches,
  executeBatchLotManagementD0,
  executeBatchLotManagementD9,
  executeBatchLotManagementIA,
  executeBatchLotManagementDG,
} from '@/lib/db';
import { getTodayDateString, addDaysToDateString } from '@/lib/dateUtils';
import {
  Syringe,
  Check,
  X,
  AlertCircle,
  Sparkles,
  Layers,
  RefreshCw,
  AlertTriangle,
  HeartPulse,
  CheckCircle2,
  Activity,
  Award,
  Search,
} from 'lucide-react';

interface BatchLotManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  lot: LotStat;
  lotAnimals: LotAnimal[];
  initialStepCode?: 'D0' | 'D7' | 'D8' | 'D9' | 'IA' | 'DG';
}

type ManagementTab = 'D0' | 'D9' | 'IA' | 'DG';

export default function BatchLotManagementModal({
  isOpen,
  onClose,
  onSuccess,
  lot,
  lotAnimals,
  initialStepCode = 'D9',
}: BatchLotManagementModalProps) {
  // Normalize initial tab
  const getNormalizedTab = (code?: string): ManagementTab => {
    if (!code) return 'D9';
    const upper = code.toUpperCase();
    if (upper === 'D0') return 'D0';
    if (upper === 'IA') return 'IA';
    if (upper === 'DG' || upper === 'DG1' || upper === 'DG2') return 'DG';
    return 'D9'; // D7, D8, D9
  };

  const [activeTab, setActiveTab] = useState<ManagementTab>(getNormalizedTab(initialStepCode));
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Aux data for IA
  const [bulls, setBulls] = useState<Bull[]>([]);
  const [semenBatches, setSemenBatches] = useState<SemenBatch[]>([]);
  const [loadingAux, setLoadingAux] = useState(false);

  // ----------------------------------------------------
  // D0 State
  // ----------------------------------------------------
  const [d0Date, setD0Date] = useState(lot.start_date || getTodayDateString());
  const [d0Responsible, setD0Responsible] = useState(lot.responsible_name || 'MV. DR. SAMOEL DUARTE');
  const [d0Notes, setD0Notes] = useState('');
  const [d0SelectedIds, setD0SelectedIds] = useState<string[]>([]);

  // ----------------------------------------------------
  // D9 State
  // ----------------------------------------------------
  const [d9Date, setD9Date] = useState(getTodayDateString());
  const [d9Responsible, setD9Responsible] = useState(lot.responsible_name || 'MV. DR. SAMOEL DUARTE');
  const [d9Notes, setD9Notes] = useState('');
  const [d9SelectedIds, setD9SelectedIds] = useState<string[]>([]);
  const [d9DeviceLossIds, setD9DeviceLossIds] = useState<string[]>([]);

  // ----------------------------------------------------
  // IA State
  // ----------------------------------------------------
  const [iaDate, setIaDate] = useState(lot.ia_planned_date || getTodayDateString());
  const [iaInseminator, setIaInseminator] = useState(lot.responsible_name || 'MV. DR. SAMOEL DUARTE');
  const [iaDefaultBullId, setIaDefaultBullId] = useState('');
  const [iaDefaultBatchId, setIaDefaultBatchId] = useState('');
  const [iaDefaultEcc, setIaDefaultEcc] = useState('3.00');
  const [iaNotes, setIaNotes] = useState('');
  const [iaSearchQuery, setIaSearchQuery] = useState('');

  // Row by row overrides for IA
  const [iaRows, setIaRows] = useState<
    {
      animal_id: string;
      lot_animal_id: string;
      tag_number: string;
      category_name: string;
      bull_id: string;
      semen_batch_id: string;
      inseminator_name: string;
      ecc_ia: string;
      skipped: boolean;
      notes: string;
    }[]
  >([]);

  // ----------------------------------------------------
  // DG State
  // ----------------------------------------------------
  const [dgDate, setDgDate] = useState(lot.dg_planned_date || getTodayDateString());
  const [dgResponsible, setDgResponsible] = useState(lot.responsible_name || 'MV. DR. SAMOEL DUARTE');
  const [dgNotes, setDgNotes] = useState('');
  const [dgSearchQuery, setDgSearchQuery] = useState('');

  // Row by row DG
  const [dgRows, setDgRows] = useState<
    {
      animal_id: string;
      lot_animal_id: string;
      tag_number: string;
      category_name: string;
      pregnancy_status: 'prenha' | 'vazia' | 'inconclusivo';
      ecc_dg: string;
      notes: string;
      checked: boolean;
    }[]
  >([]);

  // Load aux data and initialize forms
  useEffect(() => {
    if (!isOpen) return;

    setActiveTab(getNormalizedTab(initialStepCode));
    setErrorMsg(null);

    // Initial dates
    setD0Date(lot.start_date || getTodayDateString());
    setD0Responsible(lot.responsible_name || 'MV. DR. SAMOEL DUARTE');
    setD0SelectedIds(lotAnimals.map((la) => la.animal_id));

    setD9Date(getTodayDateString());
    setD9Responsible(lot.responsible_name || 'MV. DR. SAMOEL DUARTE');
    setD9SelectedIds(lotAnimals.map((la) => la.animal_id));
    setD9DeviceLossIds([]);

    setIaDate(lot.ia_planned_date || getTodayDateString());
    setIaInseminator(lot.responsible_name || 'MV. DR. SAMOEL DUARTE');

    setDgDate(lot.dg_planned_date || getTodayDateString());
    setDgResponsible(lot.responsible_name || 'MV. DR. SAMOEL DUARTE');

    // Initialize IA rows
    setIaRows(
      lotAnimals.map((la) => ({
        animal_id: la.animal_id,
        lot_animal_id: la.id,
        tag_number: la.animals?.tag_number || 'S/N',
        category_name: la.animals?.animal_categories?.name || 'Matriz',
        bull_id: (la as unknown as { bull_id?: string }).bull_id || '',
        semen_batch_id: (la as unknown as { semen_batch_id?: string }).semen_batch_id || '',
        inseminator_name: la.inseminator_name || lot.responsible_name || '',
        ecc_ia: la.ecc_ia ? la.ecc_ia.toFixed(2) : '3.00',
        skipped: false,
        notes: (la as unknown as { notes?: string }).notes || '',
      }))
    );
    setIaSearchQuery('');

    // Initialize DG rows
    setDgRows(
      lotAnimals.map((la) => ({
        animal_id: la.animal_id,
        lot_animal_id: la.id,
        tag_number: la.animals?.tag_number || 'S/N',
        category_name: la.animals?.animal_categories?.name || 'Matriz',
        pregnancy_status:
          la.pregnancy_status === 'prenha' || la.pregnancy_status === 'vazia'
            ? la.pregnancy_status
            : 'prenha', // Default suggestion
        ecc_dg: la.ecc_dg ? la.ecc_dg.toFixed(2) : '3.00',
        notes: (la as unknown as { notes?: string }).notes || '',
        checked: true,
      }))
    );
    setDgSearchQuery('');

    // Load Bulls & Semen Batches
    async function loadAux() {
      setLoadingAux(true);
      try {
        const [bullsRes, batchesRes] = await Promise.all([
          getBulls(),
          getSemenBatches(),
        ]);
        setBulls(bullsRes || []);
        setSemenBatches(batchesRes || []);

        // Pick first bull as default if none selected
        if (bullsRes && bullsRes.length > 0) {
          const firstBullId = bullsRes[0].id;
          setIaDefaultBullId(firstBullId);
          const firstBatch = (batchesRes || []).find(
            (b) =>
              (b as unknown as { bull_id?: string }).bull_id === firstBullId ||
              (b.bulls as Record<string, unknown> | null)?.id === firstBullId
          );
          if (firstBatch) {
            setIaDefaultBatchId(firstBatch.id);
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar auxiliares de IA:', err);
      } finally {
        setLoadingAux(false);
      }
    }

    loadAux();
  }, [isOpen, lot, lotAnimals, initialStepCode]);

  // Available batches for selected default bull
  const availableDefaultBatches = useMemo(() => {
    if (!iaDefaultBullId) return semenBatches;
    return semenBatches.filter(
      (b) =>
        (b as unknown as { bull_id?: string }).bull_id === iaDefaultBullId ||
        (b.bulls as Record<string, unknown> | null)?.id === iaDefaultBullId ||
        b.id === iaDefaultBatchId
    );
  }, [semenBatches, iaDefaultBullId, iaDefaultBatchId]);

  // Atualizar linha de IA pelo ID único do animal (blindado contra filtros e buscas)
  const updateIaRow = (animalId: string, updates: Partial<(typeof iaRows)[number]>) => {
    setIaRows((prev) =>
      prev.map((row) => (row.animal_id === animalId ? { ...row, ...updates } : row))
    );
  };

  // Linhas filtradas pela busca rápida de matrizes na IA
  const filteredIaRows = useMemo(() => {
    if (!iaSearchQuery.trim()) return iaRows;
    const q = iaSearchQuery.trim().toLowerCase();
    return iaRows.filter((r) => {
      const bull = bulls.find((b) => b.id === r.bull_id);
      const batch = semenBatches.find((b) => b.id === r.semen_batch_id);
      return (
        r.tag_number.toLowerCase().includes(q) ||
        r.category_name.toLowerCase().includes(q) ||
        (bull && bull.name.toLowerCase().includes(q)) ||
        (batch && batch.batch_number.toLowerCase().includes(q)) ||
        (r.notes && r.notes.toLowerCase().includes(q))
      );
    });
  }, [iaRows, iaSearchQuery, bulls, semenBatches]);

  // Apply default bull and batch to IA rows (respeita busca ativa se houver)
  const handleApplyDefaultsToAllIaRows = () => {
    if (iaSearchQuery.trim()) {
      const targetIds = new Set(filteredIaRows.map((r) => r.animal_id));
      setIaRows((prev) =>
        prev.map((row) =>
          targetIds.has(row.animal_id)
            ? {
                ...row,
                bull_id: iaDefaultBullId || row.bull_id,
                semen_batch_id: iaDefaultBatchId || row.semen_batch_id,
                inseminator_name: iaInseminator || row.inseminator_name,
                ecc_ia: iaDefaultEcc || row.ecc_ia,
              }
            : row
        )
      );
    } else {
      setIaRows((prev) =>
        prev.map((row) => ({
          ...row,
          bull_id: iaDefaultBullId || row.bull_id,
          semen_batch_id: iaDefaultBatchId || row.semen_batch_id,
          inseminator_name: iaInseminator || row.inseminator_name,
          ecc_ia: iaDefaultEcc || row.ecc_ia,
        }))
      );
    }
  };

  // Ações em massa para IA (Inseminar Todas / Pular Todas)
  const handleSetAllIaSkipped = (skipped: boolean) => {
    if (iaSearchQuery.trim()) {
      const targetIds = new Set(filteredIaRows.map((r) => r.animal_id));
      setIaRows((prev) =>
        prev.map((r) => (targetIds.has(r.animal_id) ? { ...r, skipped } : r))
      );
    } else {
      setIaRows((prev) =>
        prev.map((r) => ({
          ...r,
          skipped,
        }))
      );
    }
  };

  // Toggle Loss of device for an animal in D9
  const handleToggleDeviceLoss = (animalId: string) => {
    setD9DeviceLossIds((prev) =>
      prev.includes(animalId) ? prev.filter((id) => id !== animalId) : [...prev, animalId]
    );
  };

  // Atualizar linha de DG pelo ID único do animal (blindado contra filtros e buscas)
  const updateDgRow = (animalId: string, updates: Partial<(typeof dgRows)[number]>) => {
    setDgRows((prev) =>
      prev.map((row) => (row.animal_id === animalId ? { ...row, ...updates } : row))
    );
  };

  // Linhas filtradas pela busca rápida de matrizes
  const filteredDgRows = useMemo(() => {
    if (!dgSearchQuery.trim()) return dgRows;
    const q = dgSearchQuery.trim().toLowerCase();
    return dgRows.filter(
      (r) =>
        r.tag_number.toLowerCase().includes(q) ||
        r.category_name.toLowerCase().includes(q) ||
        (r.notes && r.notes.toLowerCase().includes(q))
    );
  }, [dgRows, dgSearchQuery]);

  // DG Bulk Actions
  const handleSetAllDgStatus = (status: 'prenha' | 'vazia') => {
    if (dgSearchQuery.trim()) {
      // Se houver busca ativa, altera apenas as matrizes visíveis filtradas
      const targetIds = new Set(filteredDgRows.map((r) => r.animal_id));
      setDgRows((prev) =>
        prev.map((r) => (targetIds.has(r.animal_id) ? { ...r, pregnancy_status: status } : r))
      );
    } else {
      setDgRows((prev) =>
        prev.map((r) => ({
          ...r,
          pregnancy_status: status,
        }))
      );
    }
  };

  // Expected parturition preview for DG
  const getExpectedParturitionDate = (pregnancyStatus: string) => {
    if (pregnancyStatus !== 'prenha') return '-';
    const baseDate = lot.ia_planned_date || dgDate;
    if (!baseDate) return '-';
    const parturitionStr = addDaysToDateString(baseDate, 295);
    const parts = parturitionStr.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : parturitionStr;
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    try {
      if (activeTab === 'D0') {
        if (!d0Date) {
          setErrorMsg('Informe a data de execução do D0.');
          setSubmitting(false);
          return;
        }

        const res = await executeBatchLotManagementD0({
          lotId: lot.id,
          executionDate: d0Date,
          responsibleName: d0Responsible,
          notes: d0Notes,
          animalIds: d0SelectedIds,
        });

        if (!res.success) {
          setErrorMsg(res.error || 'Erro ao registrar D0 em lote.');
          setSubmitting(false);
          return;
        }
      } else if (activeTab === 'D9') {
        if (!d9Date) {
          setErrorMsg('Informe a data de execução da retirada/aplicação D9.');
          setSubmitting(false);
          return;
        }

        const res = await executeBatchLotManagementD9({
          lotId: lot.id,
          stepCode: 'D9',
          executionDate: d9Date,
          responsibleName: d9Responsible,
          notes: d9Notes,
          deviceLossAnimalIds: d9DeviceLossIds,
          animalIds: d9SelectedIds,
        });

        if (!res.success) {
          setErrorMsg(res.error || 'Erro ao registrar D9 em lote.');
          setSubmitting(false);
          return;
        }
      } else if (activeTab === 'IA') {
        if (!iaDate) {
          setErrorMsg('Informe a data da Inseminação Artificial.');
          setSubmitting(false);
          return;
        }

        const items = iaRows.map((r) => ({
          animal_id: r.animal_id,
          lot_animal_id: r.lot_animal_id,
          bull_id: r.bull_id || iaDefaultBullId || null,
          semen_batch_id: r.semen_batch_id || iaDefaultBatchId || null,
          inseminator_name: r.inseminator_name || iaInseminator || null,
          ecc_ia: r.ecc_ia ? parseFloat(r.ecc_ia) : null,
          skipped: r.skipped,
          notes: r.notes?.trim() || null,
        }));

        const res = await executeBatchLotManagementIA({
          lotId: lot.id,
          executionDate: iaDate,
          defaultBullId: iaDefaultBullId || null,
          defaultSemenBatchId: iaDefaultBatchId || null,
          defaultInseminatorName: iaInseminator || null,
          defaultEccIa: iaDefaultEcc ? parseFloat(iaDefaultEcc) : null,
          notes: iaNotes,
          items,
        });

        if (!res.success) {
          setErrorMsg(res.error || 'Erro ao registrar Inseminação em lote.');
          setSubmitting(false);
          return;
        }
      } else if (activeTab === 'DG') {
        if (!dgDate) {
          setErrorMsg('Informe a data do Diagnóstico de Gestação.');
          setSubmitting(false);
          return;
        }

        const items = dgRows
          .filter((r) => r.checked)
          .map((r) => ({
            animal_id: r.animal_id,
            lot_animal_id: r.lot_animal_id,
            pregnancy_status: r.pregnancy_status,
            ecc_dg: r.ecc_dg ? parseFloat(r.ecc_dg) : null,
            notes: r.notes?.trim() || null,
          }));

        const res = await executeBatchLotManagementDG({
          lotId: lot.id,
          executionDate: dgDate,
          responsibleName: dgResponsible,
          notes: dgNotes,
          items,
        });

        if (!res.success) {
          setErrorMsg(res.error || 'Erro ao registrar DG em lote.');
          setSubmitting(false);
          return;
        }
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('Batch management error:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Erro inesperado ao salvar.');
    } finally {
      setSubmitting(false);
    }
  };

  // IA Live Counters
  const iaStats = useMemo(() => {
    const total = iaRows.length;
    const toInseminate = iaRows.filter((r) => !r.skipped).length;
    const skipped = total - toInseminate;
    const rate = total > 0 ? ((toInseminate / total) * 100).toFixed(1) : '0.0';
    return { total, toInseminate, skipped, rate };
  }, [iaRows]);

  // DG Live Counters
  const dgStats = useMemo(() => {
    const total = dgRows.length;
    const pregnant = dgRows.filter((r) => r.pregnancy_status === 'prenha').length;
    const empty = dgRows.filter((r) => r.pregnancy_status === 'vazia').length;
    const pending = total - pregnant - empty;
    const rate = total > 0 ? ((pregnant / total) * 100).toFixed(1) : '0.0';
    return { total, pregnant, empty, pending, rate };
  }, [dgRows]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="glass-card w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-5 sm:p-7 space-y-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <Sparkles className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-white">Manejo Coletivo do Lote</h2>
                  <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-mono font-bold text-xs border border-emerald-500/30">
                    {lot.code}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Execute a ação reprodutiva para todas as <strong>{lotAnimals.length} matrizes</strong> deste lote simultaneamente.
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation (D0, D9, IA, DG) */}
        <div className="grid grid-cols-4 gap-2 bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800">
          {[
            {
              id: 'D0',
              label: 'D0 - Implante',
              sub: 'Início do Protocolo',
              badge: 'Implante P4',
              color: 'text-sky-400',
              activeBg: 'bg-sky-500 text-slate-950 shadow-sky-500/30',
            },
            {
              id: 'D9',
              label: 'D9 - Retirada',
              sub: 'PGF2a + eCG + Cip',
              badge: 'Aplicações',
              color: 'text-amber-400',
              activeBg: 'bg-amber-400 text-slate-950 shadow-amber-400/30',
            },
            {
              id: 'IA',
              label: 'IA - Inseminação',
              sub: 'Touro & Sêmen',
              badge: 'Inseminação',
              color: 'text-emerald-400',
              activeBg: 'bg-emerald-500 text-slate-950 shadow-emerald-500/30',
            },
            {
              id: 'DG',
              label: 'DG - Gestação',
              sub: 'Toque / Diagnóstico',
              badge: 'Prenhez',
              color: 'text-purple-400',
              activeBg: 'bg-purple-500 text-white shadow-purple-500/30',
            },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as ManagementTab)}
                className={`py-2.5 px-2 rounded-xl text-center transition-all cursor-pointer font-sans ${
                  isActive
                    ? `${tab.activeBg} font-black shadow-lg scale-[1.02]`
                    : 'hover:bg-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="block text-xs sm:text-sm font-black truncate">{tab.label}</span>
                <span className={`block text-[10px] truncate ${isActive ? 'opacity-90 font-medium' : 'text-slate-500'}`}>
                  {tab.sub}
                </span>
              </button>
            );
          })}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ============================================================== */}
          {/* TAB: D0 (Implante / Início) */}
          {/* ============================================================== */}
          {activeTab === 'D0' && (
            <div className="space-y-5 animate-in fade-in">
              <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-200 text-xs flex items-start gap-3">
                <Syringe className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-sm text-sky-300 block">Etapa D0 - Início do Protocolo do Lote</span>
                  <p className="text-slate-300">
                    Ao confirmar, o sistema registrará a inserção do dispositivo intravaginal de progesterona e a administração de Benzoato de Estradiol para todas as{' '}
                    <strong className="text-white">{lotAnimals.length} matrizes</strong> vinculadas a este lote.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Data da Execução D0
                  </label>
                  <input
                    type="date"
                    value={d0Date}
                    onChange={(e) => setD0Date(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Responsável / Veterinário
                  </label>
                  <input
                    type="text"
                    value={d0Responsible}
                    onChange={(e) => setD0Responsible(e.target.value)}
                    placeholder="Ex: MV. Dr. Samoel Duarte"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-sans"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Observações Gerais do Manejo D0
                </label>
                <textarea
                  rows={2}
                  value={d0Notes}
                  onChange={(e) => setD0Notes(e.target.value)}
                  placeholder="Ex: Todas as matrizes foram avaliadas, implantes novos inseridos sem intercorrências..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Matrizes com Checkbox em D0 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-sky-400" /> Matrizes do Lote que Receberão D0 ({d0SelectedIds.length}/{lotAnimals.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setD0SelectedIds(
                          d0SelectedIds.length === lotAnimals.length
                            ? []
                            : lotAnimals.map((la) => la.animal_id)
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-bold text-[11px] transition-all cursor-pointer"
                    >
                      {d0SelectedIds.length === lotAnimals.length ? 'Desmarcar Todas' : 'Marcar Todas'}
                    </button>
                    <span className="text-slate-400 font-mono text-[11px]">Protocolo: {lot.protocol_name || 'IATF'}</span>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] sticky top-0 z-10">
                      <tr>
                        <th className="p-3 w-12 text-center">
                          <input
                            type="checkbox"
                            checked={lotAnimals.length > 0 && d0SelectedIds.length === lotAnimals.length}
                            onChange={(e) =>
                              setD0SelectedIds(
                                e.target.checked ? lotAnimals.map((la) => la.animal_id) : []
                              )
                            }
                            className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500 cursor-pointer accent-sky-500"
                            title="Marcar ou desmarcar todas as matrizes no D0"
                          />
                        </th>
                        <th className="p-3">Brinco</th>
                        <th className="p-3">Categoria</th>
                        <th className="p-3 text-center">Status D0</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 font-mono">
                      {lotAnimals.map((la) => {
                        const isChecked = d0SelectedIds.includes(la.animal_id);
                        return (
                          <tr
                            key={la.id}
                            onClick={() =>
                              setD0SelectedIds((prev) =>
                                prev.includes(la.animal_id)
                                  ? prev.filter((id) => id !== la.animal_id)
                                  : [...prev, la.animal_id]
                              )
                            }
                            className={`hover:bg-slate-900 transition-colors cursor-pointer ${!isChecked ? 'opacity-45 bg-slate-950/80' : ''}`}
                          >
                            <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setD0SelectedIds((prev) =>
                                    checked
                                      ? prev.includes(la.animal_id)
                                        ? prev
                                        : [...prev, la.animal_id]
                                      : prev.filter((id) => id !== la.animal_id)
                                  );
                                }}
                                className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500 cursor-pointer accent-sky-500"
                              />
                            </td>
                            <td className="p-3 font-bold text-white font-mono">{la.animals?.tag_number || 'S/N'}</td>
                            <td className="p-3 font-sans text-slate-400">{la.animals?.animal_categories?.name || 'Matriz'}</td>
                            <td className="p-3 text-center font-sans">
                              {isChecked ? (
                                <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[10px] font-bold">
                                  Selecionada p/ D0
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-bold">
                                  Não selecionada
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB: D9 (Retirada / Indutores) */}
          {/* ============================================================== */}
          {activeTab === 'D9' && (
            <div className="space-y-5 animate-in fade-in">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3">
                <Activity className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-sm text-amber-300 block">Etapa D9 - Retirada de Implante & Indução</span>
                  <p className="text-slate-300">
                    Registro coletivo de retirada do dispositivo e aplicação hormonal (PGF2a + eCG + Cipionato). Se alguma matriz perdeu o implante, marque a caixa correspondente abaixo.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Data da Retirada D9
                  </label>
                  <input
                    type="date"
                    value={d9Date}
                    onChange={(e) => setD9Date(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Responsável / Aplicador
                  </label>
                  <input
                    type="text"
                    value={d9Responsible}
                    onChange={(e) => setD9Responsible(e.target.value)}
                    placeholder="Ex: MV. Dr. Samoel Duarte"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-sans"
                  />
                </div>
              </div>

              {/* Tabela de Matrizes com Checkbox e Marcação de Perda de Dispositivo */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                  <span className="font-bold text-slate-300">
                    Conferência de Dispositivo das Matrizes ({d9SelectedIds.length}/{lotAnimals.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setD9SelectedIds(
                          d9SelectedIds.length === lotAnimals.length
                            ? []
                            : lotAnimals.map((la) => la.animal_id)
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold text-[11px] transition-all cursor-pointer"
                    >
                      {d9SelectedIds.length === lotAnimals.length ? 'Desmarcar Todas' : 'Marcar Todas'}
                    </button>
                    <span className="text-[11px] text-amber-400">
                      {d9DeviceLossIds.length > 0 ? `${d9DeviceLossIds.length} perda(s) registrada(s)` : 'Nenhuma perda (100% retido)'}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] sticky top-0 z-10">
                      <tr>
                        <th className="p-3 w-12 text-center">
                          <input
                            type="checkbox"
                            checked={lotAnimals.length > 0 && d9SelectedIds.length === lotAnimals.length}
                            onChange={(e) =>
                              setD9SelectedIds(
                                e.target.checked ? lotAnimals.map((la) => la.animal_id) : []
                              )
                            }
                            className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500 cursor-pointer accent-amber-500"
                            title="Marcar ou desmarcar todas as matrizes no D9"
                          />
                        </th>
                        <th className="p-3">Brinco</th>
                        <th className="p-3">Categoria</th>
                        <th className="p-3 text-center">Status Retirada</th>
                        <th className="p-3 text-center">Perda de Implante?</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 font-mono">
                      {lotAnimals.map((la) => {
                        const isChecked = d9SelectedIds.includes(la.animal_id);
                        const hasLoss = d9DeviceLossIds.includes(la.animal_id);
                        return (
                          <tr
                            key={la.id}
                            className={`hover:bg-slate-900 transition-colors ${!isChecked ? 'opacity-45 bg-slate-950/80' : ''}`}
                          >
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setD9SelectedIds((prev) =>
                                    checked
                                      ? prev.includes(la.animal_id)
                                        ? prev
                                        : [...prev, la.animal_id]
                                      : prev.filter((id) => id !== la.animal_id)
                                  );
                                }}
                                className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500 cursor-pointer accent-amber-500"
                              />
                            </td>
                            <td className="p-3 font-bold text-white font-mono">{la.animals?.tag_number || 'S/N'}</td>
                            <td className="p-3 font-sans text-slate-400">{la.animals?.animal_categories?.name || 'Matriz'}</td>
                            <td className="p-3 text-center font-sans">
                              {!isChecked ? (
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-bold">
                                  Não selecionada
                                </span>
                              ) : hasLoss ? (
                                <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                                  Interrompido (Perda)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                                  Retirado & Hormonizado
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                disabled={!isChecked}
                                onClick={() => handleToggleDeviceLoss(la.animal_id)}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-40 ${
                                  hasLoss
                                    ? 'bg-rose-500 text-white font-extrabold shadow-sm shadow-rose-500/40'
                                    : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                                }`}
                              >
                                {hasLoss ? (
                                  <>
                                    <AlertTriangle className="w-3.5 h-3.5" /> Sim (Perdeu)
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-3.5 h-3.5" /> Não (Normal)
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Observações D9
                </label>
                <textarea
                  rows={2}
                  value={d9Notes}
                  onChange={(e) => setD9Notes(e.target.value)}
                  placeholder="Ex: Aplicação de 2ml de PGF2a, 300UI de eCG e 1ml de Cipionato de Estradiol..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB: IA (Inseminação Coletiva / em Massa) */}
          {/* ============================================================== */}
          {activeTab === 'IA' && (
            <div className="space-y-5 animate-in fade-in">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs flex items-start gap-3">
                <Award className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-sm text-emerald-300 block">Etapa IA - Inseminação Artificial em Massa</span>
                  <p className="text-slate-300">
                    Defina o Touro, a Partida de Sêmen e o Inseminador no cabeçalho para aplicar a todas as matrizes, ou personalize animal por animal na tabela abaixo.
                  </p>
                </div>
              </div>

              {/* Controles Padrão (Batch Defaults) */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Padrão para Todas as Matrizes do Lote
                    {loadingAux && <RefreshCw className="w-3 h-3 animate-spin text-emerald-400 ml-1" />}
                  </span>
                  <button
                    type="button"
                    onClick={handleApplyDefaultsToAllIaRows}
                    className="text-xs font-bold px-3 py-1 bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 rounded-lg hover:bg-emerald-600/30 transition-all cursor-pointer flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Replicar em Todas as Linhas
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">Data da IA</label>
                    <input
                      type="date"
                      value={iaDate}
                      onChange={(e) => setIaDate(e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">Inseminador</label>
                    <input
                      type="text"
                      value={iaInseminator}
                      onChange={(e) => setIaInseminator(e.target.value)}
                      placeholder="Ex: MV. Samoel Duarte"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">Touro Padrão</label>
                    <select
                      value={iaDefaultBullId}
                      onChange={(e) => {
                        const newBullId = e.target.value;
                        setIaDefaultBullId(newBullId);
                        const matchBatch = semenBatches.find(
                          (b) =>
                            (b.bulls as Record<string, unknown> | null)?.id === newBullId ||
                            (b as unknown as { bull_id?: string }).bull_id === newBullId
                        );
                        if (matchBatch) setIaDefaultBatchId(matchBatch.id);
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
                    >
                      <option value="">Selecione o Touro...</option>
                      {bulls.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.breeds?.name || (b as unknown as { breed?: string }).breed || 'Bovino'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">Partida de Sêmen</label>
                    <select
                      value={iaDefaultBatchId}
                      onChange={(e) => setIaDefaultBatchId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    >
                      <option value="">Selecione a Partida...</option>
                      {availableDefaultBatches.map((b) => (
                        <option key={b.id} value={b.id}>
                          Lote {b.batch_number} (Saldo: {b.initial_quantity - b.used_quantity - (b.lost_quantity || 0)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">ECC Padrão</label>
                    <input
                      type="number"
                      step="0.25"
                      min="1"
                      max="5"
                      value={iaDefaultEcc}
                      onChange={(e) => setIaDefaultEcc(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-center"
                    />
                  </div>
                </div>
              </div>

              {/* Placar de IA & Ações Rápidas em Massa */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-3 text-xs font-bold flex-wrap">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    A INSEMINAR: {iaStats.toInseminate}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                    PULADAS: {iaStats.skipped}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    APROVEITAMENTO: {iaStats.rate}%
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSetAllIaSkipped(false)}
                    className="px-2.5 py-1 text-xs font-bold bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-lg transition-all cursor-pointer"
                  >
                    Inseminar Todas
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllIaSkipped(true)}
                    className="px-2.5 py-1 text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 rounded-lg transition-all cursor-pointer"
                  >
                    Pular Todas
                  </button>
                </div>
              </div>

              {/* Barra de Busca da Matriz na IA */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={iaSearchQuery}
                    onChange={(e) => setIaSearchQuery(e.target.value)}
                    placeholder="Buscar matriz por brinco (ex: 2003), categoria ou touro..."
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-10 pr-9 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
                  />
                  {iaSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setIaSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Limpar busca"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 text-xs text-slate-400 px-1">
                  <span className="font-mono text-[11px] sm:text-xs">
                    {filteredIaRows.length === iaRows.length ? (
                      <span>Total: <strong className="text-white">{iaRows.length}</strong> matrizes</span>
                    ) : (
                      <span>
                        Mostrando <strong className="text-emerald-300">{filteredIaRows.length}</strong> de{' '}
                        <strong className="text-white">{iaRows.length}</strong> matrizes
                      </span>
                    )}
                  </span>
                  {iaSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setIaSearchQuery('')}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold underline cursor-pointer ml-1"
                    >
                      Ver todas
                    </button>
                  )}
                </div>
              </div>

              {/* Tabela de Matrizes IA */}
              <div className="space-y-2">
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] sticky top-0 z-10">
                      <tr>
                        <th className="p-2.5 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={filteredIaRows.length > 0 && filteredIaRows.every((r) => !r.skipped)}
                            onChange={(e) => handleSetAllIaSkipped(!e.target.checked)}
                            className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500 cursor-pointer accent-emerald-500"
                            title="Marcar ou desmarcar todas as matrizes para IA"
                          />
                        </th>
                        <th className="p-2.5">Brinco</th>
                        <th className="p-2.5">Categoria</th>
                        <th className="p-2.5">Touro Utilizado</th>
                        <th className="p-2.5">Partida Sêmen</th>
                        <th className="p-2.5">Observação</th>
                        <th className="p-2.5 text-center">ECC IA</th>
                        <th className="p-2.5 text-center">Inseminar?</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 font-sans">
                      {filteredIaRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-slate-400 font-sans">
                            Nenhuma matriz encontrada com o termo &quot;{iaSearchQuery}&quot;.
                          </td>
                        </tr>
                      ) : (
                        filteredIaRows.map((row) => (
                          <tr
                            key={row.animal_id}
                            className={`hover:bg-slate-900 transition-colors ${row.skipped ? 'opacity-40 bg-slate-950/80' : ''}`}
                          >
                            <td className="p-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={!row.skipped}
                                onChange={(e) => updateIaRow(row.animal_id, { skipped: !e.target.checked })}
                                className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500 cursor-pointer accent-emerald-500"
                                title={row.skipped ? 'Dar check para inseminar esta matriz' : 'Desmarcar matriz'}
                              />
                            </td>
                            <td className="p-2.5 font-bold text-white font-mono whitespace-nowrap">{row.tag_number}</td>
                            <td className="p-2.5 text-slate-400 text-xs whitespace-nowrap">{row.category_name}</td>
                            <td className="p-2.5 whitespace-nowrap">
                              <select
                                value={row.bull_id || iaDefaultBullId}
                                disabled={row.skipped}
                                onChange={(e) => updateIaRow(row.animal_id, { bull_id: e.target.value })}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-emerald-300 font-medium focus:outline-none"
                              >
                                <option value="">Selecione...</option>
                                {bulls.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2.5 whitespace-nowrap">
                              <select
                                value={row.semen_batch_id || iaDefaultBatchId}
                                disabled={row.skipped}
                                onChange={(e) => updateIaRow(row.animal_id, { semen_batch_id: e.target.value })}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none"
                              >
                                <option value="">Selecione...</option>
                                {semenBatches.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.batch_number}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2.5 min-w-[180px]">
                              <input
                                type="text"
                                placeholder="Ex: Muco límpido, cérvix fácil..."
                                value={row.notes || ''}
                                disabled={row.skipped}
                                onChange={(e) => updateIaRow(row.animal_id, { notes: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-sans"
                              />
                            </td>
                            <td className="p-2.5 text-center whitespace-nowrap">
                              <input
                                type="number"
                                step="0.25"
                                min="1"
                                max="5"
                                value={row.ecc_ia}
                                disabled={row.skipped}
                                onChange={(e) => updateIaRow(row.animal_id, { ecc_ia: e.target.value })}
                                className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono text-center focus:outline-none focus:border-emerald-500"
                              />
                            </td>
                            <td className="p-2.5 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => updateIaRow(row.animal_id, { skipped: !row.skipped })}
                                className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                                  row.skipped
                                    ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                                }`}
                                title={row.skipped ? 'Marcar para inseminar' : 'Pular esta matriz'}
                              >
                                {row.skipped ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Observações da Inseminação
                </label>
                <textarea
                  rows={2}
                  value={iaNotes}
                  onChange={(e) => setIaNotes(e.target.value)}
                  placeholder="Ex: Todas as matrizes foram inseminadas pela manhã, sêmen com excelente motilidade..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB: DG (Diagnóstico de Gestação Rápido) */}
          {/* ============================================================== */}
          {activeTab === 'DG' && (
            <div className="space-y-5 animate-in fade-in">
              <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-200 text-xs flex items-start gap-3">
                <HeartPulse className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-sm text-purple-300 block">Etapa DG - Diagnóstico de Gestação Coletivo</span>
                  <p className="text-slate-300">
                    Defina rapidamente o resultado (Prenha ou Vazia) para cada matriz. O sistema calcula a previsão de parto (+295 dias) automaticamente para as prenhas!
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Data do Exame DG
                  </label>
                  <input
                    type="date"
                    value={dgDate}
                    onChange={(e) => setDgDate(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Veterinário / Examinador
                  </label>
                  <input
                    type="text"
                    value={dgResponsible}
                    onChange={(e) => setDgResponsible(e.target.value)}
                    placeholder="Ex: MV. Dr. Samoel Duarte"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-sans"
                  />
                </div>
              </div>

              {/* Placar de Diagnóstico & Ações Rápidas em Massa */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-3 text-xs font-bold">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    PRENHAS: {dgStats.pregnant}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                    VAZIAS: {dgStats.empty}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    TAXA PRENHEZ: {dgStats.rate}%
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSetAllDgStatus('prenha')}
                    className="px-2.5 py-1 text-xs font-bold bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-lg transition-all cursor-pointer"
                  >
                    Marcar Todas Prenhas
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllDgStatus('vazia')}
                    className="px-2.5 py-1 text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 rounded-lg transition-all cursor-pointer"
                  >
                    Marcar Todas Vazias
                  </button>
                </div>
              </div>

              {/* Barra de Busca da Matriz */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-purple-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={dgSearchQuery}
                    onChange={(e) => setDgSearchQuery(e.target.value)}
                    placeholder="Buscar matriz por brinco (ex: 2003) ou categoria..."
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-10 pr-9 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-sans"
                  />
                  {dgSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setDgSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Limpar busca"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 text-xs text-slate-400 px-1">
                  <span className="font-mono text-[11px] sm:text-xs">
                    {filteredDgRows.length === dgRows.length ? (
                      <span>Total: <strong className="text-white">{dgRows.length}</strong> matrizes</span>
                    ) : (
                      <span>
                        Mostrando <strong className="text-purple-300">{filteredDgRows.length}</strong> de{' '}
                        <strong className="text-white">{dgRows.length}</strong> matrizes
                      </span>
                    )}
                  </span>
                  {dgSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setDgSearchQuery('')}
                      className="text-[11px] text-purple-400 hover:text-purple-300 font-bold underline cursor-pointer ml-1"
                    >
                      Ver todas
                    </button>
                  )}
                </div>
              </div>

              {/* Tabela de Matrizes DG */}
              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] sticky top-0 z-10">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={filteredDgRows.length > 0 && filteredDgRows.every((r) => r.checked)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const targetIds = new Set(filteredDgRows.map((r) => r.animal_id));
                            setDgRows((prev) =>
                              prev.map((r) => (targetIds.has(r.animal_id) ? { ...r, checked } : r))
                            );
                          }}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-purple-500 focus:ring-purple-500 cursor-pointer accent-purple-500"
                          title="Marcar ou desmarcar todas as matrizes no DG"
                        />
                      </th>
                      <th className="p-3">Brinco</th>
                      <th className="p-3">Categoria</th>
                      <th className="p-3 text-center">Diagnóstico</th>
                      <th className="p-3">Observação</th>
                      <th className="p-3 text-center">ECC DG</th>
                      <th className="p-3 text-center">Previsão Parto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-mono">
                    {filteredDgRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-slate-400 font-sans">
                          Nenhuma matriz encontrada com o termo &quot;{dgSearchQuery}&quot;.
                        </td>
                      </tr>
                    ) : (
                      filteredDgRows.map((row) => (
                        <tr
                          key={row.animal_id}
                          className={`hover:bg-slate-900 transition-colors ${!row.checked ? 'opacity-40 bg-slate-950/80' : ''}`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={row.checked}
                              onChange={(e) => updateDgRow(row.animal_id, { checked: e.target.checked })}
                              className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-purple-500 focus:ring-purple-500 cursor-pointer accent-purple-500"
                              title={row.checked ? 'Desmarcar esta matriz do DG' : 'Dar check para registrar DG nesta matriz'}
                            />
                          </td>
                          <td className="p-3 font-bold text-white whitespace-nowrap">{row.tag_number}</td>
                          <td className="p-3 text-slate-400 font-sans whitespace-nowrap">{row.category_name}</td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-900 border border-slate-800 gap-1 font-sans">
                              <button
                                type="button"
                                disabled={!row.checked}
                                onClick={() => updateDgRow(row.animal_id, { pregnancy_status: 'prenha' })}
                                className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer disabled:opacity-40 ${
                                  row.pregnancy_status === 'prenha'
                                    ? 'bg-emerald-500 text-slate-950 font-black shadow-sm'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                Prenha
                              </button>
                              <button
                                type="button"
                                disabled={!row.checked}
                                onClick={() => updateDgRow(row.animal_id, { pregnancy_status: 'vazia' })}
                                className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer disabled:opacity-40 ${
                                  row.pregnancy_status === 'vazia'
                                    ? 'bg-rose-500 text-white font-black shadow-sm'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                Vazia
                              </button>
                            </div>
                          </td>
                          <td className="p-3 min-w-[200px]">
                            <input
                              type="text"
                              disabled={!row.checked}
                              placeholder="Ex: 35 dias, CL D, reavaliar..."
                              value={row.notes || ''}
                              onChange={(e) => updateDgRow(row.animal_id, { notes: e.target.value })}
                              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 font-sans disabled:opacity-40"
                            />
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <input
                              type="number"
                              step="0.25"
                              min="1"
                              max="5"
                              disabled={!row.checked}
                              value={row.ecc_dg}
                              onChange={(e) => updateDgRow(row.animal_id, { ecc_dg: e.target.value })}
                              className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono text-center focus:outline-none focus:border-purple-500 disabled:opacity-40"
                            />
                          </td>
                          <td className="p-3 text-center text-emerald-400 font-mono font-bold text-xs whitespace-nowrap">
                            {row.checked ? getExpectedParturitionDate(row.pregnancy_status) : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Observações do Diagnóstico DG
                </label>
                <textarea
                  rows={2}
                  value={dgNotes}
                  onChange={(e) => setDgNotes(e.target.value)}
                  placeholder="Ex: Ultrassonografia aos 32 dias de gestação, boa viabilidade embrionária..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
          )}

          {/* Feedback de Erro */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Botões de Ação do Rodapé */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-bold transition-all cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-950 text-xs font-black flex items-center gap-2 shadow-lg glow-emerald transition-all cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Gravando Ação Coletiva...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-3" />
                  Salvar {activeTab} para Todas as {lotAnimals.length} Matrizes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
