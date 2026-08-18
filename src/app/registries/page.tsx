'use client';

import { useEffect, useState } from 'react';
import { 
  getBulls, createBull, 
  getFarms, createFarm, createProperty, 
  getBreeds, createBreed, 
  getAnimalCategories, createAnimalCategory,
  type Bull, type Farm, type Breed, type AnimalCategory 
} from '@/lib/db';
import { 
  FolderTree, Plus, RefreshCw, X, CheckCircle2, 
  Dna, MapPin, Tag, Building2, UserCheck, Award, Layers
} from 'lucide-react';

type TabType = 'bulls' | 'farms' | 'breeds';

export default function RegistriesPage() {
  const [activeTab, setActiveTab] = useState<TabType>('bulls');
  const [loading, setLoading] = useState(true);

  // Data states
  const [bulls, setBulls] = useState<Bull[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [categories, setCategories] = useState<AnimalCategory[]>([]);

  // Modal states
  const [showBullModal, setShowBullModal] = useState(false);
  const [showFarmModal, setShowFarmModal] = useState(false);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [selectedFarmId, setSelectedFarmId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Form states
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

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    setLoading(true);
    const [b, f, br, c] = await Promise.all([
      getBulls(),
      getFarms(),
      getBreeds(),
      getAnimalCategories(),
    ]);
    setBulls(b);
    setFarms(f);
    setBreeds(br);
    setCategories(c);
    setLoading(false);
  }

  // Handlers
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
    const farmId = await createFarm(farmForm);
    setSaving(false);
    if (farmId) {
      setShowFarmModal(false);
      setFarmForm({ name: '', owner_name: '', technical_responsible: 'MV. DR. SAMOEL DUARTE', city: '', state: 'MT' });
      await loadAllData();
    }
  };

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyForm.farm_id || !propertyForm.name) return;
    setSaving(true);
    const ok = await createProperty(propertyForm);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FolderTree className="w-6 h-6 text-emerald-400" />
            Cadastros Gerais do Sistema
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Gerenciamento de touros reprodutores, fazendas, retiros, raças e categorias bovinas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'bulls' && (
            <button
              onClick={() => setShowBullModal(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-md"
            >
              <Plus className="w-4 h-4" /> Novo Touro
            </button>
          )}
          {activeTab === 'farms' && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowFarmModal(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-md"
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
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-800 pb-2">
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
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
          Carregando cadastros do Supabase...
        </div>
      ) : activeTab === 'bulls' ? (
        /* ===== TAB: TOUROS ===== */
        <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-400" /> Touros Cadastrados no Plantel
          </h2>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Nome do Touro</th>
                  <th className="p-3">Código</th>
                  <th className="p-3">Central de Inseminação</th>
                  <th className="p-3">Registro Genealógico</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
                {bulls.map((bull) => (
                  <tr key={bull.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="p-3 font-bold text-white">{bull.name}</td>
                    <td className="p-3 font-mono text-amber-400">{bull.code ?? '—'}</td>
                    <td className="p-3">{bull.owner_central ?? '—'}</td>
                    <td className="p-3 font-mono">{bull.code ?? '—'}</td>
                    <td className="p-3">
                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-semibold">
                        Ativo
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'farms' ? (
        /* ===== TAB: FAZENDAS & RETIROS ===== */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {farms.map((farm) => (
              <div key={farm.id} className="glass-card p-6 rounded-2xl border border-slate-800 bg-slate-900/80 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Fazenda Ativa
                    </span>
                    <h2 className="text-xl font-bold text-white mt-2 flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-emerald-400" />
                      {farm.name}
                    </h2>
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      {farm.city ? `${farm.city} - ${farm.state}` : 'Localização não informada'}
                    </p>
                  </div>
                </div>

                <div className="text-xs text-slate-300 space-y-1 pt-2 border-t border-slate-800">
                  <p><strong className="text-slate-400">Proprietário:</strong> {farm.owner_name ?? '—'}</p>
                  <p><strong className="text-slate-400">Responsável Técnico:</strong> {farm.technical_responsible ?? '—'}</p>
                </div>

                {/* Properties / Retiros */}
                <div className="pt-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Retiros / Piquetes ({farm.properties?.length ?? 0})
                    </span>
                    <button
                      onClick={() => {
                        setPropertyForm((f) => ({ ...f, farm_id: farm.id }));
                        setShowPropertyModal(true);
                      }}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Adicionar Retiro
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {(farm.properties ?? []).map((prop) => (
                      <div key={prop.id} className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-200">{prop.name}</span>
                        {prop.code && <span className="font-mono text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">{prop.code}</span>}
                      </div>
                    ))}
                    {(farm.properties?.length ?? 0) === 0 && (
                      <p className="text-xs text-slate-500 col-span-2 py-2">Nenhum retiro cadastrado nesta fazenda.</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ===== TAB: RAÇAS & CATEGORIAS ===== */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Breeds */}
          <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Dna className="w-5 h-5 text-emerald-400" />
              Raças Bovinas Cadastradas
            </h2>

            <form onSubmit={handleCreateBreed} className="flex gap-2">
              <input
                type="text"
                required
                placeholder="Ex: Senepol, Guzerá..."
                value={newBreedName}
                onChange={(e) => setNewBreedName(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Adicionar
              </button>
            </form>

            <div className="space-y-2">
              {breeds.map((breed) => (
                <div key={breed.id} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs">
                  <span className="font-bold text-white">{breed.name}</span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    Ativa
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Tag className="w-5 h-5 text-emerald-400" />
              Categorias Reprodutivas de Fêmeas (RN-03)
            </h2>

            <form onSubmit={handleCreateCategory} className="flex gap-2">
              <input
                type="text"
                required
                placeholder="Ex: Doadora, Receptora..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Adicionar
              </button>
            </form>

            <div className="space-y-2">
              {categories.map((cat) => (
                <div key={cat.id} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs">
                  <span className="font-bold text-white">{cat.name}</span>
                  <span className="text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                    Categoria
                  </span>
                </div>
              ))}
            </div>
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
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Nome do Touro *</label>
                <input
                  required
                  type="text"
                  placeholder="Ex: NELORE BARRANCO 4501"
                  value={bullForm.name}
                  onChange={(e) => setBullForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Código / Apelido</label>
                  <input
                    type="text"
                    placeholder="Ex: NEL-4501"
                    value={bullForm.code}
                    onChange={(e) => setBullForm((f) => ({ ...f, code: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Central de Sêmen</label>
                  <input
                    type="text"
                    placeholder="Ex: CRV Lagoa, ABS"
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
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Responsável Técnico (Veterinário)</label>
                <input
                  type="text"
                  value={farmForm.technical_responsible}
                  onChange={(e) => setFarmForm((f) => ({ ...f, technical_responsible: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
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
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">UF</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="MT"
                    value={farmForm.state}
                    onChange={(e) => setFarmForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 text-center uppercase"
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
                  {saving ? 'Cadastrando...' : 'Salvar Fazenda'}
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
    </div>
  );
}
