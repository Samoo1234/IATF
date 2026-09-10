'use client';

import { use, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { 
  getAnimalHistory, 
  getAnimalManagements, 
  type Animal, 
  type AnimalManagement 
} from '@/lib/db';
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
  Baby
} from 'lucide-react';
import AnimalManagementModal, { type ManagementModalMode } from '@/components/AnimalManagementModal';

export default function AnimalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [managements, setManagements] = useState<AnimalManagement[]>([]);
  const [loading, setLoading] = useState(true);

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
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
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

          <button
            onClick={handleOpenStartModal}
            className="flex items-center justify-center gap-2 bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold px-5 py-3 rounded-2xl text-sm transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-3" />
            <span>Iniciar Novo Manejo / Protocolo</span>
          </button>
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
                          {mgmt.start_date ? new Date(mgmt.start_date + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-white">Implante P4 + Benzoato</p>
                      <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                        {mgmt.d0_executed_at ? (
                          <p className="text-emerald-400 font-medium">
                            Executado em: {new Date(mgmt.d0_executed_at + 'T00:00:00').toLocaleDateString('pt-BR')}
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
                          {mgmt.d9_date ? new Date(mgmt.d9_date + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-white">Retirada P4 + Indutores</p>
                      <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                        {mgmt.d9_executed_at ? (
                          <>
                            <p className="text-indigo-400 font-medium">
                              Executado em: {new Date(mgmt.d9_executed_at + 'T00:00:00').toLocaleDateString('pt-BR')}
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
                          {mgmt.ia_date ? new Date(mgmt.ia_date + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-white">Inseminação Artificial</p>
                      <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                        {mgmt.ia_executed_at ? (
                          <>
                            <p className="text-emerald-400 font-medium">
                              Executado: {new Date(mgmt.ia_executed_at + 'T00:00:00').toLocaleDateString('pt-BR')}
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
                          {mgmt.dg_date ? new Date(mgmt.dg_date + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
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
                                Parto: {new Date(mgmt.expected_parturition_date + 'T00:00:00').toLocaleDateString('pt-BR')}
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
                          ({new Date(String(lot.ia_planned_date) + 'T00:00:00').toLocaleDateString('pt-BR')})
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
                        Previsão de Parto: <strong>{new Date(String(h.expected_parturition_date) + 'T00:00:00').toLocaleDateString('pt-BR')}</strong>
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
