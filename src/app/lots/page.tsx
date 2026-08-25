'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getLots,
  getLotAnimals,
  getProtocols,
  getProperties,
  createLot,
  addAnimalsToLot,
  removeAnimalFromLot,
  getAvailableAnimalsForLot,
  createAndAddAnimalToLot,
  getBreeds,
  getAnimalCategories,
  getFarms,
  type LotStat,
  type LotAnimal,
  type Protocol,
  type Property,
  type Breed,
  type AnimalCategory,
  type Farm,
  type Animal,
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
} from 'lucide-react';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  concluido: { label: 'Concluído', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  em_andamento: { label: 'Em Andamento', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  planejado: { label: 'Planejado', color: 'text-slate-400 bg-slate-800 border-slate-700' },
};

export default function LotsPage() {
  const [lots, setLots] = useState<LotStat[]>([]);
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
  const [saving, setSaving] = useState(false);

  // New lot form state
  const [form, setForm] = useState({
    code: '',
    property_id: '',
    protocol_id: '',
    start_date: '',
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

  // Feedback Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4500);
  };

  const loadLots = useCallback(async () => {
    setLoading(true);
    const data = await getLots();
    setLots(data);
    setLoading(false);
  }, []);

  const loadAuxData = useCallback(async () => {
    const [p, pr, f, b, c] = await Promise.all([
      getProtocols(),
      getProperties(),
      getFarms(),
      getBreeds(),
      getAnimalCategories(),
    ]);
    setProtocols(p);
    setProperties(pr);
    setFarms(f);
    setBreeds(b);
    setCategories(c);
  }, []);

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
    const id = await createLot(form);
    setSaving(false);
    if (id) {
      setShowNewLot(false);
      setForm({ code: '', property_id: '', protocol_id: '', start_date: '', responsible_name: 'MV. DR. SAMOEL DUARTE' });
      await loadLots();
      showToast(`Lote ${form.code} criado com sucesso! Agenda gerada.`);
    }
  }

  // Load available animals when opening the Add Modal
  const loadAvailableAnimals = useCallback(async (lotId: string, search = '') => {
    setLoadingAvailable(true);
    const data = await getAvailableAnimalsForLot(lotId, search);
    setAvailableAnimals(data);
    setLoadingAvailable(false);
  }, []);

  const openAddModal = () => {
    if (!selectedLotId) return;
    setSelectedAnimalIds([]);
    setAnimalSearch('');
    setAddMode('existing');
    setQuickAnimal({
      tag_number: '',
      rfid_number: '',
      breed_id: breeds[0]?.id || '',
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
    setSubmittingAdd(true);
    const res = await addAnimalsToLot(selectedLotId, selectedAnimalIds);
    setSubmittingAdd(false);

    if (res.success) {
      showToast(`${selectedAnimalIds.length} matriz(es) vinculada(s) ao lote com sucesso!`);
      setShowAddModal(false);
      setSelectedAnimalIds([]);
      // Reload lot animals and metrics
      await Promise.all([handleSelectLot(selectedLotId), loadLots()]);
    } else {
      showToast(res.error || 'Erro ao vincular matrizes.', 'error');
    }
  };

  const handleCreateAndAddQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLotId || !quickAnimal.tag_number.trim()) {
      showToast('Informe o número do brinco.', 'error');
      return;
    }

    const currentLot = lots.find((l) => l.id === selectedLotId);
    const farmId = farms[0]?.id;
    if (!farmId) {
      showToast('Nenhuma fazenda cadastrada para vincular o animal.', 'error');
      return;
    }

    // Match property from lot
    const matchedProp = properties.find((p) => p.name === currentLot?.property_name);

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
      showToast(`Matriz Brinco ${quickAnimal.tag_number} cadastrada e adicionada ao lote!`);
      setQuickAnimal({
        tag_number: '',
        rfid_number: '',
        breed_id: breeds[0]?.id || '',
        category_id: categories[0]?.id || '',
        reproductive_status: 'vazia',
      });
      setShowAddModal(false);
      await Promise.all([handleSelectLot(selectedLotId), loadLots()]);
    } else {
      showToast(res.error || 'Erro ao cadastrar matriz.', 'error');
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

  const filteredLots = lots.filter(
    (l) =>
      l.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.property_name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.protocol_name ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedLot = lots.find((l) => l.id === selectedLotId);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border shadow-xl flex items-center gap-2 text-sm transition-all duration-300 ${
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
            {loading ? 'Carregando...' : `${lots.length} lotes cadastrados na estação 2025/2026`}
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
            onClick={() => setShowNewLot(true)}
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
            return (
              <div
                key={lot.id}
                onClick={() => handleSelectLot(lot.id)}
                className="glass-card p-5 rounded-2xl border border-slate-800 hover:border-emerald-500/40 transition-all cursor-pointer group space-y-4 relative overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-extrabold text-lg text-white group-hover:text-emerald-400 transition-colors">
                      {lot.code}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      {lot.property_name ?? lot.farm_name}
                    </span>
                  </div>
                  <span className={`text-xs font-semibold border px-2.5 py-1 rounded-lg flex items-center gap-1 ${statusInfo.color}`}>
                    {lot.pregnancy_rate > 0 ? (
                      <><CheckCircle2 className="w-3 h-3" /> {lot.pregnancy_rate.toFixed(1)}%</>
                    ) : (
                      <><Clock className="w-3 h-3" /> {statusInfo.label}</>
                    )}
                  </span>
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
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-400" />
                  Ficha do Lote: {selectedLot.code} ({selectedLot.property_name})
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedLot.protocol_name} • Responsável: {selectedLot.responsible_name}
                </p>
              </div>
              <button
                onClick={() => setSelectedLotId(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
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
                onClick={() => setAddMode('existing')}
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
                onClick={() => setAddMode('new')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  addMode === 'new'
                    ? 'bg-emerald-600 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Plus className="w-3.5 h-3.5" /> Cadastrar Nova Matriz
              </button>
            </div>

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
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
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
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" /> Novo Lote de IATF
              </h2>
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
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Retiro / Propriedade *</label>
                <select
                  required
                  value={form.property_id}
                  onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione o retiro...</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
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
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Responsável Técnico</label>
                <input
                  type="text"
                  value={form.responsible_name}
                  onChange={(e) => setForm((f) => ({ ...f, responsible_name: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                />
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
    </div>
  );
}
