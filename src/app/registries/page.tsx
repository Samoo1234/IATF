'use client';

import { useEffect, useState, useCallback } from 'react';
import { 
  getBulls, createBull, 
  getFarms, createFarm, createProperty, 
  getBreeds, createBreed, 
  getAnimalCategories, createAnimalCategory,
  getAnimals, createAnimal,
  createReproductiveSeason, updateReproductiveSeason, deleteReproductiveSeason,
  getVeterinarians, createVeterinarian, updateVeterinarian, deleteVeterinarian, setDefaultVeterinarian,
  type Bull, type Farm, type Breed, type AnimalCategory, type Animal, type ReproductiveSeason, type Veterinarian
} from '@/lib/db';
import { 
  FolderTree, Plus, RefreshCw, X,
  Dna, MapPin, Tag, Building2, Award, Syringe, CheckCircle2, AlertCircle,
  Calendar, Edit2, Trash2, Star,
  GraduationCap, Phone, Mail
} from 'lucide-react';
import Link from 'next/link';
import { useActiveFarm } from '@/context/FarmContext';
import { useActiveSeason } from '@/context/SeasonContext';

type TabType = 'matrizes' | 'bulls' | 'farms' | 'breeds' | 'seasons' | 'veterinarians';

export default function RegistriesPage() {
  const { activeFarmId, activeFarm } = useActiveFarm();
  const { seasons, refreshSeasons, setAsGlobalActiveSeason } = useActiveSeason();
  const [activeTab, setActiveTab] = useState<TabType>('matrizes');
  const [loading, setLoading] = useState(true);

  // Season states
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [editingSeasonId, setEditingSeasonId] = useState<string | null>(null);
  const [seasonForm, setSeasonForm] = useState({
    name: '',
    start_date: '',
    end_date: '',
    status: 'active' as 'active' | 'closed',
  });

  // Veterinarian states
  const [veterinarians, setVeterinarians] = useState<Veterinarian[]>([]);
  const [showVetModal, setShowVetModal] = useState(false);
  const [editingVetId, setEditingVetId] = useState<string | null>(null);
  const [vetForm, setVetForm] = useState({
    name: '',
    crmv: '',
    phone: '',
    email: '',
    is_default: false,
  });

  // Data states
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [bulls, setBulls] = useState<Bull[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [categories, setCategories] = useState<AnimalCategory[]>([]);

  // Modal states
  const [showAnimalModal, setShowAnimalModal] = useState(false);
  const [showBullModal, setShowBullModal] = useState(false);
  const [showFarmModal, setShowFarmModal] = useState(false);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [animalForm, setAnimalForm] = useState({
    tag_number: '',
    rfid_number: '',
    farm_id: '',
    property_id: '',
    breed_id: '',
    category_id: '',
    reproductive_status: 'vazia',
    birth_date: '',
  });
  const [modalAnimalError, setModalAnimalError] = useState<string | null>(null);

  const [bullForm, setBullForm] = useState({
    name: '',
    code: '',
    owner_central: '',
    registration_number: '',
    breed_id: '',
  });

  const [farmForm, setFarmForm] = useState({
    name: '',
    owner_name: '',
    technical_responsible: 'MV. DR. SAMOEL DUARTE',
    city: '',
    state: 'MT',
  });

  const [propertyForm, setPropertyForm] = useState({
    farm_id: '',
    name: '',
    code: '',
  });

  const [newBreedName, setNewBreedName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');

  const loadAllData = useCallback(async () => {
    setLoading(true);
    const [a, b, f, br, c, v] = await Promise.all([
      getAnimals(100, false, activeFarmId || undefined),
      getBulls(),
      getFarms(),
      getBreeds(),
      getAnimalCategories(),
      getVeterinarians(),
    ]);
    setAnimals(a);
    setBulls(b);
    setFarms(f);
    setBreeds(br);
    setCategories(c);
    setVeterinarians(v);

    const defaultVet = v.find((vet) => vet.is_default);
    if (defaultVet && !farmForm.technical_responsible) {
      setFarmForm((prev) => ({
        ...prev,
        technical_responsible: defaultVet.crmv ? `${defaultVet.name} (${defaultVet.crmv})` : defaultVet.name,
      }));
    }

    const farmToUse = activeFarmId || f[0]?.id || '';
    const activeFarmObj = f.find(farm => farm.id === farmToUse);
    setAnimalForm((prev) => ({
      ...prev,
      farm_id: farmToUse,
      property_id: activeFarmObj?.properties?.[0]?.id || '',
    }));
    setPropertyForm((prev) => ({
      ...prev,
      farm_id: farmToUse,
    }));
    setLoading(false);
  }, [activeFarmId]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Handlers
  const handleCreateAnimal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!animalForm.tag_number.trim() || !animalForm.farm_id) {
      setFeedbackMsg({ type: 'error', text: 'Preencha o número do brinco e selecione a fazenda.' });
      return;
    }

    setSaving(true);
    const res = await createAnimal({
      tag_number: animalForm.tag_number,
      rfid_number: animalForm.rfid_number || undefined,
      farm_id: animalForm.farm_id,
      property_id: animalForm.property_id || undefined,
      breed_id: animalForm.breed_id || undefined,
      category_id: animalForm.category_id || undefined,
      reproductive_status: animalForm.reproductive_status,
      birth_date: animalForm.birth_date || undefined,
    });
    setSaving(false);

    if (res.success) {
      setModalAnimalError(null);
      setFeedbackMsg({ type: 'success', text: `Matriz Brinco ${animalForm.tag_number} cadastrada com sucesso!` });
      setShowAnimalModal(false);
      const farmToUse = activeFarmId || farms[0]?.id || '';
      const activeFarmObj = farms.find(farm => farm.id === farmToUse);
      setAnimalForm({
        tag_number: '',
        rfid_number: '',
        farm_id: farmToUse,
        property_id: activeFarmObj?.properties?.[0]?.id || '',
        breed_id: '',
        category_id: '',
        reproductive_status: 'vazia',
        birth_date: '',
      });
      await loadAllData();
      setTimeout(() => setFeedbackMsg(null), 4000);
    } else {
      const errorText = res.error || 'Erro ao cadastrar matriz.';
      setModalAnimalError(errorText);
      setFeedbackMsg({ type: 'error', text: errorText });
    }
  };

  const handleCreateBull = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bullForm.name) return;
    setSaving(true);
    const ok = await createBull({
      name: bullForm.name,
      code: bullForm.code || undefined,
      owner_central: bullForm.owner_central || undefined,
      registration_number: bullForm.registration_number || undefined,
      breed_id: bullForm.breed_id || undefined,
    });
    setSaving(false);
    if (ok) {
      setShowBullModal(false);
      setBullForm({ name: '', code: '', owner_central: '', registration_number: '', breed_id: '' });
      await loadAllData();
    }
  };

  const handleCreateFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmForm.name) return;
    setSaving(true);
    const newId = await createFarm({
      name: farmForm.name,
      owner_name: farmForm.owner_name || undefined,
      technical_responsible: farmForm.technical_responsible || undefined,
      city: farmForm.city || undefined,
      state: farmForm.state || undefined,
    });
    setSaving(false);
    if (newId) {
      setShowFarmModal(false);
      setFarmForm({ name: '', owner_name: '', technical_responsible: 'MV. DR. SAMOEL DUARTE', city: '', state: 'MT' });
      await loadAllData();
    }
  };

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyForm.name || !propertyForm.farm_id) return;
    setSaving(true);
    const ok = await createProperty({
      farm_id: propertyForm.farm_id,
      name: propertyForm.name,
      code: propertyForm.code || undefined,
    });
    setSaving(false);
    if (ok) {
      setShowPropertyModal(false);
      setPropertyForm({ farm_id: '', name: '', code: '' });
      await loadAllData();
    }
  };

  const handleCreateBreed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBreedName) return;
    const ok = await createBreed(newBreedName);
    if (ok) {
      setNewBreedName('');
      await loadAllData();
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName) return;
    const ok = await createAnimalCategory(newCategoryName);
    if (ok) {
      setNewCategoryName('');
      await loadAllData();
    }
  };

  const handleSaveSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seasonForm.name.trim() || !seasonForm.start_date || !seasonForm.end_date) {
      setFeedbackMsg({ type: 'error', text: 'Preencha o nome da estação e as datas de início e término.' });
      return;
    }

    setSaving(true);
    let success = false;

    if (editingSeasonId) {
      success = await updateReproductiveSeason(editingSeasonId, {
        name: seasonForm.name,
        start_date: seasonForm.start_date,
        end_date: seasonForm.end_date,
        status: seasonForm.status,
      });
    } else {
      const created = await createReproductiveSeason({
        name: seasonForm.name,
        start_date: seasonForm.start_date,
        end_date: seasonForm.end_date,
        status: seasonForm.status,
      });
      success = !!created;
    }
    setSaving(false);

    if (success) {
      setFeedbackMsg({
        type: 'success',
        text: editingSeasonId ? 'Estação reprodutiva atualizada com sucesso!' : 'Estação reprodutiva cadastrada com sucesso!',
      });
      setShowSeasonModal(false);
      setEditingSeasonId(null);
      setSeasonForm({ name: '', start_date: '', end_date: '', status: 'active' });
      await refreshSeasons();
      setTimeout(() => setFeedbackMsg(null), 4000);
    } else {
      setFeedbackMsg({ type: 'error', text: 'Erro ao salvar estação reprodutiva.' });
    }
  };

  const handleSetActiveSeasonClick = async (id: string, name: string) => {
    setSaving(true);
    const ok = await setAsGlobalActiveSeason(id);
    setSaving(false);
    if (ok) {
      setFeedbackMsg({ type: 'success', text: `A estação "${name}" agora é a Estação Ativa do sistema!` });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } else {
      setFeedbackMsg({ type: 'error', text: 'Erro ao definir estação ativa.' });
    }
  };

  const handleDeleteSeason = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente excluir a estação "${name}"?`)) return;

    setSaving(true);
    const res = await deleteReproductiveSeason(id);
    setSaving(false);

    if (res.success) {
      setFeedbackMsg({ type: 'success', text: `Estação "${name}" excluída com sucesso!` });
      await refreshSeasons();
      setTimeout(() => setFeedbackMsg(null), 4000);
    } else {
      setFeedbackMsg({ type: 'error', text: res.error || 'Erro ao excluir estação.' });
    }
  };

  const handleOpenEditSeason = (s: ReproductiveSeason) => {
    setEditingSeasonId(s.id);
    setSeasonForm({
      name: s.name,
      start_date: s.start_date,
      end_date: s.end_date,
      status: s.status,
    });
    setShowSeasonModal(true);
  };

  const handleSaveVeterinarian = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vetForm.name.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Preencha o nome do médico veterinário.' });
      return;
    }

    setSaving(true);
    let success = false;

    if (editingVetId) {
      success = await updateVeterinarian(editingVetId, {
        name: vetForm.name,
        crmv: vetForm.crmv,
        phone: vetForm.phone,
        email: vetForm.email,
        is_default: vetForm.is_default,
      });
    } else {
      const created = await createVeterinarian({
        name: vetForm.name,
        crmv: vetForm.crmv,
        phone: vetForm.phone,
        email: vetForm.email,
        is_default: vetForm.is_default,
      });
      success = !!created;
    }
    setSaving(false);

    if (success) {
      setFeedbackMsg({
        type: 'success',
        text: editingVetId ? 'Médico veterinário atualizado com sucesso!' : 'Médico veterinário cadastrado com sucesso!',
      });
      setShowVetModal(false);
      setEditingVetId(null);
      setVetForm({ name: '', crmv: '', phone: '', email: '', is_default: false });
      const v = await getVeterinarians(true);
      setVeterinarians(v);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } else {
      setFeedbackMsg({ type: 'error', text: 'Erro ao salvar médico veterinário.' });
    }
  };

  const handleSetDefaultVet = async (id: string, name: string) => {
    setSaving(true);
    const ok = await setDefaultVeterinarian(id);
    setSaving(false);
    if (ok) {
      setFeedbackMsg({ type: 'success', text: `Dr(a). ${name} agora é o(a) Responsável Técnico(a) Padrão!` });
      const v = await getVeterinarians(true);
      setVeterinarians(v);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } else {
      setFeedbackMsg({ type: 'error', text: 'Erro ao definir RT padrão.' });
    }
  };

  const handleDeleteVet = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente excluir o cadastro do(a) Dr(a). "${name}"?`)) return;

    setSaving(true);
    const res = await deleteVeterinarian(id);
    setSaving(false);

    if (res.success) {
      setFeedbackMsg({ type: 'success', text: `Veterinário "${name}" excluído com sucesso!` });
      const v = await getVeterinarians(true);
      setVeterinarians(v);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } else {
      setFeedbackMsg({ type: 'error', text: res.error || 'Erro ao excluir veterinário.' });
    }
  };

  const handleOpenEditVet = (v: Veterinarian) => {
    setEditingVetId(v.id);
    setVetForm({
      name: v.name,
      crmv: v.crmv || '',
      phone: v.phone || '',
      email: v.email || '',
      is_default: !!v.is_default,
    });
    setShowVetModal(true);
  };

  const selectedFarmObj = farms.find((f) => f.id === animalForm.farm_id);
  const availableProperties = selectedFarmObj?.properties || [];

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedbackMsg && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedbackMsg.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span className="text-sm font-medium">{feedbackMsg.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FolderTree className="w-6 h-6 text-emerald-400" />
            Cadastros Gerais do Sistema
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Gerenciamento de matrizes (vacas), touros reprodutores, fazendas, retiros, raças e categorias bovinas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'matrizes' && (
            <button
              onClick={() => setShowAnimalModal(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" /> Nova Matriz (Vaca)
            </button>
          )}
          {activeTab === 'bulls' && (
            <button
              onClick={() => setShowBullModal(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" /> Novo Touro
            </button>
          )}
          {activeTab === 'farms' && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowFarmModal(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
              >
                <Plus className="w-4 h-4" /> Nova Fazenda
              </button>
              <button
                onClick={() => {
                  if (farms.length > 0) {
                    setPropertyForm((f) => ({ ...f, farm_id: farms[0].id }));
                  }
                  setShowPropertyModal(true);
                }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium px-4 py-2 rounded-xl border border-slate-700 text-xs sm:text-sm transition-all flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Novo Retiro
              </button>
            </div>
          )}
          {activeTab === 'seasons' && (
            <button
              onClick={() => {
                setEditingSeasonId(null);
                setSeasonForm({
                  name: '',
                  start_date: new Date().toISOString().split('T')[0],
                  end_date: '',
                  status: 'active',
                });
                setShowSeasonModal(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" /> Nova Estação de Monta
            </button>
          )}
          {activeTab === 'veterinarians' && (
            <button
              onClick={() => {
                setEditingVetId(null);
                setVetForm({
                  name: '',
                  crmv: '',
                  phone: '',
                  email: '',
                  is_default: veterinarians.length === 0,
                });
                setShowVetModal(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" /> Novo Veterinário (RT)
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('matrizes')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'matrizes'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Syringe className="w-4 h-4" /> Matrizes & Fêmeas ({animals.length})
        </button>
        <button
          onClick={() => setActiveTab('bulls')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'bulls'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Award className="w-4 h-4" /> Touros & Centrais ({bulls.length})
        </button>
        <button
          onClick={() => setActiveTab('farms')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'farms'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" /> Fazendas & Retiros ({farms.length})
        </button>
        <button
          onClick={() => setActiveTab('breeds')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'breeds'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Dna className="w-4 h-4" /> Raças & Categorias ({breeds.length + categories.length})
        </button>
        <button
          onClick={() => setActiveTab('seasons')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'seasons'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" /> Estações de Monta ({seasons.length})
        </button>
        <button
          onClick={() => setActiveTab('veterinarians')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'veterinarians'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <GraduationCap className="w-4 h-4" /> Médicos Veterinários ({veterinarians.length})
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
          Carregando cadastros do Supabase...
        </div>
      ) : activeTab === 'matrizes' ? (
        /* ===== TAB: MATRIZES ===== */
        <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Syringe className="w-4 h-4 text-emerald-400" /> Rebanho de Fêmeas & Matrizes Cadastradas
            </h2>
            <Link
              href="/animals"
              className="text-xs text-emerald-400 hover:underline font-semibold"
            >
              Abrir busca com ficha reprodutiva detalhada →
            </Link>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Brinco</th>
                  <th className="p-3">RFID / Eletrônico</th>
                  <th className="p-3">Fazenda</th>
                  <th className="p-3">Retiro</th>
                  <th className="p-3">Raça</th>
                  <th className="p-3">Categoria</th>
                  <th className="p-3">Status Reprodutivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
                {animals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      Nenhuma matriz cadastrada. Clique em &quot;Nova Matriz (Vaca)&quot; para começar.
                    </td>
                  </tr>
                ) : (
                  animals.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-3 font-bold text-white">
                        <Link href={`/animals/${a.id}`} className="hover:text-emerald-400 hover:underline">
                          {a.tag_number}
                        </Link>
                      </td>
                      <td className="p-3 font-mono text-slate-400">{a.rfid_number || '-'}</td>
                      <td className="p-3 text-slate-300">{a.farms?.name || '-'}</td>
                      <td className="p-3 text-slate-400">{a.properties?.name || '-'}</td>
                      <td className="p-3 text-slate-400">{a.breeds?.name || '-'}</td>
                      <td className="p-3 text-slate-400">{a.animal_categories?.name || '-'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          a.reproductive_status === 'prenha'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : a.reproductive_status === 'inseminada'
                            ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {a.reproductive_status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'bulls' ? (
        /* ===== TAB: TOUROS ===== */
        <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-400" /> Reprodutores & Touros Cadastrados
          </h2>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Nome do Touro</th>
                  <th className="p-3">Código</th>
                  <th className="p-3">Central de Inseminação</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
                {bulls.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500">
                      Nenhum touro cadastrado no banco de dados.
                    </td>
                  </tr>
                ) : (
                  bulls.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-3 font-bold text-white">{b.name}</td>
                      <td className="p-3 font-mono text-emerald-400">{b.code || '-'}</td>
                      <td className="p-3 text-slate-400">{b.owner_central || '-'}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'farms' ? (
        /* ===== TAB: FAZENDAS & RETIROS ===== */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {farms.map((f) => (
              <div key={f.id} className="glass-card p-5 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-emerald-400" /> {f.name}
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700">
                    {f.properties?.length || 0} retiros
                  </span>
                </div>

                <div className="text-xs text-slate-400 space-y-1 bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                  <p><strong>Proprietário:</strong> {f.owner_name || '-'}</p>
                  <p><strong>Responsável Técnico:</strong> {f.technical_responsible || '-'}</p>
                  <p><strong>Localização:</strong> {f.city ? `${f.city}/${f.state}` : '-'}</p>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" /> Retiros / Piquetes Cadastrados
                  </h4>
                  <div className="space-y-1.5">
                    {!f.properties || f.properties.length === 0 ? (
                      <p className="text-slate-500 text-xs italic">Nenhum retiro cadastrado para esta fazenda.</p>
                    ) : (
                      f.properties.map((p) => (
                        <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                          <span className="font-medium text-slate-200">{p.name}</span>
                          {p.code && <span className="font-mono text-emerald-400 text-[10px]">{p.code}</span>}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === 'breeds' ? (
        /* ===== TAB: RAÇAS & CATEGORIAS ===== */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Breeds Card */}
          <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Dna className="w-5 h-5 text-emerald-400" /> Raças Bovinas Cadastradas
            </h3>

            <form onSubmit={handleCreateBreed} className="flex gap-2">
              <input
                type="text"
                placeholder="Ex: SENEPOL, BRANGUS"
                value={newBreedName}
                onChange={(e) => setNewBreedName(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </form>

            <div className="flex flex-wrap gap-2 pt-2">
              {breeds.map((b) => (
                <span key={b.id} className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200">
                  {b.name}
                </span>
              ))}
            </div>
          </div>

          {/* Categories Card */}
          <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Tag className="w-5 h-5 text-emerald-400" /> Categorias de Fêmeas
            </h3>

            <form onSubmit={handleCreateCategory} className="flex gap-2">
              <input
                type="text"
                placeholder="Ex: NOVILHA PRECOCE"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </form>

            <div className="flex flex-wrap gap-2 pt-2">
              {categories.map((c) => (
                <span key={c.id} className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200">
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : activeTab === 'seasons' ? (
        /* ===== TAB: ESTAÇÕES DE MONTA ===== */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" /> Ciclos Reprodutivos & Estações de Monta
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Defina manualmente qual estação está ativa para direcionar novos lotes, métricas do dashboard e relatórios oficiais.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingSeasonId(null);
                setSeasonForm({
                  name: '',
                  start_date: new Date().toISOString().split('T')[0],
                  end_date: '',
                  status: 'active',
                });
                setShowSeasonModal(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/20 shrink-0"
            >
              <Plus className="w-4 h-4" /> Nova Estação
            </button>
          </div>

          {seasons.length === 0 ? (
            <div className="glass-card p-12 text-center rounded-2xl border border-slate-800 space-y-3">
              <Calendar className="w-12 h-12 text-slate-600 mx-auto" />
              <p className="text-slate-400 text-sm">Nenhuma estação reprodutiva cadastrada no sistema.</p>
              <button
                onClick={() => {
                  setEditingSeasonId(null);
                  setSeasonForm({
                    name: 'Estação 2025/2026',
                    start_date: '2025-10-01',
                    end_date: '2026-03-31',
                    status: 'active',
                  });
                  setShowSeasonModal(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Criar Primeira Estação
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {seasons.map((s) => {
                const isActive = s.status === 'active';
                const formatDate = (dStr: string) => {
                  if (!dStr) return '—';
                  const parts = dStr.split('-');
                  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                  return dStr;
                };

                return (
                  <div
                    key={s.id}
                    className={`glass-card p-5 rounded-2xl border transition-all space-y-4 relative ${
                      isActive
                        ? 'border-emerald-500/50 bg-linear-to-b from-slate-900/90 to-emerald-950/20 shadow-lg shadow-emerald-950/30'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    {/* Header: Name + Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                          Estação Reprodutiva
                        </span>
                        <h4 className="text-lg font-bold text-white tracking-tight mt-0.5">
                          {s.name}
                        </h4>
                      </div>

                      {isActive ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full shrink-0">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          Ativa Vigente
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-400 bg-slate-800 border border-slate-700 px-2.5 py-0.5 rounded-full shrink-0">
                          Encerrada / Arquivo
                        </span>
                      )}
                    </div>

                    {/* Period info */}
                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Início</span>
                        <span className="text-slate-200 font-medium">{formatDate(s.start_date)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Término</span>
                        <span className="text-slate-200 font-medium">{formatDate(s.end_date)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <div>
                        {!isActive && (
                          <button
                            onClick={() => handleSetActiveSeasonClick(s.id, s.name)}
                            disabled={saving}
                            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold px-3 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Tornar esta estação a ativa do sistema"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Tornar Ativa
                          </button>
                        )}
                        {isActive && (
                          <span className="text-[11px] text-emerald-400/80 font-medium flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" /> Estação Padrão Atual
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditSeason(s)}
                          className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-all text-xs cursor-pointer"
                          title="Editar datas e nome"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSeason(s.id, s.name)}
                          className="p-2 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition-all text-xs cursor-pointer"
                          title="Excluir estação"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : activeTab === 'veterinarians' ? (
        /* ===== TAB: MÉDICOS VETERINÁRIOS ===== */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-emerald-400" /> Médicos Veterinários & Responsáveis Técnicos (RT)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Gerencie os profissionais técnicos habilitados, registros no CRMV e defina o RT padrão para novos lotes e laudos oficiais.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingVetId(null);
                setVetForm({
                  name: '',
                  crmv: '',
                  phone: '',
                  email: '',
                  is_default: veterinarians.length === 0,
                });
                setShowVetModal(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/20 shrink-0"
            >
              <Plus className="w-4 h-4" /> Novo Veterinário
            </button>
          </div>

          {veterinarians.length === 0 ? (
            <div className="glass-card p-12 text-center rounded-2xl border border-slate-800 space-y-3">
              <GraduationCap className="w-12 h-12 text-slate-600 mx-auto" />
              <p className="text-slate-400 text-sm">Nenhum médico veterinário cadastrado.</p>
              <button
                onClick={() => {
                  setEditingVetId(null);
                  setVetForm({
                    name: 'MV. DR. SAMOEL DUARTE',
                    crmv: 'CRMV-MT 1234',
                    phone: '',
                    email: '',
                    is_default: true,
                  });
                  setShowVetModal(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Cadastrar Primeiro Veterinário
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {veterinarians.map((v) => (
                <div
                  key={v.id}
                  className={`glass-card p-5 rounded-2xl border transition-all space-y-4 relative ${
                    v.is_default
                      ? 'border-emerald-500/50 bg-linear-to-b from-slate-900/90 to-emerald-950/20 shadow-lg shadow-emerald-950/30'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                  }`}
                >
                  {/* Header: Name + Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                        Médico Veterinário
                      </span>
                      <h4 className="text-base font-bold text-white tracking-tight mt-0.5">
                        {v.name}
                      </h4>
                      {v.crmv && (
                        <span className="inline-block mt-1 font-mono text-xs font-semibold px-2 py-0.5 rounded-lg bg-slate-950 border border-emerald-500/30 text-emerald-400">
                          {v.crmv}
                        </span>
                      )}
                    </div>

                    {v.is_default ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full shrink-0">
                        <Star className="w-3 h-3 fill-emerald-400" />
                        RT Padrão
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-slate-400 bg-slate-800 border border-slate-700 px-2.5 py-0.5 rounded-full shrink-0">
                        Equipe Técnica
                      </span>
                    )}
                  </div>

                  {/* Contact info */}
                  <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>{v.phone || 'Telefone não informado'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{v.email || 'E-mail não informado'}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                    <div>
                      {!v.is_default && (
                        <button
                          onClick={() => handleSetDefaultVet(v.id, v.name)}
                          disabled={saving}
                          className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold px-3 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          title="Definir este profissional como RT padrão"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Tornar RT Padrão
                        </button>
                      )}
                      {v.is_default && (
                        <span className="text-[11px] text-emerald-400/80 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Responsável Principal
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenEditVet(v)}
                        className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-all text-xs cursor-pointer"
                        title="Editar dados"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteVet(v.id, v.name)}
                        className="p-2 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition-all text-xs cursor-pointer"
                        title="Excluir veterinário"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* ===== MODAL CADASTRO DE MATRIZ ===== */}
      {showAnimalModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-xl rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Syringe className="w-5 h-5 text-emerald-400" /> Cadastrar Nova Matriz (Vaca)
              </h3>
              <button onClick={() => setShowAnimalModal(false)} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAnimal} className="space-y-4">
              {modalAnimalError && (
                <div className="bg-rose-500/15 border border-rose-500/40 rounded-xl p-3.5 flex items-start gap-3 text-xs text-rose-200 animate-in fade-in slide-in-from-top-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <strong className="block text-rose-300 font-semibold mb-0.5">Aviso de Cadastro:</strong>
                    <span>{modalAnimalError}</span>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Número do Brinco *</label>
                  <input
                    required
                    type="text"
                    placeholder="Ex: 1001, 2045A"
                    value={animalForm.tag_number}
                    onChange={(e) => setAnimalForm((f) => ({ ...f, tag_number: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white font-bold text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">RFID / Eletrônico</label>
                  <input
                    type="text"
                    placeholder="Ex: 982 000 123 456"
                    value={animalForm.rfid_number}
                    onChange={(e) => setAnimalForm((f) => ({ ...f, rfid_number: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Fazenda *</label>
                  <select
                    required
                    value={animalForm.farm_id}
                    onChange={(e) => setAnimalForm((f) => ({ ...f, farm_id: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Selecione a fazenda...</option>
                    {farms.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Retiro / Piquete</label>
                  <select
                    value={animalForm.property_id}
                    onChange={(e) => setAnimalForm((f) => ({ ...f, property_id: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Sem retiro específico</option>
                    {availableProperties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Raça</label>
                  <select
                    value={animalForm.breed_id}
                    onChange={(e) => setAnimalForm((f) => ({ ...f, breed_id: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Selecione a raça...</option>
                    {breeds.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Categoria</label>
                  <select
                    value={animalForm.category_id}
                    onChange={(e) => setAnimalForm((f) => ({ ...f, category_id: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Selecione a categoria...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm shadow-md"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {saving ? 'Cadastrando...' : 'Cadastrar Matriz'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAnimalModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== MODAL NOVO TOURO ===== */}
      {showBullModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-emerald-400" /> Cadastrar Novo Touro
              </h3>
              <button onClick={() => setShowBullModal(false)} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBull} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Nome do Touro / Reprodutor *</label>
                <input
                  required
                  type="text"
                  placeholder="Ex: REM ARMADOR, LANDAU DA DI GENIO"
                  value={bullForm.name}
                  onChange={(e) => setBullForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Código / Sigla</label>
                  <input
                    type="text"
                    placeholder="Ex: REM 1234"
                    value={bullForm.code}
                    onChange={(e) => setBullForm((f) => ({ ...f, code: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Central / Fornecedor</label>
                  <input
                    type="text"
                    placeholder="Ex: ALTA GENETICS, ABS"
                    value={bullForm.owner_central}
                    onChange={(e) => setBullForm((f) => ({ ...f, owner_central: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Raça</label>
                <select
                  value={bullForm.breed_id}
                  onChange={(e) => setBullForm((f) => ({ ...f, breed_id: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione a raça...</option>
                  {breeds.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {saving ? 'Cadastrando...' : 'Cadastrar Touro'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBullModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== MODAL NOVA FAZENDA ===== */}
      {showFarmModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-400" /> Cadastrar Nova Fazenda
              </h3>
              <button onClick={() => setShowFarmModal(false)} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFarm} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Nome da Fazenda *</label>
                <input
                  required
                  type="text"
                  placeholder="Ex: FAZENDA SANTA MARIA"
                  value={farmForm.name}
                  onChange={(e) => setFarmForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Proprietário</label>
                <input
                  type="text"
                  placeholder="Ex: JOÃO DA SILVA OLIVEIRA"
                  value={farmForm.owner_name}
                  onChange={(e) => setFarmForm((f) => ({ ...f, owner_name: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Responsável Técnico</label>
                {veterinarians.length > 0 ? (
                  <select
                    value={farmForm.technical_responsible}
                    onChange={(e) => setFarmForm((f) => ({ ...f, technical_responsible: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Selecione o veterinário...</option>
                    {veterinarians.map((v) => (
                      <option key={v.id} value={v.crmv ? `${v.name} (${v.crmv})` : v.name}>
                        {v.name} {v.crmv ? `• ${v.crmv}` : ''} {v.is_default ? '(Padrão)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Ex: MV. DR. SAMOEL DUARTE"
                    value={farmForm.technical_responsible}
                    onChange={(e) => setFarmForm((f) => ({ ...f, technical_responsible: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Cidade</label>
                  <input
                    type="text"
                    placeholder="Ex: Cuiabá"
                    value={farmForm.city}
                    onChange={(e) => setFarmForm((f) => ({ ...f, city: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Estado</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="MT"
                    value={farmForm.state}
                    onChange={(e) => setFarmForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {saving ? 'Cadastrando...' : 'Cadastrar Fazenda'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowFarmModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== MODAL NOVO RETIRO ===== */}
      {showPropertyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-emerald-400" /> Cadastrar Retiro / Piquete
              </h3>
              <button onClick={() => setShowPropertyModal(false)} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProperty} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Fazenda Pertencente *</label>
                <select
                  required
                  value={propertyForm.farm_id}
                  onChange={(e) => setPropertyForm((f) => ({ ...f, farm_id: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione a fazenda...</option>
                  {farms.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Nome do Retiro / Piquete *</label>
                <input
                  required
                  type="text"
                  placeholder="Ex: RETIRO 04 (PASTO DA SEDE)"
                  value={propertyForm.name}
                  onChange={(e) => setPropertyForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Código / Sigla</label>
                <input
                  type="text"
                  placeholder="Ex: RET-04"
                  value={propertyForm.code}
                  onChange={(e) => setPropertyForm((f) => ({ ...f, code: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {saving ? 'Cadastrando...' : 'Cadastrar Retiro'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPropertyModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== MODAL CADASTRO / EDIÇÃO DE ESTAÇÃO DE MONTA ===== */}
      {showSeasonModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-400" />
                {editingSeasonId ? 'Editar Estação de Monta' : 'Nova Estação de Monta'}
              </h3>
              <button
                onClick={() => setShowSeasonModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSeason} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Nome da Estação Reprodutiva *
                </label>
                <input
                  required
                  type="text"
                  placeholder="Ex: Estação 2025/2026, Monta Primavera 2025"
                  value={seasonForm.name}
                  onChange={(e) => setSeasonForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white font-bold text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Data de Início *</label>
                  <input
                    required
                    type="date"
                    value={seasonForm.start_date}
                    onChange={(e) => setSeasonForm((f) => ({ ...f, start_date: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Data de Término *</label>
                  <input
                    required
                    type="date"
                    value={seasonForm.end_date}
                    onChange={(e) => setSeasonForm((f) => ({ ...f, end_date: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={seasonForm.status === 'active'}
                    onChange={(e) =>
                      setSeasonForm((f) => ({
                        ...f,
                        status: e.target.checked ? 'active' : 'closed',
                      }))
                    }
                    className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-slate-300 font-medium">
                    Definir como Estação Ativa Vigente (padrão do sistema)
                  </span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm shadow-md"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {saving ? 'Salvando...' : editingSeasonId ? 'Salvar Alterações' : 'Cadastrar Estação'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSeasonModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== MODAL CADASTRO / EDIÇÃO DE MÉDICO VETERINÁRIO ===== */}
      {showVetModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-emerald-400" />
                {editingVetId ? 'Editar Médico Veterinário' : 'Novo Médico Veterinário'}
              </h3>
              <button
                onClick={() => setShowVetModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVeterinarian} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Nome Completo do Médico Veterinário *
                </label>
                <input
                  required
                  type="text"
                  placeholder="Ex: Dr. Samoel Duarte"
                  value={vetForm.name}
                  onChange={(e) => setVetForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white font-bold text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Registro Profissional (CRMV)
                </label>
                <input
                  type="text"
                  placeholder="Ex: CRMV-MT 12345"
                  value={vetForm.crmv}
                  onChange={(e) => setVetForm((f) => ({ ...f, crmv: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white font-mono text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="(65) 99999-0000"
                    value={vetForm.phone}
                    onChange={(e) => setVetForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">E-mail</label>
                  <input
                    type="email"
                    placeholder="vet@iatf.com"
                    value={vetForm.email}
                    onChange={(e) => setVetForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vetForm.is_default}
                    onChange={(e) =>
                      setVetForm((f) => ({
                        ...f,
                        is_default: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-slate-300 font-medium">
                    Definir como Responsável Técnico Padrão (RT)
                  </span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm shadow-md"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {saving ? 'Salvando...' : editingVetId ? 'Salvar Alterações' : 'Cadastrar Veterinário'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowVetModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm"
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
