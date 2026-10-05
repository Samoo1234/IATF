'use client';

import { use, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  getAnimalHistory, 
  getAnimalManagements, 
  updateAnimal,
  deleteAnimal,
  getFarms,
  getBreeds,
  getAnimalCategories,
  type Animal, 
  type AnimalManagement,
  type Farm,
  type Breed,
  type AnimalCategory
} from '@/lib/db';
import { formatDateBR } from '@/lib/dateUtils';
import { 
  Syringe, 
  ArrowLeft, 
  Calendar, 
  MapPin, 
  RefreshCw, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Baby,
  Edit2,
  Trash2,
  X,
  Tag,
  Building2,
  Dna
} from 'lucide-react';
import AnimalManagementModal, { type ManagementModalMode } from '@/components/AnimalManagementModal';

export default function AnimalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [managements, setManagements] = useState<AnimalManagement[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit & Delete Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [animalToDelete, setAnimalToDelete] = useState<{
    hasRelations: boolean;
    lotCount?: number;
    mgmtCount?: number;
    message?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editFeedback, setEditFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [farms, setFarms] = useState<Farm[]>([]);
  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [categories, setCategories] = useState<AnimalCategory[]>([]);

  const [editForm, setEditForm] = useState({
    tag_number: '',
    rfid_number: '',
    farm_id: '',
    property_id: '',
    breed_id: '',
    category_id: '',
    reproductive_status: 'vazia',
    birth_date: '',
    status: 'active',
  });

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ManagementModalMode>('start');
  const [selectedMgmt, setSelectedMgmt] = useState<AnimalManagement | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    
    const [animalRes, hList, mList] = await Promise.all([
      supabase
        .from('animals')
        .select('*, breeds(name), animal_categories(name), properties(name), farms(name)')
        .eq('id', id)
        .single(),
      getAnimalHistory(id),
      getAnimalManagements(id, true),
    ]);

    if (animalRes.data) {
      setAnimal(animalRes.data as unknown as Animal);
    }
    setHistory(hList as Record<string, unknown>[]);
    setManagements(mList);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenEdit = async () => {
    if (!animal) return;
    const [farmsList, breedsList, categoriesList] = await Promise.all([
      getFarms(),
      getBreeds(),
      getAnimalCategories(),
    ]);
    setFarms(farmsList);
    setBreeds(breedsList);
    setCategories(categoriesList);

    const farmId = animal.farm_id || (farmsList.find(f => f.name === animal.farms?.name)?.id) || farmsList[0]?.id || '';
    const propId = animal.property_id || (farmsList.find(f => f.id === farmId)?.properties?.find(p => p.name === animal.properties?.name)?.id) || '';
    const breedId = animal.breed_id || (breedsList.find(b => b.name === animal.breeds?.name)?.id) || '';
    const catId = animal.category_id || (categoriesList.find(c => c.name === animal.animal_categories?.name)?.id) || '';

    setEditForm({
      tag_number: animal.tag_number || '',
      rfid_number: animal.rfid_number || '',
      farm_id: farmId,
      property_id: propId,
      breed_id: breedId,
      category_id: catId,
      reproductive_status: animal.reproductive_status || 'vazia',
      birth_date: animal.birth_date ? String(animal.birth_date).split('T')[0] : '',
      status: animal.status || 'active',
    });
    setEditError(null);
    setShowEditModal(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.tag_number.trim() || !editForm.farm_id) {
      setEditError('Preencha o número do brinco e selecione a fazenda.');
      return;
    }
    setSaving(true);
    const res = await updateAnimal(id, {
      tag_number: editForm.tag_number,
      rfid_number: editForm.rfid_number || null,
      farm_id: editForm.farm_id,
      property_id: editForm.property_id || null,
      breed_id: editForm.breed_id || null,
      category_id: editForm.category_id || null,
      reproductive_status: editForm.reproductive_status,
      birth_date: editForm.birth_date || null,
      status: editForm.status,
    });
    setSaving(false);

    if (res.success) {
      setShowEditModal(false);
      setEditFeedback({ type: 'success', text: 'Dados da matriz atualizados com sucesso!' });
      await loadData();
      setTimeout(() => setEditFeedback(null), 4000);
    } else {
      setEditError(res.error || 'Erro ao atualizar matriz.');
    }
  };

  const handleDeleteAnimal = async (force = false) => {
    if (!animal) return;
    if (!force) {
      if (!confirm(`Deseja realmente excluir a matriz Brinco "${animal.tag_number}"?`)) return;
    }
    setSaving(true);
    const res = await deleteAnimal(id, force);
    setSaving(false);

    if (res.success) {
      setAnimalToDelete(null);
      router.push('/animals');
    } else if (res.hasRelations) {
      setAnimalToDelete({
        hasRelations: true,
        lotCount: res.lotCount,
        mgmtCount: res.mgmtCount,
        message: res.error,
      });
    } else {
      alert(res.error || 'Erro ao excluir matriz.');
    }
  };

  const handleInactivateAnimal = async () => {
    setSaving(true);
    const res = await updateAnimal(id, { status: 'inactive' });
    setSaving(false);
    setAnimalToDelete(null);

    if (res.success) {
      setEditFeedback({ type: 'success', text: 'Matriz inativada / marcada como descarte com sucesso!' });
      await loadData();
      setTimeout(() => setEditFeedback(null), 4000);
    } else {
      alert(res.error || 'Erro ao inativar matriz.');
    }
  };

  const handleOpenStartModal = () => {
    setSelectedMgmt(null);
    setModalMode('start');
    setModalOpen(true);
  };

  const handleOpenStepModal = (mgmt: AnimalManagement, step: ManagementModalMode) => {
    setSelectedMgmt(mgmt);
    setModalMode(step);
    setModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] gap-3 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
        Carregando ficha da matriz...
      </div>
    );
  }

  if (!animal) {
    return (
      <div className="space-y-4">
        <Link href="/animals" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <p className="text-slate-400">Matriz não encontrada.</p>
      </div>
    );
  }

  const statusColor = (s: string) =>
    s === 'prenha'
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      : s === 'inseminada'
      ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      : 'bg-slate-800 text-slate-400 border-slate-700';

  // Active or latest management
  const activeManagement = managements.find((m) => m.status === 'em_andamento') || managements[0];
  const currentEntry = history[0] as Record<string, unknown> | undefined;

  // Expected parturition date from active mgmt or history
  const activeParturitionDate = 
    activeManagement?.expected_parturition_date || 
    (currentEntry?.expected_parturition_date as string | null | undefined);

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {editFeedback && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${
            editFeedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {editFeedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span className="text-sm font-medium">{editFeedback.text}</span>
        </div>
      )}

      {/* Back Link */}
      <Link href="/animals" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Voltar para Busca de Matrizes
      </Link>

      {/* Header Profile Card */}
      <div className="glass-card p-6 rounded-3xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl">
        <div className="flex items-center space-x-5">
          <div className="w-20 h-20 rounded-3xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-black text-3xl shadow-lg glow-emerald">
            {animal.tag_number}
          </div>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Matriz Brinco {animal.tag_number}</h1>
              <span className={`text-xs font-bold px-3 py-1 rounded-full border ${statusColor(animal.reproductive_status)}`}>
                {animal.reproductive_status === 'prenha' 
                  ? 'Prenha' 
                  : animal.reproductive_status === 'inseminada' 
                  ? 'Inseminada' 
                  : 'Vazia'}
              </span>
              {animal.status === 'inactive' && (
                <span className="text-xs font-bold px-3 py-1 rounded-full border bg-rose-500/10 text-rose-400 border-rose-500/20">
                  Inativa / Descarte
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-2">
              <span>Raça: <strong className="text-slate-200">{animal.breeds?.name ?? '-'}</strong></span>
              <span>•</span>
              <span>Categoria: <strong className="text-slate-200">{animal.animal_categories?.name ?? '-'}</strong></span>
              {animal.rfid_number && (
                <>
                  <span>•</span>
                  <span>RFID: <strong className="text-slate-200 font-mono">{animal.rfid_number}</strong></span>
                </>
              )}
            </p>
            {animal.farms && (
              <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                {animal.farms.name} {animal.properties?.name ? `— Retiro / Pasto: ${animal.properties.name}` : ''}
              </p>
            )}
          </div>
        </div>

        {/* Action Button & Expected Parturition */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {activeParturitionDate && animal.reproductive_status === 'prenha' && (
            <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-right">
              <span className="text-[11px] text-slate-400 flex items-center justify-end gap-1">
                <Baby className="w-3.5 h-3.5 text-emerald-400" /> Previsão de Parto (IA + 295d)
              </span>
              <span className="text-lg font-bold text-emerald-300 font-mono">
                {String(activeParturitionDate)}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenEdit}
              className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-3 rounded-2xl text-xs sm:text-sm border border-slate-700 transition-all cursor-pointer"
              title="Editar dados cadastrais da matriz"
            >
              <Edit2 className="w-4 h-4" />
              <span>Editar</span>
            </button>

            <button
              type="button"
              onClick={() => handleDeleteAnimal(false)}
              className="flex items-center justify-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-semibold px-4 py-3 rounded-2xl text-xs sm:text-sm border border-rose-500/20 transition-all cursor-pointer"
              title="Excluir ou inativar matriz"
            >
              <Trash2 className="w-4 h-4" />
              <span>Excluir</span>
            </button>

            <button
              onClick={handleOpenStartModal}
              className="flex items-center justify-center gap-2 bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold px-5 py-3 rounded-2xl text-xs sm:text-sm transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-3" />
              <span>Novo Manejo</span>
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SEÇÃO PRINCIPAL: PROTOCOLOS REALIZADOS (MANEJO INDIVIDUAL)  */}
      {/* ============================================================ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Syringe className="w-5 h-5 text-emerald-400" />
              Protocolos Realizados & Manejos da Matriz
            </h2>
            <p className="text-xs text-slate-400">
              Histórico sequencial das etapas biológicas (D0, Retirada, Inseminação, Diagnóstico de Gestação).
            </p>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {managements.length} {managements.length === 1 ? 'protocolo registrado' : 'protocolos registrados'}
          </span>
        </div>

        {managements.length === 0 && history.length === 0 ? (
          <div className="glass-card p-10 rounded-3xl border border-slate-800 text-center space-y-3">
            <Calendar className="w-12 h-12 text-slate-700 mx-auto" />
            <h3 className="text-white font-bold text-base">Nenhum protocolo reprodutivo iniciado para esta matriz</h3>
            <p className="text-slate-400 text-xs max-w-md mx-auto">
              Clique no botão acima para iniciar um protocolo hormonal IATF com cálculo automático de todas as etapas (D0, Retirada, IA e DG).
            </p>
            <button
              onClick={handleOpenStartModal}
              className="mt-2 inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs cursor-pointer shadow-md"
            >
              <Plus className="w-4 h-4" /> Iniciar 1ª IATF desta Vaca
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Managements Cards */}
            {managements.map((mgmt) => {
              const isFinished = mgmt.status === 'concluido';
              const isPrenha = mgmt.pregnancy_status === 'prenha';
              const isVazia = mgmt.pregnancy_status === 'vazia';

              // Steps status
              const hasD0 = Boolean(mgmt.d0_executed_at);
              const hasD9 = Boolean(mgmt.d9_executed_at);
              const hasIa = Boolean(mgmt.ia_executed_at);
              const hasDg = Boolean(mgmt.dg_executed_at);

              return (
                <div
                  key={mgmt.id}
                  className="glass-card p-6 sm:p-7 rounded-3xl border border-slate-800 bg-slate-900/70 space-y-6 shadow-xl relative overflow-hidden"
                >
                  {/* Top Status Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-black text-sm font-mono">
                        {mgmt.cycle_number}ª
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-white">
                            {mgmt.cycle_number}ª IATF {mgmt.cycle_number > 1 ? '(Ressincronização)' : ''}
                          </h3>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                              isFinished
                                ? isPrenha
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : 'bg-slate-800 text-slate-300 border-slate-700'
                                : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            }`}
                          >
                            {isFinished
                              ? isPrenha
                                ? 'Ciclo Concluído (Prenha)'
                                : isVazia
                                ? 'Ciclo Concluído (Vazia)'
                                : 'Concluído'
                              : 'Em Andamento'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Protocolo: <strong className="text-emerald-400">{mgmt.protocols?.name ?? 'Protocolo IATF'}</strong>
                          {mgmt.reproductive_seasons?.name && ` • Estação ${mgmt.reproductive_seasons.name}`}
                          {mgmt.iatf_lots?.code && ` • Lote ${mgmt.iatf_lots.code}`}
                        </p>
                      </div>
                    </div>

                    {/* DG Result Pill */}
                    {hasDg && (
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-3 py-1 rounded-xl text-xs font-bold border ${
                            isPrenha
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 glow-emerald'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          Diagnóstico: {isPrenha ? 'Prenha' : isVazia ? 'Vazia' : 'Inconclusivo'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* ============================================================ */}
                  {/* LINHA DO TEMPO SEQUENCIAL DAS ETAPAS DO PROTOCOLO           */}
                  {/* ============================================================ */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* ETAPA 1: D0 */}
                    <div
                      className={`p-4 rounded-2xl border transition-all ${
                        hasD0
                          ? 'bg-emerald-950/20 border-emerald-500/30'
                          : 'bg-slate-950/40 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          {hasD0 ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          1º Passo — D0
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {formatDateBR(mgmt.start_date)}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-white">Implante P4 + Benzoato</p>
                      <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                        {mgmt.d0_executed_at ? (
                          <p className="text-emerald-400 font-medium">
                            Executado em: {formatDateBR(mgmt.d0_executed_at)}
                          </p>
                        ) : (
                          <p className="text-slate-500">Pendente de apontamento</p>
                        )}
                        {mgmt.d0_responsible && <p>Resp: {mgmt.d0_responsible}</p>}
                      </div>
                    </div>

                    {/* ETAPA 2: D9 (Retirada) */}
                    <div
                      className={`p-4 rounded-2xl border transition-all ${
                        hasD9
                          ? 'bg-indigo-950/20 border-indigo-500/30'
                          : !hasD9 && hasD0
                          ? 'bg-slate-950/60 border-indigo-500/40 shadow-sm'
                          : 'bg-slate-950/40 border-slate-800 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          {hasD9 ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                          )}
                          2º Passo — D9
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {formatDateBR(mgmt.d9_date)}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-white">Retirada P4 + Indutores</p>
                      <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                        {mgmt.d9_executed_at ? (
                          <>
                            <p className="text-indigo-400 font-medium">
                              Executado em: {formatDateBR(mgmt.d9_executed_at)}
                            </p>
                            {mgmt.d9_device_loss && (
                              <p className="text-rose-400 font-bold flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> Perda de implante P4
                              </p>
                            )}
                          </>
                        ) : hasD0 ? (
                          <button
                            type="button"
                            onClick={() => handleOpenStepModal(mgmt, 'step_d9')}
                            className="mt-1 w-full bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                          >
                            Apontar Retirada
                          </button>
                        ) : (
                          <p className="text-slate-500">Aguardando D0</p>
                        )}
                      </div>
                    </div>

                    {/* ETAPA 3: IA */}
                    <div
                      className={`p-4 rounded-2xl border transition-all ${
                        hasIa
                          ? 'bg-emerald-950/20 border-emerald-500/30'
                          : !hasIa && hasD9
                          ? 'bg-slate-950/60 border-emerald-500/50 shadow-sm'
                          : 'bg-slate-950/40 border-slate-800 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          {hasIa ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                          )}
                          3º Passo — IA
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {formatDateBR(mgmt.ia_date)}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-white">Inseminação Artificial</p>
                      <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                        {mgmt.ia_executed_at ? (
                          <>
                            <p className="text-emerald-400 font-medium">
                              Executado: {formatDateBR(mgmt.ia_executed_at)}
                            </p>
                            <p className="truncate">Touro: <strong className="text-slate-200">{mgmt.bulls?.name ?? '-'}</strong></p>
                            {mgmt.inseminator_name && <p>Insem: {mgmt.inseminator_name}</p>}
                            {mgmt.ecc_ia != null && <p>ECC IA: <strong className="text-white font-mono">{mgmt.ecc_ia.toFixed(2)}</strong></p>}
                          </>
                        ) : hasD9 ? (
                          <button
                            type="button"
                            onClick={() => handleOpenStepModal(mgmt, 'step_ia')}
                            className="mt-1 w-full bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/30 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                          >
                            Apontar Inseminação
                          </button>
                        ) : (
                          <p className="text-slate-500">Aguardando Retirada</p>
                        )}
                      </div>
                    </div>

                    {/* ETAPA 4: DG */}
                    <div
                      className={`p-4 rounded-2xl border transition-all ${
                        hasDg
                          ? isPrenha
                            ? 'bg-emerald-950/20 border-emerald-500/40 glow-emerald'
                            : 'bg-slate-950/30 border-slate-700'
                          : !hasDg && hasIa
                          ? 'bg-slate-950/60 border-amber-500/50 shadow-sm'
                          : 'bg-slate-950/40 border-slate-800 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          {hasDg ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                          )}
                          4º Passo — DG
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {formatDateBR(mgmt.dg_date)}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-white">Diagnóstico de Gestação</p>
                      <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                        {mgmt.dg_executed_at ? (
                          <>
                            <p className="font-bold text-white">
                              Resultado: <span className={isPrenha ? 'text-emerald-400' : 'text-slate-300'}>
                                {isPrenha ? 'Prenha' : isVazia ? 'Vazia' : 'Inconclusivo'}
                              </span>
                            </p>
                            {mgmt.ecc_dg != null && <p>ECC DG: <strong className="text-white font-mono">{mgmt.ecc_dg.toFixed(2)}</strong></p>}
                            {mgmt.expected_parturition_date && (
                              <p className="text-emerald-300 font-mono text-[10px]">
                                Parto: {formatDateBR(mgmt.expected_parturition_date)}
                              </p>
                            )}
                          </>
                        ) : hasIa ? (
                          <button
                            type="button"
                            onClick={() => handleOpenStepModal(mgmt, 'step_dg')}
                            className="mt-1 w-full bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border border-amber-500/30 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                          >
                            Apontar Diagnóstico
                          </button>
                        ) : (
                          <p className="text-slate-500">Aguardando IA</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* HISTÓRICO ANTERIOR / LEGADO (LINHA DO TEMPO)                 */}
      {/* ============================================================ */}
      {history.length > 0 && (
        <div className="glass-card p-6 rounded-3xl border border-slate-800 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-400" />
            Histórico Consolidado de Safras
          </h2>

          <div className="space-y-3">
            {history.map((h: Record<string, unknown>, i) => {
              const lot = h.iatf_lots as Record<string, unknown> | null;
              const bull = h.bulls as Record<string, unknown> | null;
              const isPrenha = h.pregnancy_status === 'prenha';
              return (
                <div key={i} className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-sm">
                        {String((lot?.reproductive_seasons as Record<string, unknown> | null)?.name ?? 'Estação')}
                      </span>
                      <span className="text-xs px-2.5 py-0.5 rounded-lg bg-slate-800 text-slate-300 font-mono">
                        {String(lot?.code ?? 'Lote')}
                      </span>
                      {lot?.ia_planned_date != null && (
                        <span className="text-xs text-slate-400">
                          ({formatDateBR(String(lot.ia_planned_date))})
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                      Touro: <strong className="text-emerald-400">{String(bull?.name ?? 'N/D')}</strong>
                      {h.inseminator_name != null && <> • Inseminador: {String(h.inseminator_name)}</>}
                      {(lot?.protocols as Record<string, unknown> | null)?.name != null && (
                        <> • Protocolo: {String((lot?.protocols as Record<string, unknown>).name)}</>
                      )}
                      {h.ecc_ia != null && <> • ECC: {Number(h.ecc_ia).toFixed(2)}</>}
                    </p>
                    {h.expected_parturition_date != null && (
                      <p className="text-xs text-emerald-400 mt-0.5">
                        Previsão de Parto: <strong>{formatDateBR(String(h.expected_parturition_date))}</strong>
                      </p>
                    )}
                  </div>
                  <span
                    className={`px-3 py-1 rounded-xl font-bold text-xs border ${
                      isPrenha
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {isPrenha ? 'Prenha' : h.pregnancy_status === 'vazia' ? 'Vazia' : 'Pendente'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de Edição da Matriz */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Editar Matriz</h3>
                  <p className="text-xs text-slate-400">Atualize os dados cadastrais da matriz</p>
                </div>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Número do Brinco *
                  </label>
                  <div className="relative">
                    <Tag className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={editForm.tag_number}
                      onChange={(e) => setEditForm({ ...editForm, tag_number: e.target.value.toUpperCase() })}
                      placeholder="Ex: 1024"
                      className="w-full bg-slate-950/60 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 uppercase font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Número RFID / Chip
                  </label>
                  <input
                    type="text"
                    value={editForm.rfid_number}
                    onChange={(e) => setEditForm({ ...editForm, rfid_number: e.target.value })}
                    placeholder="Opcional"
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Fazenda *
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <select
                      required
                      value={editForm.farm_id}
                      onChange={(e) => setEditForm({ ...editForm, farm_id: e.target.value, property_id: '' })}
                      className="w-full bg-slate-950/60 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Selecione...</option>
                      {farms.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Pasto / Retiro
                  </label>
                  <select
                    value={editForm.property_id}
                    onChange={(e) => setEditForm({ ...editForm, property_id: e.target.value })}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Nenhum / Não informado</option>
                    {(farms.find((f) => f.id === editForm.farm_id)?.properties || []).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Raça
                  </label>
                  <div className="relative">
                    <Dna className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <select
                      value={editForm.breed_id}
                      onChange={(e) => setEditForm({ ...editForm, breed_id: e.target.value })}
                      className="w-full bg-slate-950/60 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Selecione a raça...</option>
                      {breeds.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Categoria
                  </label>
                  <select
                    value={editForm.category_id}
                    onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Selecione a categoria...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Status Reprodutivo
                  </label>
                  <select
                    value={editForm.reproductive_status}
                    onChange={(e) => setEditForm({ ...editForm, reproductive_status: e.target.value })}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="vazia">Vazia</option>
                    <option value="inseminada">Inseminada</option>
                    <option value="prenha">Prenha</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Data de Nascimento
                  </label>
                  <input
                    type="date"
                    value={editForm.birth_date}
                    onChange={(e) => setEditForm({ ...editForm, birth_date: e.target.value })}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Situação / Status
                  </label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-semibold"
                  >
                    <option value="active">Ativa (Rebanho)</option>
                    <option value="inactive">Inativa / Descarte</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-3 rounded-xl transition-all shadow-lg glow-emerald flex items-center justify-center gap-2 text-sm cursor-pointer"
                >
                  {saving ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Edit2 className="w-4 h-4" />
                  )}
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-5 py-3 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Exclusão / Descarte com Relações */}
      {animalToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-lg rounded-3xl border border-rose-500/30 bg-slate-900 p-6 sm:p-8 space-y-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-400" />
                Exclusão / Descarte de Matriz
              </h3>
              <button
                onClick={() => setAnimalToDelete(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm text-slate-300">
              <p>
                A matriz com brinco <strong className="text-white font-mono">{animal?.tag_number}</strong> possui registros vinculados no sistema:
              </p>
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between items-center text-slate-300">
                  <span>Participação em Lotes IATF:</span>
                  <span className="font-bold text-amber-400 font-mono text-sm">{animalToDelete.lotCount ?? 0} lote(s)</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>Manejos Reprodutivos Individuais:</span>
                  <span className="font-bold text-amber-400 font-mono text-sm">{animalToDelete.mgmtCount ?? 0} ciclo(s)</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Para manter a integridade dos dados históricos e relatórios zootécnicos, recomendamos <strong>inativar / marcar como descarte</strong> a matriz em vez de excluí-la permanentemente.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={handleInactivateAnimal}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-xs sm:text-sm shadow-md cursor-pointer"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Inativar / Marcar como Descarte (Recomendado)
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleDeleteAnimal(true)}
                className="w-full bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 font-semibold px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2 text-xs cursor-pointer"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Excluir Definitivamente (Apaga todo o histórico)
              </button>
              <button
                type="button"
                onClick={() => setAnimalToDelete(null)}
                className="w-full px-4 py-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animal Management Modal */}
      <AnimalManagementModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => loadData()}
        animalId={animal.id}
        animalTag={animal.tag_number}
        farmId={(animal as unknown as { farm_id?: string }).farm_id || (animal as unknown as { properties?: { farm_id?: string } }).properties?.farm_id || ''}
        mode={modalMode}
        management={selectedMgmt}
      />
    </div>
  );
}
