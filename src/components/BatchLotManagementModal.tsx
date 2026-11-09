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
  Save,
  Loader2,
  Clock,
  BarChart3,
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [savedRowsMap, setSavedRowsMap] = useState<Record<string, boolean>>({});
  const [rowSuccessMsg, setRowSuccessMsg] = useState<string | null>(null);

  const handleSafeClose = () => {
    if (hasUnsavedChanges) {
      if (
        !window.confirm(
          'Atenção: Você preencheu dados das matrizes que ainda não foram salvos. Ao fechar sem clicar no botão "Salvar", as alterações serão descartadas. Deseja realmente sair sem salvar?'
        )
      ) {
        return;
      }
    }
    onClose();
  };

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
  const [d0SearchQuery, setD0SearchQuery] = useState('');

  // ----------------------------------------------------
  // D9 State
  // ----------------------------------------------------
  const [d9Date, setD9Date] = useState(getTodayDateString());
  const [d9Responsible, setD9Responsible] = useState(lot.responsible_name || 'MV. DR. SAMOEL DUARTE');
  const [d9Notes, setD9Notes] = useState('');
  const [d9SelectedIds, setD9SelectedIds] = useState<string[]>([]);
  const [d9DeviceLossIds, setD9DeviceLossIds] = useState<string[]>([]);
  const [d9SearchQuery, setD9SearchQuery] = useState('');

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
  const [iaFilterTab, setIaFilterTab] = useState<'all' | 'pending' | 'inseminated' | 'skipped'>('all');

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
    setHasUnsavedChanges(false);

    // Initial dates
    setD0Date(lot.start_date || getTodayDateString());
    setD0Responsible(lot.responsible_name || 'MV. DR. SAMOEL DUARTE');
    setD0SelectedIds(lotAnimals.map((la) => la.animal_id));
    setD0SearchQuery('');

    setD9Date(getTodayDateString());
    setD9Responsible(lot.responsible_name || 'MV. DR. SAMOEL DUARTE');
    setD9SelectedIds(lotAnimals.map((la) => la.animal_id));
    setD9DeviceLossIds([]);
    setD9SearchQuery('');

    setIaDate(lot.ia_planned_date || getTodayDateString());
    setIaInseminator(lot.responsible_name || 'MV. DR. SAMOEL DUARTE');

    setDgDate(lot.dg_planned_date || getTodayDateString());
    setDgResponsible(lot.responsible_name || 'MV. DR. SAMOEL DUARTE');

    // Initialize IA rows & identify already inseminated matrices
    const initialSaved: Record<string, boolean> = {};
    const mappedIaRows = lotAnimals.map((la) => {
      const hasIaRecorded = Boolean(la.bull_id && la.semen_batch_id);
      if (hasIaRecorded) {
        initialSaved[la.animal_id] = true;
      }
      return {
        animal_id: la.animal_id,
        lot_animal_id: la.id,
        tag_number: la.animals?.tag_number || 'S/N',
        category_name: la.animals?.animal_categories?.name || 'Matriz',
        bull_id: la.bull_id || '',
        semen_batch_id: la.semen_batch_id || '',
        inseminator_name: la.inseminator_name || lot.responsible_name || '',
        ecc_ia: la.ecc_ia ? la.ecc_ia.toFixed(2) : '3.00',
        skipped: false,
        notes: la.notes || '',
      };
    });
    setIaRows(mappedIaRows);
    setSavedRowsMap(initialSaved);
    setIaSearchQuery('');
    setIaFilterTab('all');

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
        notes: la.notes || '',
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
    setHasUnsavedChanges(true);
    setSavedRowsMap((prev) => ({ ...prev, [animalId]: false }));
    setIaRows((prev) =>
      prev.map((row) => (row.animal_id === animalId ? { ...row, ...updates } : row))
    );
  };

  // Linhas filtradas pela busca rápida de matrizes no D0
  const filteredD0Animals = useMemo(() => {
    if (!d0SearchQuery.trim()) return lotAnimals;
    const q = d0SearchQuery.trim().toLowerCase();
    return lotAnimals.filter((la) => {
      const tag = (la.animals?.tag_number || '').toLowerCase();
      const cat = (la.animals?.animal_categories?.name || '').toLowerCase();
      const breed = (la.animals?.breeds?.name || '').toLowerCase();
      return tag.includes(q) || cat.includes(q) || breed.includes(q);
    });
  }, [lotAnimals, d0SearchQuery]);

  // Linhas filtradas pela busca rápida de matrizes no D9
  const filteredD9Animals = useMemo(() => {
    if (!d9SearchQuery.trim()) return lotAnimals;
    const q = d9SearchQuery.trim().toLowerCase();
    return lotAnimals.filter((la) => {
      const tag = (la.animals?.tag_number || '').toLowerCase();
      const cat = (la.animals?.animal_categories?.name || '').toLowerCase();
      const breed = (la.animals?.breeds?.name || '').toLowerCase();
      return tag.includes(q) || cat.includes(q) || breed.includes(q);
    });
  }, [lotAnimals, d9SearchQuery]);

  // Linhas filtradas pela aba de status (Todas / Pendentes / Inseminadas / Puladas) e busca rápida
  const filteredIaRows = useMemo(() => {
    let rows = iaRows;

    if (iaFilterTab === 'pending') {
      rows = rows.filter(
        (r) =>
          !r.skipped &&
          !savedRowsMap[r.animal_id] &&
          (!r.bull_id || !r.semen_batch_id)
      );
    } else if (iaFilterTab === 'inseminated') {
      rows = rows.filter(
        (r) =>
          !r.skipped &&
          (savedRowsMap[r.animal_id] || (Boolean(r.bull_id) && Boolean(r.semen_batch_id)))
      );
    } else if (iaFilterTab === 'skipped') {
      rows = rows.filter((r) => r.skipped);
    }

    if (!iaSearchQuery.trim()) return rows;
    const q = iaSearchQuery.trim().toLowerCase();
    return rows.filter((r) => {
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
  }, [iaRows, iaFilterTab, iaSearchQuery, savedRowsMap, bulls, semenBatches]);

  // Aplica touro e partida padrão do cabeçalho APENAS nas matrizes que estão pendentes (não salva automaticamente)
  const handleApplyDefaultsToPendingIaRows = () => {
    if (!iaDefaultBullId || !iaDefaultBatchId) {
      setErrorMsg('Selecione um touro e partida padrão no cabeçalho primeiro.');
      return;
    }

    setHasUnsavedChanges(true);
    let countUpdated = 0;
    setIaRows((prev) =>
      prev.map((row) => {
        const isAlreadyInseminated =
          savedRowsMap[row.animal_id] || (Boolean(row.bull_id) && Boolean(row.semen_batch_id));
        if (isAlreadyInseminated || row.skipped) {
          return row;
        }
        countUpdated++;
        return {
          ...row,
          bull_id: iaDefaultBullId,
          semen_batch_id: iaDefaultBatchId,
          inseminator_name: iaInseminator || row.inseminator_name,
          ecc_ia: iaDefaultEcc || row.ecc_ia,
        };
      })
    );
    setRowSuccessMsg(
      countUpdated > 0
        ? `Touro e partida preenchidos em ${countUpdated} matriz(es) pendente(s)!`
        : 'Nenhuma matriz pendente para preencher.'
    );
    setTimeout(() => setRowSuccessMsg(null), 3500);
  };

  // Toggle Loss of device for an animal in D9
  const handleToggleDeviceLoss = (animalId: string) => {
    setD9DeviceLossIds((prev) =>
      prev.includes(animalId) ? prev.filter((id) => id !== animalId) : [...prev, animalId]
    );
  };

  // Atualizar linha de DG pelo ID único do animal (blindado contra filtros e buscas)
  const updateDgRow = (animalId: string, updates: Partial<(typeof dgRows)[number]>) => {
    setHasUnsavedChanges(true);
    setSavedRowsMap((prev) => ({ ...prev, [animalId]: false }));
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

  // Salvar linha individual de IA (para operador no tronco salvar matriz por matriz)
  const handleSaveSingleIaRow = async (animalId: string) => {
    const row = iaRows.find((r) => r.animal_id === animalId);
    if (!row) return;

    if (!iaDate) {
      setErrorMsg('Informe a data da Inseminação Artificial no cabeçalho antes de salvar.');
      return;
    }

    // Se o operador não escolheu touro/partida na linha, tenta utilizar o padrão do cabeçalho
    const bullId = row.bull_id || iaDefaultBullId || null;
    const batchId = row.semen_batch_id || iaDefaultBatchId || null;

    if (!bullId || !batchId) {
      setErrorMsg(`Selecione o touro e a partida de sêmen para a matriz ${row.tag_number} antes de salvar.`);
      return;
    }

    // Atualiza imediatamente o estado da linha com o touro e partida utilizados
    updateIaRow(animalId, {
      bull_id: bullId,
      semen_batch_id: batchId,
      inseminator_name: row.inseminator_name || iaInseminator || '',
    });

    setSavingRowId(animalId);
    setErrorMsg(null);
    try {
      const item = {
        animal_id: row.animal_id,
        lot_animal_id: row.lot_animal_id,
        bull_id: bullId,
        semen_batch_id: batchId,
        inseminator_name: row.inseminator_name || iaInseminator || null,
        ecc_ia: row.ecc_ia ? parseFloat(row.ecc_ia) : null,
        skipped: row.skipped,
        notes: row.notes?.trim() || null,
      };

      const res = await executeBatchLotManagementIA({
        lotId: lot.id,
        executionDate: iaDate,
        defaultBullId: null,
        defaultSemenBatchId: null,
        defaultInseminatorName: iaInseminator || null,
        defaultEccIa: iaDefaultEcc ? parseFloat(iaDefaultEcc) : null,
        notes: iaNotes,
        items: [item],
      });

      if (!res.success) {
        setErrorMsg(res.error || `Erro ao salvar matriz ${row.tag_number}.`);
      } else {
        setSavedRowsMap((prev) => ({ ...prev, [animalId]: true }));
        setRowSuccessMsg(`Matriz ${row.tag_number} inseminada e salva com sucesso!`);
        setTimeout(() => setRowSuccessMsg(null), 3500);
        onSuccess();
      }
    } catch (err: unknown) {
      console.error('Erro ao salvar IA individual:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar matriz.');
    } finally {
      setSavingRowId(null);
    }
  };

  // Salvar linha individual de DG (para operador no tronco salvar matriz por matriz)
  const handleSaveSingleDgRow = async (animalId: string) => {
    const row = dgRows.find((r) => r.animal_id === animalId);
    if (!row) return;

    if (!dgDate) {
      setErrorMsg('Informe a data do Diagnóstico de Gestação no cabeçalho antes de salvar.');
      return;
    }

    setSavingRowId(animalId);
    setErrorMsg(null);
    try {
      const item = {
        animal_id: row.animal_id,
        lot_animal_id: row.lot_animal_id,
        pregnancy_status: row.pregnancy_status,
        ecc_dg: row.ecc_dg ? parseFloat(row.ecc_dg) : null,
        notes: row.notes?.trim() || null,
      };

      const res = await executeBatchLotManagementDG({
        lotId: lot.id,
        executionDate: dgDate,
        responsibleName: dgResponsible,
        notes: dgNotes,
        items: [item],
      });

      if (!res.success) {
        setErrorMsg(res.error || `Erro ao salvar DG da matriz ${row.tag_number}.`);
      } else {
        setSavedRowsMap((prev) => ({ ...prev, [animalId]: true }));
        const statusLabel = row.pregnancy_status === 'prenha' ? 'Prenha' : 'Vazia';
        setRowSuccessMsg(`DG da matriz ${row.tag_number} (${statusLabel}) salvo com sucesso!`);
        setTimeout(() => setRowSuccessMsg(null), 3500);
        onSuccess();
      }
    } catch (err: unknown) {
      console.error('Erro ao salvar DG individual:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar diagnóstico da matriz.');
    } finally {
      setSavingRowId(null);
    }
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

        // IMPORTANTE: Só processa e altera para inseminada as matrizes que realmente tiveram touro/partida confirmados!
        // As matrizes pendentes permanecem no lote aguardando IA no curral.
        const items = iaRows.map((r) => ({
          animal_id: r.animal_id,
          lot_animal_id: r.lot_animal_id,
          bull_id: r.bull_id || null, // NÃO força iaDefaultBullId em quem estiver em branco
          semen_batch_id: r.semen_batch_id || null, // NÃO força iaDefaultBatchId em quem estiver em branco
          inseminator_name: r.inseminator_name || iaInseminator || null,
          ecc_ia: r.ecc_ia ? parseFloat(r.ecc_ia) : null,
          skipped: r.skipped,
          notes: r.notes?.trim() || null,
        }));

        const res = await executeBatchLotManagementIA({
          lotId: lot.id,
          executionDate: iaDate,
          defaultBullId: null,
          defaultSemenBatchId: null,
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

  // IA Live Counters (Inseminadas vs Pendentes vs Puladas)
  const iaStats = useMemo(() => {
    const total = iaRows.length;
    let inseminated = 0;
    let pending = 0;
    let skipped = 0;

    iaRows.forEach((r) => {
      if (r.skipped) {
        skipped++;
      } else if (
        savedRowsMap[r.animal_id] ||
        (Boolean(r.bull_id) && Boolean(r.semen_batch_id))
      ) {
        inseminated++;
      } else {
        pending++;
      }
    });

    const progressRate = total > 0 ? ((inseminated / total) * 100).toFixed(1) : '0.0';
    return { total, inseminated, pending, skipped, progressRate };
  }, [iaRows, savedRowsMap]);

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
            onClick={handleSafeClose}
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
                <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                  <span className="font-bold text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-sky-400" /> Matrizes do Lote que Receberão D0 ({d0SelectedIds.length}/{lotAnimals.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const targetIds = filteredD0Animals.map((la) => la.animal_id);
                        const allFilteredSelected = targetIds.length > 0 && targetIds.every((id) => d0SelectedIds.includes(id));
                        if (allFilteredSelected) {
                          setD0SelectedIds((prev) => prev.filter((id) => !targetIds.includes(id)));
                        } else {
                          setD0SelectedIds((prev) => Array.from(new Set([...prev, ...targetIds])));
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-bold text-[11px] transition-all cursor-pointer"
                    >
                      {filteredD0Animals.length > 0 && filteredD0Animals.every((la) => d0SelectedIds.includes(la.animal_id))
                        ? 'Desmarcar Todas'
                        : 'Marcar Todas'}
                    </button>
                    <span className="text-slate-400 font-mono text-[11px]">Protocolo: {lot.protocol_name || 'IATF'}</span>
                  </div>
                </div>

                {/* Barra de Busca de Matrizes no D0 */}
                <div className="relative">
                  <Search className="w-4 h-4 text-sky-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={d0SearchQuery}
                    onChange={(e) => setD0SearchQuery(e.target.value)}
                    placeholder="Buscar matriz no D0 por brinco ou categoria..."
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  {d0SearchQuery && (
                    <button
                      type="button"
                      onClick={() => setD0SearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Limpar busca"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] sticky top-0 z-10">
                      <tr>
                        <th className="p-3 w-12 text-center">
                          <input
                            type="checkbox"
                            checked={
                              filteredD0Animals.length > 0 &&
                              filteredD0Animals.every((la) => d0SelectedIds.includes(la.animal_id))
                            }
                            onChange={(e) => {
                              const targetIds = filteredD0Animals.map((la) => la.animal_id);
                              if (e.target.checked) {
                                setD0SelectedIds((prev) => Array.from(new Set([...prev, ...targetIds])));
                              } else {
                                setD0SelectedIds((prev) => prev.filter((id) => !targetIds.includes(id)));
                              }
                            }}
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
                      {filteredD0Animals.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-slate-400 font-sans">
                            Nenhuma matriz encontrada com o termo &quot;{d0SearchQuery}&quot;.
                          </td>
                        </tr>
                      ) : (
                        filteredD0Animals.map((la) => {
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
                        })
                      )}
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
                      onClick={() => {
                        const targetIds = filteredD9Animals.map((la) => la.animal_id);
                        const allFilteredSelected = targetIds.length > 0 && targetIds.every((id) => d9SelectedIds.includes(id));
                        if (allFilteredSelected) {
                          setD9SelectedIds((prev) => prev.filter((id) => !targetIds.includes(id)));
                        } else {
                          setD9SelectedIds((prev) => Array.from(new Set([...prev, ...targetIds])));
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold text-[11px] transition-all cursor-pointer"
                    >
                      {filteredD9Animals.length > 0 && filteredD9Animals.every((la) => d9SelectedIds.includes(la.animal_id))
                        ? 'Desmarcar Todas'
                        : 'Marcar Todas'}
                    </button>
                    <span className="text-[11px] text-amber-400">
                      {d9DeviceLossIds.length > 0 ? `${d9DeviceLossIds.length} perda(s) registrada(s)` : 'Nenhuma perda (100% retido)'}
                    </span>
                  </div>
                </div>

                {/* Barra de Busca de Matrizes no D9 */}
                <div className="relative">
                  <Search className="w-4 h-4 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={d9SearchQuery}
                    onChange={(e) => setD9SearchQuery(e.target.value)}
                    placeholder="Buscar matriz no D9 por brinco ou categoria..."
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  {d9SearchQuery && (
                    <button
                      type="button"
                      onClick={() => setD9SearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Limpar busca"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] sticky top-0 z-10">
                      <tr>
                        <th className="p-3 w-12 text-center">
                          <input
                            type="checkbox"
                            checked={
                              filteredD9Animals.length > 0 &&
                              filteredD9Animals.every((la) => d9SelectedIds.includes(la.animal_id))
                            }
                            onChange={(e) => {
                              const targetIds = filteredD9Animals.map((la) => la.animal_id);
                              if (e.target.checked) {
                                setD9SelectedIds((prev) => Array.from(new Set([...prev, ...targetIds])));
                              } else {
                                setD9SelectedIds((prev) => prev.filter((id) => !targetIds.includes(id)));
                              }
                            }}
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
                      {filteredD9Animals.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-slate-400 font-sans">
                            Nenhuma matriz encontrada com o termo &quot;{d9SearchQuery}&quot;.
                          </td>
                        </tr>
                      ) : (
                        filteredD9Animals.map((la) => {
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
                        })
                      )}
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
          {/* TAB: IA (Inseminação Coletiva / Tronco a Tronco) */}
          {/* ============================================================== */}
          {activeTab === 'IA' && (
            <div className="space-y-5 animate-in fade-in">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs flex items-start gap-3">
                <Award className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-sm text-emerald-300 block">Etapa IA - Manejo de Inseminação Artificial</span>
                  <p className="text-slate-300">
                    Trabalhe matriz por matriz no tronco ou aplique o touro padrão nas pendentes. <strong>Apenas matrizes com touro e partida confirmados serão registradas como inseminadas</strong> — as demais continuam pendentes com segurança.
                  </p>
                </div>
              </div>

              {/* Controles Padrão (Batch Defaults / Template) */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Configuração Padrão do Lote (Modelo)
                    {loadingAux && <RefreshCw className="w-3 h-3 animate-spin text-emerald-400 ml-1" />}
                  </span>
                  <button
                    type="button"
                    onClick={handleApplyDefaultsToPendingIaRows}
                    disabled={!iaDefaultBullId || !iaDefaultBatchId}
                    className="text-xs font-bold px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
                    title="Preenche o touro e a partida padrão apenas nas matrizes pendentes (não salva automaticamente)"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Preencher Touro Padrão nas Pendentes
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

              {/* Placar de Progresso da IA (Inseminadas vs Pendentes) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-950 p-3 rounded-2xl border border-slate-800 text-xs font-bold">
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">Total no Lote</span>
                  <span className="text-lg font-black text-white font-mono">{iaStats.total}</span>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Já Inseminadas
                  </span>
                  <span className="text-lg font-black text-emerald-300 font-mono">{iaStats.inseminated} doses</span>
                </div>

                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-amber-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Pendentes no Tronco
                  </span>
                  <span className="text-lg font-black text-amber-300 font-mono">{iaStats.pending} a fazer</span>
                </div>

                <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-purple-400 flex items-center gap-1">
                    <BarChart3 className="w-3 h-3" /> Progresso da IA
                  </span>
                  <span className="text-lg font-black text-purple-300 font-mono">{iaStats.progressRate}%</span>
                </div>
              </div>

              {/* Abas de Visualização (Filtros Rápidos) */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                <button
                  type="button"
                  onClick={() => setIaFilterTab('all')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                    iaFilterTab === 'all'
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  Todas ({iaStats.total})
                </button>

                <button
                  type="button"
                  onClick={() => setIaFilterTab('pending')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    iaFilterTab === 'pending'
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                      : 'bg-slate-900 text-amber-400/90 hover:text-amber-300 border border-amber-500/30'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Pendentes ({iaStats.pending})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIaFilterTab('inseminated')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    iaFilterTab === 'inseminated'
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black'
                      : 'bg-slate-900 text-emerald-400/90 hover:text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Inseminadas ({iaStats.inseminated})</span>
                </button>

                {iaStats.skipped > 0 && (
                  <button
                    type="button"
                    onClick={() => setIaFilterTab('skipped')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      iaFilterTab === 'skipped'
                        ? 'bg-slate-600 text-white font-black'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    <span>Puladas ({iaStats.skipped})</span>
                  </button>
                )}
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
                        Exibindo <strong className="text-emerald-300">{filteredIaRows.length}</strong> de{' '}
                        <strong className="text-white">{iaRows.length}</strong> matrizes
                      </span>
                    )}
                  </span>
                  {(iaSearchQuery || iaFilterTab !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setIaSearchQuery('');
                        setIaFilterTab('all');
                      }}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold underline cursor-pointer ml-1"
                    >
                      Ver todas
                    </button>
                  )}
                </div>
              </div>

              {/* Toast / Alerta de Sucesso por Linha Salva */}
              {rowSuccessMsg && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{rowSuccessMsg}</span>
                </div>
              )}

              {/* Tabela de Matrizes IA */}
              <div className="space-y-2">
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] sticky top-0 z-10">
                      <tr>
                        <th className="p-2.5 text-center w-28">Status IA</th>
                        <th className="p-2.5">Brinco</th>
                        <th className="p-2.5">Categoria</th>
                        <th className="p-2.5">Touro Utilizado</th>
                        <th className="p-2.5">Partida Sêmen</th>
                        <th className="p-2.5">Observação</th>
                        <th className="p-2.5 text-center">ECC IA</th>
                        <th className="p-2.5 text-center">Pular?</th>
                        <th className="p-2.5 text-center w-28">Ação Tronco</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 font-sans">
                      {filteredIaRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-6 text-center text-slate-400 font-sans">
                            {iaFilterTab === 'pending'
                              ? 'Nenhuma matriz pendente neste lote! Todas já foram trabalhadas.'
                              : iaFilterTab === 'inseminated'
                              ? 'Nenhuma matriz inseminada ainda neste lote.'
                              : `Nenhuma matriz encontrada com o filtro atual.`}
                          </td>
                        </tr>
                      ) : (
                        filteredIaRows.map((row) => {
                          const isRowInseminated =
                            savedRowsMap[row.animal_id] ||
                            (Boolean(row.bull_id) && Boolean(row.semen_batch_id));

                          const currentBullId = row.bull_id;
                          const rowBatches = currentBullId
                            ? semenBatches.filter(
                                (b) =>
                                  (b as unknown as { bull_id?: string }).bull_id === currentBullId ||
                                  (b.bulls as Record<string, unknown> | null)?.id === currentBullId ||
                                  b.id === row.semen_batch_id
                              )
                            : [];

                          return (
                            <tr
                              key={row.animal_id}
                              className={`transition-colors ${
                                row.skipped
                                  ? 'opacity-40 bg-slate-950/80'
                                  : isRowInseminated
                                  ? 'bg-emerald-950/15 hover:bg-emerald-950/25 border-l-2 border-emerald-500'
                                  : 'hover:bg-slate-900 border-l-2 border-amber-500/40'
                              }`}
                            >
                              {/* Coluna 1: Status Visual */}
                              <td className="p-2.5 text-center whitespace-nowrap">
                                {row.skipped ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                    <X className="w-3 h-3 text-slate-400" /> Pulada
                                  </span>
                                ) : isRowInseminated ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm">
                                    <Check className="w-3 h-3 stroke-3 text-emerald-400" /> Inseminada
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                    <Clock className="w-3 h-3 text-amber-400" /> Pendente
                                  </span>
                                )}
                              </td>

                              {/* Coluna 2: Brinco */}
                              <td className="p-2.5 font-bold text-white font-mono whitespace-nowrap">
                                {row.tag_number}
                              </td>

                              {/* Coluna 3: Categoria */}
                              <td className="p-2.5 text-slate-400 text-xs whitespace-nowrap">
                                {row.category_name}
                              </td>

                              {/* Coluna 4: Touro Utilizado */}
                              <td className="p-2.5 whitespace-nowrap">
                                <select
                                  value={row.bull_id}
                                  disabled={row.skipped}
                                  onChange={(e) => {
                                    const newBullId = e.target.value;
                                    const matchBatches = semenBatches.filter(
                                      (b) =>
                                        (b as unknown as { bull_id?: string }).bull_id === newBullId ||
                                        (b.bulls as Record<string, unknown> | null)?.id === newBullId
                                    );
                                    const firstBatchId = matchBatches.length > 0 ? matchBatches[0].id : '';
                                    updateIaRow(row.animal_id, {
                                      bull_id: newBullId,
                                      semen_batch_id: firstBatchId,
                                    });
                                  }}
                                  className={`bg-slate-900 border rounded-lg px-2 py-1 text-xs font-medium focus:outline-none ${
                                    row.bull_id
                                      ? 'border-emerald-500/50 text-emerald-300 font-bold'
                                      : 'border-slate-700 text-slate-400'
                                  }`}
                                >
                                  <option value="">-- Selecionar Touro --</option>
                                  {bulls.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.name}
                                    </option>
                                  ))}
                                </select>
                              </td>

                              {/* Coluna 5: Partida de Sêmen */}
                              <td className="p-2.5 whitespace-nowrap">
                                <select
                                  value={row.semen_batch_id}
                                  disabled={row.skipped || !row.bull_id}
                                  onChange={(e) => updateIaRow(row.animal_id, { semen_batch_id: e.target.value })}
                                  className={`bg-slate-900 border rounded-lg px-2 py-1 text-xs font-mono focus:outline-none ${
                                    row.semen_batch_id
                                      ? 'border-emerald-500/50 text-emerald-300 font-bold'
                                      : 'border-slate-700 text-slate-500'
                                  }`}
                                >
                                  <option value="">
                                    {!row.bull_id
                                      ? '-- Escolha o Touro --'
                                      : rowBatches.length === 0
                                      ? 'Sem estoque'
                                      : '-- Selecionar Partida --'}
                                  </option>
                                  {rowBatches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.batch_number} (Saldo: {b.initial_quantity - b.used_quantity - (b.lost_quantity || 0)})
                                    </option>
                                  ))}
                                </select>
                              </td>

                              {/* Coluna 6: Observação */}
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

                              {/* Coluna 7: ECC IA */}
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

                              {/* Coluna 8: Pular Matriz */}
                              <td className="p-2.5 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => updateIaRow(row.animal_id, { skipped: !row.skipped })}
                                  className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                                    row.skipped
                                      ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                                      : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                                  }`}
                                  title={row.skipped ? 'Voltar matriz para a lista de IA' : 'Pular esta matriz (não inseminar)'}
                                >
                                  {row.skipped ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                                </button>
                              </td>

                              {/* Coluna 9: Ação Tronco */}
                              <td className="p-2.5 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  disabled={savingRowId === row.animal_id || row.skipped}
                                  onClick={() => handleSaveSingleIaRow(row.animal_id)}
                                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm ${
                                    isRowInseminated
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                                      : 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black shadow-md glow-emerald'
                                  } disabled:opacity-50`}
                                  title={isRowInseminated ? 'Atualizar dados salvos desta matriz' : 'Inseminar e salvar esta matriz no tronco agora'}
                                >
                                  {savingRowId === row.animal_id ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      <span>Salvando...</span>
                                    </>
                                  ) : isRowInseminated ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      <span>Salva</span>
                                    </>
                                  ) : (
                                    <>
                                      <Syringe className="w-3.5 h-3.5" />
                                      <span>Inseminar</span>
                                    </>
                                  )}
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

              {/* Dica de Ressincronização para o Veterinário */}
              {dgStats.empty > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>{dgStats.empty} matriz(es) vazia(s)</strong> identificada(s). Ao concluir este diagnóstico, você poderá acionar a <strong>Ressincronização em 1 clique</strong> na ficha do lote para iniciar a 2ª IATF mantendo as {dgStats.pregnant} prenhas 100% blindadas!
                    </span>
                  </div>
                </div>
              )}

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

              {/* Toast / Alerta de Sucesso por Linha Salva no DG */}
              {rowSuccessMsg && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-semibold animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>{rowSuccessMsg}</span>
                </div>
              )}

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
                      <th className="p-3 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-mono">
                    {filteredDgRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-slate-400 font-sans">
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
                          <td className="p-3 text-center whitespace-nowrap font-sans">
                            <button
                              type="button"
                              disabled={!row.checked || savingRowId === row.animal_id}
                              onClick={() => handleSaveSingleDgRow(row.animal_id)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm ${
                                savedRowsMap[row.animal_id]
                                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30'
                                  : 'bg-purple-600 hover:bg-purple-500 text-white hover:shadow-purple-900/30'
                              } disabled:opacity-40`}
                              title="Salvar imediatamente o diagnóstico desta matriz"
                            >
                              {savingRowId === row.animal_id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Salvando...</span>
                                </>
                              ) : savedRowsMap[row.animal_id] ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-purple-400" />
                                  <span>Salvo!</span>
                                </>
                              ) : (
                                <>
                                  <Save className="w-3.5 h-3.5" />
                                  <span>Salvar</span>
                                </>
                              )}
                            </button>
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
              onClick={handleSafeClose}
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
                  Salvando Informações do Lote...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-3" />
                  Salvar Informações do Lote
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
