'use client';

import { useEffect, useState, useCallback } from 'react';
import { 
  searchAnimals, 
  getAnimals, 
  getAnimalHistory, 
  createAnimal, 
  getFarms, 
  getBreeds, 
  getAnimalCategories, 
  type Animal, 
  type Farm, 
  type Breed, 
  type AnimalCategory 
} from '@/lib/db';
import { 
  Search, 
  Syringe, 
  Calendar, 
  MapPin, 
  RefreshCw, 
  ArrowRight, 
  Plus, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Tag,
  Building2,
  Dna
} from 'lucide-react';
import Link from 'next/link';

export default function AnimalsPage() {
  const [query, setQuery] = useState('');
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Aux state for creation modal
  const [farms, setFarms] = useState<Farm[]>([]);
  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [categories, setCategories] = useState<AnimalCategory[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
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

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    const [animalsList, farmsList, breedsList, categoriesList] = await Promise.all([
      getAnimals(50),
      getFarms(),
      getBreeds(),
      getAnimalCategories(),
    ]);
    setAnimals(animalsList);
    setFarms(farmsList);
    setBreeds(breedsList);
    setCategories(categoriesList);

    if (farmsList.length > 0 && !animalForm.farm_id) {
      setAnimalForm((f) => ({
        ...f,
        farm_id: farmsList[0].id,
        property_id: farmsList[0].properties?.[0]?.id || '',
      }));
    }
    setLoading(false);
  }, [animalForm.farm_id]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (query.trim().length >= 1) {
      const t = setTimeout(async () => {
        setLoading(true);
        const data = await searchAnimals(query.trim());
        setAnimals(data);
        setLoading(false);
      }, 300);
      return () => clearTimeout(t);
    } else if (query.trim().length === 0) {
      getAnimals(50).then((data) => setAnimals(data));
    }
  }, [query]);

  async function selectAnimal(a: Animal) {
    setSelectedAnimal(a);
    setLoadingHistory(true);
    const h = await getAnimalHistory(a.id);
    setHistory(h as Record<string, unknown>[]);
    setLoadingHistory(false);
  }

  const handleFarmSelect = (farmId: string) => {
    const selected = farms.find((f) => f.id === farmId);
    setAnimalForm((f) => ({
      ...f,
      farm_id: farmId,
      property_id: selected?.properties?.[0]?.id || '',
    }));
  };

  const handleCreateAnimal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!animalForm.tag_number.trim() || !animalForm.farm_id) {
      setFeedbackMsg({ type: 'error', text: 'Preencha o número do brinco e selecione a fazenda.' });
      return;
    }

    setSaving(true);
    setFeedbackMsg(null);

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
      setFeedbackMsg({ type: 'success', text: `Matriz Brinco ${animalForm.tag_number} cadastrada com sucesso!` });
      setShowModal(false);
      setAnimalForm({
        tag_number: '',
        rfid_number: '',
        farm_id: farms[0]?.id || '',
        property_id: farms[0]?.properties?.[0]?.id || '',
        breed_id: '',
        category_id: '',
        reproductive_status: 'vazia',
        birth_date: '',
      });
      // Recarregar lista
      const updated = await getAnimals(50);
      setAnimals(updated);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } else {
      setFeedbackMsg({ type: 'error', text: res.error || 'Erro ao cadastrar matriz. Verifique se o brinco já existe nesta fazenda.' });
    }
  };

  const statusColor = (s: string) =>
    s === 'prenha'
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      : s === 'inseminada'
      ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      : 'bg-slate-800 text-slate-400 border-slate-700';

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
            <Syringe className="w-6 h-6 text-emerald-400" />
            Matrizes & Rebanho Bovino
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Cadastro de vacas/matrizes, busca por brinco e histórico de IATF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar brinco..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-white font-bold text-sm pl-9 pr-4 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500 transition-all w-48 sm:w-60"
            />
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-sm transition-all shadow-md shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4 stroke-3" />
            <span>Cadastrar Matriz</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Animals List / Search Results */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {query ? 'Resultados da Busca' : 'Matrizes Cadastradas'}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              {animals.length} {animals.length === 1 ? 'matriz' : 'matrizes'}
            </span>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-8">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
              Carregando matrizes...
            </div>
          )}

          {!loading && query.length > 0 && animals.length === 0 && (
            <div className="glass-card p-6 rounded-2xl border border-slate-800 text-center space-y-2">
              <Search className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-slate-400 text-sm">Nenhuma matriz encontrada para &quot;{query}&quot;.</p>
              <button
                onClick={() => {
                  setAnimalForm((f) => ({ ...f, tag_number: query.trim() }));
                  setShowModal(true);
                }}
                className="text-xs text-emerald-400 hover:underline font-semibold mt-2 inline-block"
              >
                + Cadastrar brinco &quot;{query}&quot; agora
              </button>
            </div>
          )}

          {!loading && animals.length === 0 && query.length === 0 && (
            <div className="glass-card p-8 rounded-2xl border border-slate-800 text-center space-y-3">
              <Syringe className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-slate-300 font-medium text-sm">Nenhuma matriz cadastrada ainda.</p>
              <p className="text-slate-500 text-xs">Comece cadastrando suas fêmeas ou importe via planilha Excel.</p>
              <button
                onClick={() => setShowModal(true)}
                className="mt-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs"
              >
                Cadastrar Primeira Matriz
              </button>
            </div>
          )}

          {animals.map((a) => (
            <div
              key={a.id}
              onClick={() => selectAnimal(a)}
              className={`glass-card p-4 rounded-2xl border transition-all cursor-pointer ${
                selectedAnimal?.id === a.id
                  ? 'border-emerald-500/50 bg-emerald-950/20 shadow-md shadow-emerald-500/10'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900/80'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-black text-sm">
                    {a.tag_number}
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm">Brinco {a.tag_number}</p>
                    <p className="text-xs text-slate-400">
                      {a.breeds?.name ?? 'Raça N/D'} • {a.animal_categories?.name ?? 'Categoria N/D'}
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusColor(a.reproductive_status)}`}>
                  {a.reproductive_status === 'prenha' ? 'Prenha' : a.reproductive_status === 'inseminada' ? 'Inseminada' : 'Vazia'}
                </span>
              </div>
              {a.farms?.name && (
                <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {a.farms.name} {a.properties?.name ? `— ${a.properties.name}` : ''}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Animal Detail */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedAnimal ? (
            <div className="glass-card p-12 rounded-2xl border border-slate-800 text-center space-y-3">
              <Syringe className="w-12 h-12 text-slate-700 mx-auto" />
              <h3 className="text-slate-300 font-bold text-base">Ficha Reprodutiva da Vaca / Matriz</h3>
              <p className="text-slate-500 text-sm max-w-md mx-auto">
                Selecione uma matriz na lista à esquerda para consultar todo o histórico de IATF, diagnósticos de gestação e previsão de parto.
              </p>
            </div>
          ) : (
            <>
              {/* Header Card */}
              <div className="glass-card p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-black text-2xl shadow-lg glow-emerald">
                    {selectedAnimal.tag_number}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-2xl font-bold text-white">Brinco {selectedAnimal.tag_number}</h2>
                      <span className={`text-xs font-semibold px-3 py-0.5 rounded-full border ${statusColor(selectedAnimal.reproductive_status)}`}>
                        {selectedAnimal.reproductive_status === 'prenha' ? 'Prenha' : selectedAnimal.reproductive_status === 'inseminada' ? 'Inseminada' : 'Vazia'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {selectedAnimal.breeds?.name ?? 'Raça N/D'} • {selectedAnimal.animal_categories?.name ?? 'Categoria N/D'}
                      {selectedAnimal.rfid_number ? ` • RFID: ${selectedAnimal.rfid_number}` : ''}
                    </p>
                    {selectedAnimal.farms?.name && (
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" /> {selectedAnimal.farms.name} {selectedAnimal.properties?.name ? `— ${selectedAnimal.properties.name}` : ''}
                      </p>
                    )}
                  </div>
                </div>
                <Link
                  href={`/animals/${selectedAnimal.id}`}
                  className="flex items-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  Ver ficha detalhada <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              {/* Timeline */}
              <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-emerald-400" />
                  Linha do Tempo Reprodutiva
                </h3>

                {loadingHistory ? (
                  <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                    Carregando histórico...
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-slate-400 text-sm py-4">Esta matriz ainda não participou de nenhum lote de IATF.</p>
                ) : (
                  <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                    {history.map((h: Record<string, unknown>, i) => {
                      const lot = h.iatf_lots as Record<string, unknown> | null;
                      const bull = h.bulls as Record<string, unknown> | null;
                      const season = lot?.reproductive_seasons as Record<string, unknown> | null;
                      const protocol = lot?.protocols as Record<string, unknown> | null;
                      const isPrenha = h.pregnancy_status === 'prenha';
                      return (
                        <div key={i} className="relative space-y-1">
                          <div className={`absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full border-2 ${
                            isPrenha ? 'bg-emerald-500 border-emerald-400' : 'bg-slate-700 border-slate-600'
                          }`} />
                          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-white text-sm">{String(season?.name ?? '—')}</span>
                                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">{String(lot?.code ?? '—')}</span>
                                <span className="text-xs text-slate-400">({String(lot?.ia_planned_date ?? '—')})</span>
                              </div>
                              <p className="text-xs text-slate-300 mt-1">
                                Touro: <strong className="text-emerald-400">{String(bull?.name ?? '—')}</strong>
                                {protocol?.name != null && <> • Protocolo: {String(protocol.name)}</>}
                                {h.inseminator_name != null && <> • Inseminador: {String(h.inseminator_name)}</>}
                              </p>
                              {h.expected_parturition_date != null && (
                                <p className="text-xs text-emerald-400 mt-0.5">
                                  Prev. Parto: <strong>{String(h.expected_parturition_date)}</strong>
                                </p>
                              )}
                            </div>
                            <span className={`px-3 py-1 rounded-lg font-bold text-xs ${
                              isPrenha
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {String(h.pregnancy_status === 'prenha' ? 'Prenha' : h.pregnancy_status === 'vazia' ? 'Vazia' : 'Pendente')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== MODAL CADASTRO DE MATRIZ / VACA ===== */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-xl rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Syringe className="w-5 h-5 text-emerald-400" /> Cadastrar Nova Matriz (Vaca)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Adicione uma fêmea bovina ao rebanho para controle de IATF.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAnimal} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Número do Brinco *
                  </label>
                  <div className="relative">
                    <Tag className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="Ex: 1001, 2045A"
                      value={animalForm.tag_number}
                      onChange={(e) => setAnimalForm((f) => ({ ...f, tag_number: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-700 text-white font-bold text-sm pl-9 pr-3 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    RFID / Brinco Eletrônico
                  </label>
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
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Fazenda *
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <select
                      required
                      value={animalForm.farm_id}
                      onChange={(e) => handleFarmSelect(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 text-white text-sm pl-9 pr-3 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Selecione a fazenda...</option>
                      {farms.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Retiro / Piquete
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <select
                      value={animalForm.property_id}
                      onChange={(e) => setAnimalForm((f) => ({ ...f, property_id: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-700 text-white text-sm pl-9 pr-3 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Sem retiro específico</option>
                      {availableProperties.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Raça
                  </label>
                  <div className="relative">
                    <Dna className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <select
                      value={animalForm.breed_id}
                      onChange={(e) => setAnimalForm((f) => ({ ...f, breed_id: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-700 text-white text-sm pl-9 pr-3 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Selecione a raça...</option>
                      {breeds.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Categoria Animal
                  </label>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Status Reprodutivo Inicial
                  </label>
                  <select
                    value={animalForm.reproductive_status}
                    onChange={(e) => setAnimalForm((f) => ({ ...f, reproductive_status: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                  >
                    <option value="vazia">Vazia (Apta para IATF)</option>
                    <option value="inseminada">Inseminada</option>
                    <option value="prenha">Prenha</option>
                    <option value="descartada">Descartada</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Data de Nascimento (opcional)
                  </label>
                  <input
                    type="date"
                    value={animalForm.birth_date}
                    onChange={(e) => setAnimalForm((f) => ({ ...f, birth_date: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-800">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-3 rounded-xl transition-all shadow-lg glow-emerald flex items-center justify-center gap-2 text-sm"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 stroke-3" />}
                  {saving ? 'Cadastrando Matriz...' : 'Salvar Matriz'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-3 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm font-semibold transition-colors"
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
