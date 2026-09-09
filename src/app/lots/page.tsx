'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  getLots,
  getLotAnimals,
  getProtocols,
  getProperties,
  createLot,
  updateLotCode,
  deleteLot,
  addAnimalsToLot,
  removeAnimalFromLot,
  getAvailableAnimalsForLot,
  createAndAddAnimalToLot,
  getBreeds,
  getAnimalCategories,
  getFarms,
  getManagementEvents,
  getVeterinarians,
  type LotStat,
  type LotAnimal,
  type Protocol,
  type Property,
  type Breed,
  type AnimalCategory,
  type Farm,
  type Animal,
  type ManagementEvent,
  type Veterinarian,
} from '@/lib/db';
import {
  Layers,
  Plus,
  Search,
  RefreshCw,
  X,
  CheckCircle2,
  Clock,
  Trash2,
  Tag,
  Check,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Syringe,
  Calendar,
  Pencil,
} from 'lucide-react';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  concluido: { label: 'Concluído', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  em_andamento: { label: 'Em Andamento', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  planejado: { label: 'Planejado', color: 'text-slate-400 bg-slate-800 border-slate-700' },
};

interface LotStepItem {
  code: string;
  name: string;
  date: string;
  formattedDate: string;
  status: 'completed' | 'today' | 'upcoming';
  isToday: boolean;
}

interface LotProgressInfo {
  badgeText: string;
  badgeStyle: string;
  isToday: boolean;
  steps: LotStepItem[];
  currentStepName: string;
  currentStepDate: string | null;
}

function computeLotProgress(
  lot: LotStat,
  events: ManagementEvent[],
  protocolsList: Protocol[]
): LotProgressInfo {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const lotEvents = events.filter((e) => e.lot_id === lot.id);
  let rawSteps: { code: string; name: string; date: string }[] = [];

  if (lotEvents.length > 0) {
    rawSteps = lotEvents
      .filter((e) => Boolean(e.planned_date))
      .sort((a, b) => a.planned_date.localeCompare(b.planned_date))
      .map((e) => ({
        code: e.step_code,
        name: e.step_name || e.step_code,
        date: e.planned_date,
      }));
  } else {
    const matchedProtocol = protocolsList.find((p) => p.name === lot.protocol_name);
    if (matchedProtocol && matchedProtocol.protocol_steps && matchedProtocol.protocol_steps.length > 0 && lot.start_date) {
      const d0Date = new Date(lot.start_date + 'T00:00:00');
      rawSteps = matchedProtocol.protocol_steps
        .slice()
        .sort((a, b) => a.step_order - b.step_order)
        .map((s) => {
          const stepDate = new Date(d0Date);
          stepDate.setDate(stepDate.getDate() + s.day_offset);
          const y = stepDate.getFullYear();
          const m = String(stepDate.getMonth() + 1).padStart(2, '0');
          const d = String(stepDate.getDate()).padStart(2, '0');
          return {
            code: s.code,
            name: s.name || s.code,
            date: `${y}-${m}-${d}`,
          };
        });
    } else {
      if (lot.start_date) rawSteps.push({ code: 'D0', name: 'Início / Implante', date: lot.start_date });
      if (lot.ia_planned_date) rawSteps.push({ code: 'IA', name: 'Inseminação Artificial', date: lot.ia_planned_date });
      if (lot.dg_planned_date) rawSteps.push({ code: 'DG', name: 'Diagnóstico Gestação', date: lot.dg_planned_date });
    }
  }

  if (rawSteps.length === 0) {
    return {
      badgeText: 'Sem datas agendadas',
      badgeStyle: 'text-slate-400 bg-slate-800 border-slate-700',
      isToday: false,
      steps: [],
      currentStepName: 'Não definido',
      currentStepDate: null,
    };
  }

  const steps: LotStepItem[] = rawSteps.map((step) => {
    const isToday = step.date === todayStr;
    const parts = step.date.split('-');
    const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}` : step.date;

    let status: 'completed' | 'today' | 'upcoming' = 'upcoming';
    if (lot.status === 'concluido' || step.date < todayStr) {
      status = 'completed';
    } else if (isToday) {
      status = 'today';
    } else {
      status = 'upcoming';
    }

    return {
      code: step.code,
      name: step.name,
      date: step.date,
      formattedDate,
      status,
      isToday,
    };
  });

  const todayStep = steps.find((s) => s.isToday);

  if (todayStep) {
    return {
      badgeText: `${todayStep.code} - ${todayStep.name} (Hoje)`,
      badgeStyle: 'text-amber-300 bg-amber-500/15 border-amber-500/30 ring-1 ring-amber-400/40',
      isToday: true,
      steps,
      currentStepName: `${todayStep.code} - ${todayStep.name}`,
      currentStepDate: todayStep.date,
    };
  }

  const nextStep = steps.find((s) => s.status === 'upcoming');

  if (nextStep) {
    const diffTime = new Date(nextStep.date + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const dayLabel = diffDays === 1 ? 'amanhã' : `em ${diffDays}d`;
    const hasStarted = steps.some((s) => s.status === 'completed');

    return {
      badgeText: `${hasStarted ? 'Próximo' : 'Início'}: ${nextStep.code} (${nextStep.formattedDate} • ${dayLabel})`,
      badgeStyle: hasStarted ? 'text-sky-400 bg-sky-500/15 border-sky-500/30' : 'text-slate-300 bg-slate-800 border-slate-700',
      isToday: false,
      steps,
      currentStepName: nextStep.name,
      currentStepDate: nextStep.date,
    };
  }

  return {
    badgeText: lot.status === 'concluido' ? 'Protocolo Concluído' : 'Etapas Realizadas (Aguardando DG)',
    badgeStyle: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
    isToday: false,
    steps,
    currentStepName: 'Ciclo Concluído',
    currentStepDate: steps[steps.length - 1]?.date || null,
  };
}
import { useActiveFarm } from '@/context/FarmContext';
import { useActiveSeason } from '@/context/SeasonContext';

export default function LotsPage() {
  const router = useRouter();
  const { activeFarmId, activeFarm } = useActiveFarm();
  const { seasons, activeSeasonId, activeSeason } = useActiveSeason();
  const [lots, setLots] = useState<LotStat[]>([]);
  const [managementEvents, setManagementEvents] = useState<ManagementEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [lotAnimals, setLotAnimals] = useState<LotAnimal[]>([]);
  const [loadingAnimals, setLoadingAnimals] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewLot, setShowNewLot] = useState(false);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [categories, setCategories] = useState<AnimalCategory[]>([]);
  const [veterinarians, setVeterinarians] = useState<Veterinarian[]>([]);
  const [saving, setSaving] = useState(false);

  // New lot form state
  const [form, setForm] = useState({
    code: '',
    property_id: '',
    protocol_id: '',
    start_date: '',
    season_id: '',
    responsible_name: 'MV. DR. SAMOEL DUARTE',
  });

  // Modal: Add Animals to Lot
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<'existing' | 'new'>('existing');
  const [availableAnimals, setAvailableAnimals] = useState<Animal[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [animalSearch, setAnimalSearch] = useState('');
  const [selectedAnimalIds, setSelectedAnimalIds] = useState<string[]>([]);
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [deletingAnimalId, setDeletingAnimalId] = useState<string | null>(null);

  // Quick Animal Form
  const [quickAnimal, setQuickAnimal] = useState({
    tag_number: '',
    rfid_number: '',
    breed_id: '',
    category_id: '',
    reproductive_status: 'vazia',
  });
  const [addModalError, setAddModalError] = useState<string | null>(null);

  // Feedback Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4500);
  };

  // Delete Lot State
  const [lotToDelete, setLotToDelete] = useState<LotStat | null>(null);
  const [isDeletingLot, setIsDeletingLot] = useState(false);

  const handleConfirmDeleteLot = async () => {
    if (!lotToDelete) return;
    setIsDeletingLot(true);
    const res = await deleteLot(lotToDelete.id);
    setIsDeletingLot(false);

    if (res.success) {
      showToast(`Lote "${lotToDelete.code}" excluído com sucesso!`);
      if (selectedLotId === lotToDelete.id) {
        setSelectedLotId(null);
      }
      setLotToDelete(null);
      await loadLots();
    } else {
      showToast(res.error || 'Erro ao excluir o lote.', 'error');
    }
  };

  // Inline Lot Code Editing
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [editingLotCode, setEditingLotCode] = useState('');
  const [savingLotId, setSavingLotId] = useState<string | null>(null);
  const isCancellingRef = useRef(false);

  const handleStartEditLot = (e: React.MouseEvent, lotId: string, currentCode: string) => {
    e.stopPropagation();
    isCancellingRef.current = false;
    setEditingLotId(lotId);
    setEditingLotCode(currentCode);
  };

  const handleSaveLotCode = async (lotId: string, originalCode: string) => {
    if (isCancellingRef.current) {
      isCancellingRef.current = false;
      return;
    }

    const trimmed = editingLotCode.trim();
    if (!trimmed) {
      showToast('O nome do lote não pode ficar em branco.', 'error');
      setEditingLotId(null);
      return;
    }

    if (trimmed === originalCode) {
      setEditingLotId(null);
      return;
    }

    setSavingLotId(lotId);
    const res = await updateLotCode(lotId, trimmed);
    setSavingLotId(null);
    setEditingLotId(null);

    if (res.success) {
      setLots((prev) =>
        prev.map((l) => (l.id === lotId ? { ...l, code: trimmed } : l))
      );
      showToast(`Nome do lote alterado para "${trimmed}" com sucesso!`);
      loadLots();
    } else {
      showToast(res.error || 'Erro ao atualizar nome do lote.', 'error');
      loadLots();
    }
  };

  const loadLots = useCallback(async () => {
    setLoading(true);
    const [lotsData, eventsData] = await Promise.all([
      getLots(false, activeFarmId || undefined),
      getManagementEvents(false, activeFarmId || undefined),
    ]);
    setLots(lotsData);
    setManagementEvents(eventsData);
    setLoading(false);
  }, [activeFarmId]);

  const loadAuxData = useCallback(async () => {
    const [p, pr, f, b, c, v] = await Promise.all([
      getProtocols(),
      getProperties(false, activeFarmId || undefined),
      getFarms(),
      getBreeds(),
      getAnimalCategories(),
      getVeterinarians(),
    ]);
    // Prioritize Nelore so it appears first by default
    const sortedBreeds = b.slice().sort((x, y) => {
      const xIsNelore = x.name.toLowerCase().includes('nelore');
      const yIsNelore = y.name.toLowerCase().includes('nelore');
      if (xIsNelore && !yIsNelore) return -1;
      if (!xIsNelore && yIsNelore) return 1;
      return x.name.localeCompare(y.name);
    });
    setProtocols(p);
    setProperties(pr);
    setFarms(f);
    setBreeds(sortedBreeds);
    setCategories(c);
    setVeterinarians(v);

    const defaultBreed = sortedBreeds.find((x) => x.name.toLowerCase().includes('nelore'))?.id || sortedBreeds[0]?.id || '';
    setQuickAnimal((prev) => ({
      ...prev,
      breed_id: prev.breed_id || defaultBreed,
      category_id: prev.category_id || c[0]?.id || '',
    }));

    const defaultVet = v.find((vet) => vet.is_default) || v[0];
    if (defaultVet) {
      const defaultVetLabel = defaultVet.crmv ? `${defaultVet.name} (${defaultVet.crmv})` : defaultVet.name;
      setForm((prev) => ({
        ...prev,
        responsible_name: prev.responsible_name && prev.responsible_name !== 'MV. DR. SAMOEL DUARTE' ? prev.responsible_name : defaultVetLabel,
      }));
    }
  }, [activeFarmId]);

  useEffect(() => {
    loadLots();
    loadAuxData();
  }, [loadLots, loadAuxData]);

  async function handleSelectLot(id: string) {
    setSelectedLotId(id);
    setLoadingAnimals(true);
    const animals = await getLotAnimals(id);
    setLotAnimals(animals);
    setLoadingAnimals(false);
  }

  async function handleCreateLot(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code || !form.property_id || !form.protocol_id || !form.start_date) return;
    setSaving(true);
    const id = await createLot({
      ...form,
      season_id: form.season_id || activeSeasonId || undefined,
    });
    setSaving(false);
    if (id) {
      setShowNewLot(false);
      const defaultVet = veterinarians.find((vet) => vet.is_default) || veterinarians[0];
      const defaultVetLabel = defaultVet ? (defaultVet.crmv ? `${defaultVet.name} (${defaultVet.crmv})` : defaultVet.name) : 'MV. DR. SAMOEL DUARTE';
      setForm({
        code: '',
        property_id: '',
        protocol_id: '',
        start_date: '',
        season_id: activeSeasonId || '',
        responsible_name: defaultVetLabel,
      });
      await loadLots();
      showToast(`Lote ${form.code} criado com sucesso! Agenda gerada.`);
    }
  }

  // Load available animals when opening the Add Modal
  const loadAvailableAnimals = useCallback(async (lotId: string, search = '') => {
    setLoadingAvailable(true);
    const currentLot = lots.find((l) => l.id === lotId);
    const targetFarmId = currentLot?.farm_id || activeFarmId || undefined;
    const data = await getAvailableAnimalsForLot(lotId, search, targetFarmId);
    setAvailableAnimals(data);
    setLoadingAvailable(false);
  }, [lots, activeFarmId]);

  const openAddModal = () => {
    if (!selectedLotId) return;
    setSelectedAnimalIds([]);
    setAnimalSearch('');
    setAddMode('existing');
    setAddModalError(null);
    const neloreBreed = breeds.find((b) => b.name.toLowerCase().includes('nelore'))?.id || breeds[0]?.id || '';
    setQuickAnimal({
      tag_number: '',
      rfid_number: '',
      breed_id: neloreBreed,
      category_id: categories[0]?.id || '',
      reproductive_status: 'vazia',
    });
    setShowAddModal(true);
    loadAvailableAnimals(selectedLotId, '');
  };

  // Search filter effect for available animals
  useEffect(() => {
    if (!showAddModal || !selectedLotId || addMode !== 'existing') return;
    const t = setTimeout(() => {
      loadAvailableAnimals(selectedLotId, animalSearch);
    }, 250);
    return () => clearTimeout(t);
  }, [animalSearch, showAddModal, selectedLotId, addMode, loadAvailableAnimals]);

  const toggleSelectAnimal = (id: string) => {
    setSelectedAnimalIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllAvailable = () => {
    if (selectedAnimalIds.length === availableAnimals.length) {
      setSelectedAnimalIds([]);
    } else {
      setSelectedAnimalIds(availableAnimals.map((a) => a.id));
    }
  };

  const handleLinkExistingAnimals = async () => {
    if (!selectedLotId || selectedAnimalIds.length === 0) return;
    setAddModalError(null);
    setSubmittingAdd(true);
    const res = await addAnimalsToLot(selectedLotId, selectedAnimalIds);
    setSubmittingAdd(false);

    if (res.success) {
      setAddModalError(null);
      showToast(`${selectedAnimalIds.length} matriz(es) vinculada(s) ao lote com sucesso!`);
      setShowAddModal(false);
      setSelectedAnimalIds([]);
      // Reload lot animals and metrics
      await Promise.all([handleSelectLot(selectedLotId), loadLots()]);
    } else {
      const errMsg = res.error || 'Erro ao vincular matrizes.';
      setAddModalError(errMsg);
      showToast(errMsg, 'error');
    }
  };

  const handleCreateAndAddQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLotId || !quickAnimal.tag_number.trim()) {
      setAddModalError('Informe o número do brinco.');
      showToast('Informe o número do brinco.', 'error');
      return;
    }

    const currentLot = lots.find((l) => l.id === selectedLotId);
    const farmId = currentLot?.farm_id || activeFarmId;
    if (!farmId) {
      setAddModalError('Nenhuma fazenda selecionada para vincular a matriz.');
      showToast('Nenhuma fazenda selecionada para vincular a matriz.', 'error');
      return;
    }

    // Match property from lot
    const matchedProp = properties.find((p) => p.name === currentLot?.property_name);

    setAddModalError(null);
    setSubmittingAdd(true);
    const res = await createAndAddAnimalToLot(selectedLotId, {
      farm_id: farmId,
      property_id: matchedProp?.id,
      tag_number: quickAnimal.tag_number.trim(),
      rfid_number: quickAnimal.rfid_number.trim() || undefined,
      breed_id: quickAnimal.breed_id || undefined,
      category_id: quickAnimal.category_id || undefined,
      reproductive_status: quickAnimal.reproductive_status || 'vazia',
    });
    setSubmittingAdd(false);

    if (res.success) {
      setAddModalError(null);
      showToast(`Matriz Brinco ${quickAnimal.tag_number} cadastrada e adicionada ao lote!`);
      const neloreBreed = breeds.find((b) => b.name.toLowerCase().includes('nelore'))?.id || breeds[0]?.id || '';
      setQuickAnimal({
        tag_number: '',
        rfid_number: '',
        breed_id: neloreBreed,
        category_id: categories[0]?.id || '',
        reproductive_status: 'vazia',
      });
      setShowAddModal(false);
      await Promise.all([handleSelectLot(selectedLotId), loadLots()]);
    } else {
      const errMsg = res.error || 'Erro ao cadastrar matriz.';
      setAddModalError(errMsg);
      showToast(errMsg, 'error');
    }
  };

  const handleRemoveAnimal = async (lotAnimalId: string, tagNumber: string) => {
    if (!confirm(`Deseja realmente remover a matriz Brinco ${tagNumber} deste lote?`)) return;
    setDeletingAnimalId(lotAnimalId);
    const ok = await removeAnimalFromLot(lotAnimalId);
    setDeletingAnimalId(null);

    if (ok && selectedLotId) {
      showToast(`Matriz ${tagNumber} removida do lote.`);
      await Promise.all([handleSelectLot(selectedLotId), loadLots()]);
    } else {
      showToast('Erro ao remover matriz do lote.', 'error');
    }
  };

  const filteredLots = lots.filter((l) => {
    // Isolamento estrito por fazenda
    if (activeFarmId && l.farm_id && l.farm_id !== activeFarmId) return false;
    return (
      l.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.property_name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.protocol_name ?? '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const selectedLot = lots.find((l) => l.id === selectedLotId);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-9999 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-2 text-sm transition-all duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40 glow-emerald'
              : 'bg-rose-950/90 text-rose-300 border-rose-500/40'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Layers className="w-6 h-6 text-emerald-400" />
            Gestão de Lotes de IATF
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {loading ? 'Carregando...' : `${filteredLots.length} lotes da ${activeFarm?.name || 'fazenda ativa'} na estação ${activeSeason?.name || 'ativa'}`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar lote, retiro..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs sm:text-sm pl-9 pr-4 py-2 rounded-xl focus:outline-none focus:border-emerald-500 transition-all w-48 sm:w-64"
            />
          </div>
          <button
            onClick={() => {
              setForm((f) => ({ ...f, season_id: f.season_id || activeSeasonId || '' }));
              setShowNewLot(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-md glow-emerald cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Novo Lote
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
          Carregando lotes do Supabase...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredLots.map((lot) => {
            const statusInfo = STATUS_LABELS[lot.status] ?? STATUS_LABELS['planejado'];
            const progress = computeLotProgress(lot, managementEvents, protocols);
            return (
              <div
                key={lot.id}
                onClick={() => handleSelectLot(lot.id)}
                className="glass-card p-5 rounded-2xl border border-slate-800 hover:border-emerald-500/40 transition-all cursor-pointer group space-y-4 relative overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {editingLotId === lot.id ? (
                      <div
                        className="flex items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editingLotCode}
                          onChange={(e) => setEditingLotCode(e.target.value)}
                          onBlur={() => handleSaveLotCode(lot.id, lot.code)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveLotCode(lot.id, lot.code);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              isCancellingRef.current = true;
                              setEditingLotId(null);
                            }
                          }}
                          disabled={savingLotId === lot.id}
                          autoFocus
                          className="bg-slate-950 border-2 border-emerald-500 text-white font-extrabold text-base sm:text-lg px-2.5 py-0.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 w-40 sm:w-52 transition-all shadow-lg"
                          placeholder="Nome do lote..."
                        />
                        {savingLotId === lot.id && (
                          <RefreshCw className="w-4 h-4 animate-spin text-emerald-400 shrink-0" />
                        )}
                      </div>
                    ) : (
                      <div
                        onClick={(e) => handleStartEditLot(e, lot.id, lot.code)}
                        className="group/title flex items-center gap-1.5 cursor-pointer hover:bg-slate-800/70 px-1.5 py-0.5 -ml-1.5 rounded-lg transition-colors"
                        title="Clique para editar o nome do lote"
                      >
                        <span className="font-extrabold text-lg text-white group-hover/title:text-emerald-400 transition-colors">
                          {lot.code}
                        </span>
                        <Pencil className="w-3.5 h-3.5 text-slate-500 opacity-60 group-hover/title:opacity-100 group-hover/title:text-emerald-400 transition-all shrink-0" />
                      </div>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      {lot.property_name ?? lot.farm_name}
                    </span>
                    {lot.season_name && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                        {lot.season_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-xs font-semibold border px-2.5 py-1 rounded-lg flex items-center gap-1 ${statusInfo.color}`}>
                      {lot.pregnancy_rate > 0 ? (
                        <><CheckCircle2 className="w-3 h-3" /> {lot.pregnancy_rate.toFixed(1)}%</>
                      ) : (
                        <><Clock className="w-3 h-3" /> {statusInfo.label}</>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLotToDelete(lot);
                      }}
                      title="Excluir Lote"
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="text-xs text-slate-400 space-y-1">
                  <p><strong className="text-slate-300">Protocolo:</strong> {lot.protocol_name}</p>
                  <p>
                    <strong className="text-slate-300">D0:</strong> {lot.start_date}
                    {lot.ia_planned_date && <> • <strong className="text-slate-300">IA:</strong> {lot.ia_planned_date}</>}
                    {lot.dg_planned_date && <> • <strong className="text-slate-300">DG:</strong> {lot.dg_planned_date}</>}
                  </p>
                  <p><strong className="text-slate-300">Responsável:</strong> {lot.responsible_name}</p>
                </div>

                {/* Mini Barra de Progresso / Stepper dos Manejos (Opção C) */}
                {progress.steps.length > 0 && (
                  <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800/80 space-y-2.5">
                    {/* Header: Título e Manejo Atual - Toque rápido para Agenda */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        const targetDate = progress.currentStepDate || lot.start_date;
                        router.push(`/agenda?date=${targetDate}&lot=${encodeURIComponent(lot.code)}`);
                      }}
                      className="flex items-center justify-between gap-2 text-xs p-1.5 -m-1 rounded-xl hover:bg-slate-800/80 active:bg-slate-800 transition-all cursor-pointer group/header touch-manipulation"
                      title="Toque para abrir este manejo na Agenda de Campo"
                    >
                      <span className="text-slate-400 group-hover/header:text-emerald-400 font-medium flex items-center gap-1.5 shrink-0 transition-colors">
                        <Syringe className="w-3.5 h-3.5 text-emerald-400" />
                        Manejo Atual:
                      </span>
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg border truncate max-w-42.5 sm:max-w-none flex items-center gap-1.5 ${progress.badgeStyle}`}>
                          {progress.isToday && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                            </span>
                          )}
                          {progress.badgeText}
                        </span>
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 group-hover/header:bg-emerald-500/25">
                          <Calendar className="w-3 h-3" />
                          <ArrowRight className="w-2.5 h-2.5" />
                        </span>
                      </div>
                    </div>

                    {/* Stepper Visual com botões touch */}
                    <div className="pt-1.5 pb-0.5 px-1">
                      <div className="flex items-center justify-between relative">
                        {progress.steps.map((step, idx) => {
                          const isCompleted = step.status === 'completed';
                          const isCurrentToday = step.status === 'today';

                          return (
                            <div key={step.code + idx} className="flex-1 flex items-center last:flex-none">
                              {/* Step Node Button */}
                              <div className="flex flex-col items-center group/step relative">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/agenda?date=${step.date}&lot=${encodeURIComponent(lot.code)}`);
                                  }}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-extrabold transition-all duration-300 touch-manipulation cursor-pointer ${
                                    isCurrentToday
                                      ? 'bg-amber-400 text-slate-950 ring-4 ring-amber-400/25 shadow-lg shadow-amber-400/30 scale-110 hover:brightness-110'
                                      : isCompleted
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/30'
                                      : 'bg-slate-800 text-slate-400 border border-slate-700/80 hover:border-slate-600'
                                  }`}
                                  title={`Ver etapa ${step.code} (${step.formattedDate}) na Agenda`}
                                >
                                  {isCompleted ? (
                                    <Check className="w-3.5 h-3.5 stroke-3" />
                                  ) : (
                                    step.code
                                  )}
                                </button>

                                {/* Step Code / Date */}
                                <div className="text-center mt-1">
                                  <span className={`block text-[9px] font-mono leading-none ${
                                    isCurrentToday
                                      ? 'text-amber-300 font-bold'
                                      : isCompleted
                                      ? 'text-emerald-400/90'
                                      : 'text-slate-400'
                                  }`}>
                                    {step.formattedDate}
                                  </span>
                                </div>
                              </div>

                              {/* Connecting Line */}
                              {idx < progress.steps.length - 1 && (
                                <div className="flex-1 mx-1.5 h-0.5 relative -mt-3.5">
                                  <div className="w-full h-full bg-slate-800 rounded-full" />
                                  <div
                                    className={`absolute top-0 left-0 h-full rounded-full transition-all duration-300 ${
                                      isCompleted
                                        ? 'bg-emerald-500 w-full'
                                        : isCurrentToday
                                        ? 'bg-linear-to-r from-amber-400 to-slate-800 w-1/2'
                                        : 'w-0'
                                    }`}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-800 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                    <span className="text-slate-500 text-[10px] block">MATRIZES</span>
                    <span className="font-bold text-slate-200">{lot.worked_qty}</span>
                  </div>
                  <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                    <span className="text-slate-500 text-[10px] block">PRENHAS</span>
                    <span className="font-bold text-emerald-400">{lot.pregnancies}</span>
                  </div>
                  <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                    <span className="text-slate-500 text-[10px] block">VAZIAS</span>
                    <span className="font-bold text-slate-400">{lot.empty_count}</span>
                  </div>
                </div>

                {/* Progress Bar */}
                {lot.inseminated_qty > 0 && (
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-linear-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${lot.pregnancy_rate}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Lot Detail Modal ===== */}
      {selectedLot && (
        <div className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-4xl max-h-[90vh] rounded-2xl border border-slate-700 bg-slate-900 p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Layers className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span className="text-xl font-bold text-white">Ficha do Lote:</span>
                  {editingLotId === selectedLot.id ? (
                    <div
                      className="flex items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={editingLotCode}
                        onChange={(e) => setEditingLotCode(e.target.value)}
                        onBlur={() => handleSaveLotCode(selectedLot.id, selectedLot.code)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveLotCode(selectedLot.id, selectedLot.code);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            isCancellingRef.current = true;
                            setEditingLotId(null);
                          }
                        }}
                        disabled={savingLotId === selectedLot.id}
                        autoFocus
                        className="bg-slate-950 border-2 border-emerald-500 text-white font-extrabold text-lg px-2.5 py-0.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 w-48 sm:w-60 transition-all shadow-lg"
                        placeholder="Nome do lote..."
                      />
                      {savingLotId === selectedLot.id && (
                        <RefreshCw className="w-4 h-4 animate-spin text-emerald-400 shrink-0" />
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => handleStartEditLot(e, selectedLot.id, selectedLot.code)}
                      className="group/modal-title flex items-center gap-1.5 hover:bg-slate-800/80 px-2 py-0.5 -ml-1 rounded-lg transition-colors cursor-pointer text-left"
                      title="Clique para editar o nome do lote"
                    >
                      <span className="text-xl font-bold text-white group-hover/modal-title:text-emerald-400 transition-colors">
                        {selectedLot.code}
                      </span>
                      <Pencil className="w-4 h-4 text-slate-500 group-hover/modal-title:text-emerald-400 transition-colors shrink-0" />
                    </button>
                  )}
                  {selectedLot.property_name && (
                    <span className="text-sm font-normal text-slate-400">({selectedLot.property_name})</span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedLot.protocol_name} • Responsável: {selectedLot.responsible_name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLotToDelete(selectedLot)}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 hover:border-rose-500/50 text-rose-400 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Excluir este lote"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Excluir Lote</span>
                </button>
                <button
                  onClick={() => setSelectedLotId(null)}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
              {[
                { label: 'MATRIZES NO LOTE', value: selectedLot.worked_qty, color: 'text-white' },
                { label: 'PRENHAS', value: selectedLot.pregnancies, color: 'text-emerald-400' },
                { label: 'VAZIAS', value: selectedLot.empty_count, color: 'text-slate-400' },
                { label: 'TAXA PRENHEZ', value: `${selectedLot.pregnancy_rate.toFixed(1)}%`, color: 'text-emerald-400' },
              ].map((m) => (
                <div key={m.label} className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">{m.label}</span>
                  <span className={`text-lg font-bold ${m.color}`}>{m.value}</span>
                </div>
              ))}
            </div>

            {/* Timeline dos Manejos / Stepper no Modal */}
            {(() => {
              const modalProgress = computeLotProgress(selectedLot, managementEvents, protocols);
              if (modalProgress.steps.length === 0) return null;
              return (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-300 font-semibold flex items-center gap-2">
                      <Syringe className="w-4 h-4 text-emerald-400" />
                      Cronograma e Manejo Atual do Lote
                    </span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${modalProgress.badgeStyle}`}>
                      {modalProgress.isToday && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                      )}
                      {modalProgress.badgeText}
                    </span>
                  </div>

                  <div className="pt-2 pb-1 px-2">
                    <div className="flex items-center justify-between relative">
                      {modalProgress.steps.map((step, idx) => {
                        const isCompleted = step.status === 'completed';
                        const isCurrentToday = step.status === 'today';

                        return (
                          <div key={step.code + idx} className="flex-1 flex items-center last:flex-none">
                            <div className="flex flex-col items-center group/step relative">
                              <button
                                type="button"
                                onClick={() => {
                                  router.push(`/agenda?date=${step.date}&lot=${encodeURIComponent(selectedLot.code)}`);
                                }}
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold transition-all duration-300 cursor-pointer touch-manipulation ${
                                  isCurrentToday
                                    ? 'bg-amber-400 text-slate-950 ring-4 ring-amber-400/30 shadow-lg shadow-amber-400/40 scale-110'
                                    : isCompleted
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/30'
                                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                                }`}
                                title={`Abrir etapa ${step.code} (${step.formattedDate}) na Agenda`}
                              >
                                {isCompleted ? (
                                  <Check className="w-4 h-4 stroke-3" />
                                ) : (
                                  step.code
                                )}
                              </button>

                              <div className="text-center mt-1.5">
                                <span className="block text-[11px] font-bold text-slate-200">
                                  {step.code}
                                </span>
                                <span className="block text-[10px] text-slate-400 font-mono">
                                  {step.formattedDate}
                                </span>
                              </div>
                            </div>

                            {idx < modalProgress.steps.length - 1 && (
                              <div className="flex-1 mx-2 h-0.5 relative -mt-6">
                                <div className="w-full h-full bg-slate-800 rounded-full" />
                                <div
                                  className={`absolute top-0 left-0 h-full rounded-full transition-all duration-300 ${
                                    isCompleted
                                      ? 'bg-emerald-500 w-full'
                                      : isCurrentToday
                                      ? 'bg-linear-to-r from-amber-400 to-slate-800 w-1/2'
                                      : 'w-0'
                                  }`}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Botão de Ação Rápida para o Veterinário em Campo */}
                  <button
                    type="button"
                    onClick={() => {
                      const targetDate = modalProgress.currentStepDate || selectedLot.start_date;
                      router.push(`/agenda?date=${targetDate}&lot=${encodeURIComponent(selectedLot.code)}`);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md glow-emerald transition-all cursor-pointer touch-manipulation"
                  >
                    <Calendar className="w-4 h-4" />
                    Abrir Manejo do Lote na Agenda de Campo
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              );
            })()}

            {/* Animal Table with Top Bar & Add Button */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-emerald-400" />
                  Matrizes do Lote {loadingAnimals ? '(carregando...)' : `(${lotAnimals.length})`}
                </h3>

                <button
                  onClick={openAddModal}
                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-3.5 py-1.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-md glow-emerald cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Inserir Mais Animais neste Lote
                </button>
              </div>

              {loadingAnimals ? (
                <div className="flex items-center gap-2 py-8 justify-center text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  Carregando matrizes...
                </div>
              ) : lotAnimals.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl bg-slate-950/40 space-y-3">
                  <p className="text-slate-400 text-sm">Nenhuma matriz alocada neste lote ainda.</p>
                  <button
                    onClick={openAddModal}
                    className="inline-flex items-center gap-1.5 bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 px-4 py-2 rounded-xl text-xs font-semibold hover:bg-emerald-600/30 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Adicionar Primeira Matriz
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-3">Brinco</th>
                        <th className="p-3">Categoria</th>
                        <th className="p-3">ECC IA</th>
                        <th className="p-3">ECC DG</th>
                        <th className="p-3">Touro</th>
                        <th className="p-3">Inseminador</th>
                        <th className="p-3">Diagnóstico</th>
                        <th className="p-3">Prev. Parto</th>
                        <th className="p-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 bg-slate-900/60 font-mono">
                      {lotAnimals.map((la) => (
                        <tr key={la.id} className="hover:bg-slate-800/50 transition-colors">
                          <td className="p-3 font-bold text-white font-sans">{la.animals?.tag_number}</td>
                          <td className="p-3 font-sans">{la.animals?.animal_categories?.name ?? '-'}</td>
                          <td className="p-3">{la.ecc_ia != null ? la.ecc_ia.toFixed(2) : '-'}</td>
                          <td className="p-3">{la.ecc_dg != null ? la.ecc_dg.toFixed(2) : '-'}</td>
                          <td className="p-3 text-emerald-400 font-sans font-medium">{la.bulls?.name ?? '-'}</td>
                          <td className="p-3 font-sans">{la.inseminator_name ?? '-'}</td>
                          <td className="p-3 font-sans">
                            <span
                              className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                                la.pregnancy_status === 'prenha'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : la.pregnancy_status === 'vazia'
                                  ? 'bg-slate-800 text-slate-400'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}
                            >
                              {la.pregnancy_status === 'prenha'
                                ? 'Prenha'
                                : la.pregnancy_status === 'vazia'
                                ? 'Vazia'
                                : 'Pendente'}
                            </span>
                          </td>
                          <td className="p-3 text-emerald-400">{la.expected_parturition_date ?? '-'}</td>
                          <td className="p-3 text-center">
                            <button
                              title="Remover matriz deste lote"
                              disabled={deletingAnimalId === la.id}
                              onClick={() => handleRemoveAnimal(la.id, la.animals?.tag_number || '')}
                              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                            >
                              {deletingAnimalId === la.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: Adicionar Matrizes ao Lote ===== */}
      {showAddModal && selectedLot && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-2xl max-h-[85vh] rounded-2xl border border-emerald-500/30 bg-slate-900 p-6 flex flex-col space-y-5 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Tag className="w-5 h-5 text-emerald-400" />
                  Adicionar Matrizes ao Lote: <span className="text-emerald-400 font-mono">{selectedLot.code}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Vincule fêmeas já cadastradas ou insira novas matrizes diretamente.
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switch Tabs */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => { setAddMode('existing'); setAddModalError(null); }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  addMode === 'existing'
                    ? 'bg-emerald-600 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Search className="w-3.5 h-3.5" /> Selecionar Matrizes Cadastradas
              </button>
              <button
                type="button"
                onClick={() => { setAddMode('new'); setAddModalError(null); }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  addMode === 'new'
                    ? 'bg-emerald-600 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Plus className="w-3.5 h-3.5" /> Cadastrar Nova Matriz
              </button>
            </div>

            {/* Modal Error Banner */}
            {addModalError && (
              <div className="bg-rose-500/15 border border-rose-500/40 rounded-xl p-3.5 flex items-start gap-3 text-xs text-rose-200 animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <strong className="block text-rose-300 font-semibold mb-0.5">Aviso de Cadastro:</strong>
                  <span>{addModalError}</span>
                </div>
              </div>
            )}

            {/* Tab 1: Existing Animals */}
            {addMode === 'existing' && (
              <div className="flex-1 overflow-hidden flex flex-col space-y-4">
                {/* Search Bar + Select All */}
                <div className="flex items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Filtrar por número do brinco..."
                      value={animalSearch}
                      onChange={(e) => setAnimalSearch(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-white text-xs pl-9 pr-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {availableAnimals.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleSelectAllAvailable}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-800 shrink-0 cursor-pointer"
                    >
                      {selectedAnimalIds.length === availableAnimals.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                    </button>
                  )}
                </div>

                {/* Animals List Container */}
                <div className="flex-1 overflow-y-auto max-h-64 border border-slate-800 rounded-xl bg-slate-950/60 divide-y divide-slate-800/60 p-1">
                  {loadingAvailable ? (
                    <div className="py-12 flex items-center justify-center text-xs text-slate-400 gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                      Buscando matrizes disponíveis...
                    </div>
                  ) : availableAnimals.length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-400 space-y-2">
                      <p>Nenhuma matriz disponível encontrada fora deste lote.</p>
                      <button
                        type="button"
                        onClick={() => setAddMode('new')}
                        className="text-emerald-400 underline hover:text-emerald-300"
                      >
                        Cadastrar uma nova matriz agora
                      </button>
                    </div>
                  ) : (
                    availableAnimals.map((animal) => {
                      const isSelected = selectedAnimalIds.includes(animal.id);
                      return (
                        <div
                          key={animal.id}
                          onClick={() => toggleSelectAnimal(animal.id)}
                          className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-emerald-950/40 border border-emerald-500/30'
                              : 'hover:bg-slate-800/50'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <div
                              className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                                isSelected
                                  ? 'bg-emerald-500 border-emerald-500 text-slate-950 font-bold'
                                  : 'border-slate-700 bg-slate-900'
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-3" />}
                            </div>

                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-sm text-white">Brinco {animal.tag_number}</span>
                                {animal.rfid_number && (
                                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                                    RFID: {animal.rfid_number}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400">
                                {animal.animal_categories?.name ?? 'Categoria n/d'} • {animal.breeds?.name ?? 'Raça n/d'} • {animal.properties?.name ?? animal.farms?.name ?? '-'}
                              </p>
                            </div>
                          </div>

                          <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-slate-900 border border-slate-800 text-slate-300">
                            {animal.reproductive_status}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer Action */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="text-xs text-slate-400">
                    <strong className="text-emerald-400">{selectedAnimalIds.length}</strong> matriz(es) selecionada(s)
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 rounded-xl border border-slate-700 text-xs text-slate-400 hover:text-white transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={selectedAnimalIds.length === 0 || submittingAdd}
                      onClick={handleLinkExistingAnimals}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-md glow-emerald cursor-pointer"
                    >
                      {submittingAdd ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Vinculando...
                        </>
                      ) : (
                        <>
                          Vincular Selecionadas ao Lote <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Quick Create New Animal and Link */}
            {addMode === 'new' && (
              <form onSubmit={handleCreateAndAddQuick} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      Número do Brinco *
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="Ex: 1045, A201"
                      value={quickAnimal.tag_number}
                      onChange={(e) => setQuickAnimal((q) => ({ ...q, tag_number: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      RFID / Chip Eletrônico
                    </label>
                    <input
                      type="text"
                      placeholder="Opcional"
                      value={quickAnimal.rfid_number}
                      onChange={(e) => setQuickAnimal((q) => ({ ...q, rfid_number: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      Categoria do Animal
                    </label>
                    <select
                      value={quickAnimal.category_id}
                      onChange={(e) => setQuickAnimal((q) => ({ ...q, category_id: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Selecione a categoria...</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      Raça Predominante
                    </label>
                    <select
                      value={quickAnimal.breed_id}
                      onChange={(e) => setQuickAnimal((q) => ({ ...q, breed_id: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Selecione a raça...</option>
                      {breeds.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                  <p className="flex items-center gap-1.5 font-semibold text-slate-300">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    Vinculação Direta ao Lote
                  </p>
                  <p>
                    A nova matriz será cadastrada no banco de dados e adicionada automaticamente ao lote{' '}
                    <strong className="text-white font-mono">{selectedLot.code}</strong> (
                    {selectedLot.property_name}).
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-700 text-xs text-slate-400 hover:text-white transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submittingAdd || !quickAnimal.tag_number.trim()}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-md glow-emerald cursor-pointer"
                  >
                    {submittingAdd ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cadastrando...
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" /> Cadastrar e Adicionar ao Lote
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ===== New Lot Modal ===== */}
      {showNewLot && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-emerald-400" /> Novo Lote de IATF
                </h2>
                {activeFarm && (
                  <p className="text-xs text-emerald-400 font-medium mt-0.5">
                    Vinculado à fazenda: <strong>{activeFarm.name}</strong>
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowNewLot(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLot} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Código do Lote *</label>
                  <input
                    required
                    type="text"
                    placeholder="Ex: LOTE 08"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Data D0 *</label>
                  <input
                    required
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Estação de Monta / Reprodutiva *
                </label>
                <select
                  required
                  value={form.season_id}
                  onChange={(e) => setForm((f) => ({ ...f, season_id: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione a estação...</option>
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.status === 'active' ? '(Ativa Vigente)' : '(Encerrada)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Retiro / Propriedade *</label>
                <select
                  required
                  value={form.property_id}
                  onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione o retiro...</option>
                  {properties
                    .filter((p) => !activeFarmId || p.farm_id === activeFarmId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.code ? `(${p.code})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Protocolo Reprodutivo *</label>
                <select
                  required
                  value={form.protocol_id}
                  onChange={(e) => setForm((f) => ({ ...f, protocol_id: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione o protocolo...</option>
                  {protocols.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-400">Responsável Técnico (RT)</label>
                  <span className="text-[10px] text-emerald-400 font-medium">Médico Veterinário</span>
                </div>
                <select
                  value={form.responsible_name}
                  onChange={(e) => setForm((f) => ({ ...f, responsible_name: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione o Responsável Técnico...</option>
                  {veterinarians.map((vet) => {
                    const vetLabel = vet.crmv ? `${vet.name} (${vet.crmv})` : vet.name;
                    return (
                      <option key={vet.id} value={vetLabel}>
                        {vet.name} {vet.crmv ? `• CRMV: ${vet.crmv}` : ''} {vet.is_default ? '⭐ (RT Padrão)' : ''}
                      </option>
                    );
                  })}
                  {form.responsible_name && !veterinarians.some((v) => (v.crmv ? `${v.name} (${v.crmv})` : v.name) === form.responsible_name) && (
                    <option value={form.responsible_name}>{form.responsible_name}</option>
                  )}
                </select>
              </div>

              {form.start_date && form.protocol_id && protocols.length > 0 && (() => {
                const proto = protocols.find((p) => p.id === form.protocol_id);
                const steps = proto?.protocol_steps ?? [];
                const d0 = new Date(form.start_date);
                const addDays = (n: number) => {
                  const r = new Date(d0);
                  r.setDate(r.getDate() + n);
                  return r.toLocaleDateString('pt-BR');
                };
                const ia = steps.find((s) => s.code === 'IA');
                const dg = steps.find((s) => s.code === 'DG');
                return (
                  <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-3 text-xs text-slate-300 space-y-1">
                    <p className="font-semibold text-emerald-400 text-[11px] uppercase tracking-wider">
                      Datas Calculadas Automaticamente (RN-04)
                    </p>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <div className="text-center">
                        <span className="text-slate-500 block">D0</span>
                        <strong>{new Date(form.start_date).toLocaleDateString('pt-BR')}</strong>
                      </div>
                      {ia && (
                        <div className="text-center">
                          <span className="text-slate-500 block">IA</span>
                          <strong className="text-emerald-400">{addDays(ia.day_offset)}</strong>
                        </div>
                      )}
                      {dg && (
                        <div className="text-center">
                          <span className="text-slate-500 block">DG</span>
                          <strong className="text-blue-400">{addDays(dg.day_offset)}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Salvando...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" /> Criar Lote & Gerar Agenda
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewLot(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ===== Modal: Confirmação de Exclusão de Lote ===== */}
      {lotToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">Excluir Lote IATF</h3>
                <p className="text-xs text-slate-400">
                  Tem certeza que deseja excluir o lote <strong className="text-white font-mono">{lotToDelete.code}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-slate-950/80 rounded-xl p-3.5 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Fazenda / Retiro:</span>
                <span className="font-semibold text-slate-200">{lotToDelete.property_name || lotToDelete.farm_name || '-'}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Protocolo:</span>
                <span className="font-semibold text-slate-200">{lotToDelete.protocol_name || '-'}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Matrizes vinculadas:</span>
                <span className="font-bold text-emerald-400">{lotToDelete.worked_qty}</span>
              </div>
            </div>

            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-300 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Esta ação cancelará e removerá permanentemente os manejos agendados deste lote na agenda. As matrizes cadastradas não serão deletadas do sistema, apenas desvinculadas deste lote.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeletingLot}
                onClick={() => setLotToDelete(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingLot}
                onClick={handleConfirmDeleteLot}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeletingLot ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Excluindo Lote...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Confirmar Exclusão
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

