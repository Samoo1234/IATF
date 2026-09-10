'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  getProtocols, 
  getBulls, 
  getSemenBatches, 
  getVeterinarians, 
  getReproductiveSeasons,
  getAnimalManagements,
  startAnimalManagement,
  executeStepD9,
  executeStepIA,
  recordDirectDG,
  type Protocol,
  type Bull,
  type SemenBatch,
  type ReproductiveSeason,
  type AnimalManagement
} from '@/lib/db';
import { 
  X, 
  Syringe, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Sparkles, 
  Clock, 
  User, 
  Tag, 
  Check, 
  Baby,
  Dna,
  ExternalLink
} from 'lucide-react';

export type ManagementModalMode = 'start' | 'step_d9' | 'step_ia' | 'step_dg';

interface AnimalManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  animalId: string;
  animalTag: string;
  farmId: string;
  mode?: ManagementModalMode;
  management?: AnimalManagement | null;
}

export default function AnimalManagementModal({
  isOpen,
  onClose,
  onSuccess,
  animalId,
  animalTag,
  farmId,
  mode = 'start',
  management = null,
}: AnimalManagementModalProps) {
  const [currentMode, setCurrentMode] = useState<ManagementModalMode>(mode);
  const [activeMgmt, setActiveMgmt] = useState<AnimalManagement | null>(management);
  const [loadingAux, setLoadingAux] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Aux state
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [bulls, setBulls] = useState<Bull[]>([]);
  const [semenBatches, setSemenBatches] = useState<SemenBatch[]>([]);
  const [seasons, setSeasons] = useState<ReproductiveSeason[]>([]);

  // Start Form
  const [selectedProtocolId, setSelectedProtocolId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [responsibleName, setResponsibleName] = useState('');
  const [d0Executed, setD0Executed] = useState(true);
  const [startNotes, setStartNotes] = useState('');

  // Start Form: Datas do cronograma de livre escolha do veterinário
  const [customD9Date, setCustomD9Date] = useState('');
  const [customIaDate, setCustomIaDate] = useState('');
  const [customDgDate, setCustomDgDate] = useState('');

  // Step D9 Form
  const [d9Date, setD9Date] = useState(new Date().toISOString().split('T')[0]);
  const [d9Responsible, setD9Responsible] = useState('');
  const [d9DeviceLoss, setD9DeviceLoss] = useState(false);
  const [d9Notes, setD9Notes] = useState('');

  // Step IA Form
  const [iaDate, setIaDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedBullId, setSelectedBullId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [inseminatorName, setInseminatorName] = useState('');
  const [eccIa, setEccIa] = useState('3.00');
  const [iaNotes, setIaNotes] = useState('');

  // Step DG Form
  const [dgDate, setDgDate] = useState(new Date().toISOString().split('T')[0]);
  const [pregnancyStatus, setPregnancyStatus] = useState<'prenha' | 'vazia' | 'inconclusivo'>('prenha');
  const [eccDg, setEccDg] = useState('3.00');
  const [dgNotes, setDgNotes] = useState('');

  useEffect(() => {
    setCurrentMode(mode);
  }, [mode]);

  useEffect(() => {
    setActiveMgmt(management);
  }, [management]);

  useEffect(() => {
    if (!isOpen) return;

    async function loadAux() {
      setLoadingAux(true);
      setErrorMsg(null);
      try {
        const [pList, bList, sList, vList, seasList, mgmtList] = await Promise.all([
          getProtocols(),
          getBulls(),
          getSemenBatches(),
          getVeterinarians(),
          getReproductiveSeasons(),
          !management && animalId ? getAnimalManagements(animalId, true) : Promise.resolve([]),
        ]);

        setProtocols(pList);
        setBulls(bList);
        setSemenBatches(sList);
        setSeasons(seasList);

        if (pList.length > 0) setSelectedProtocolId(pList[0].id);

        const activeSeason = seasList.find((s) => s.status === 'active') || seasList[0];
        if (activeSeason) setSelectedSeasonId(activeSeason.id);

        const defaultVet = vList.find((v) => v.is_default) || vList[0];
        const vetName = defaultVet ? defaultVet.name : 'MV. DR. SAMOEL DUARTE';
        setResponsibleName(vetName);
        setD9Responsible(vetName);
        setInseminatorName(vetName);

        // Resolve active management
        let targetMgmt = management;
        if (!targetMgmt && mgmtList.length > 0) {
          targetMgmt = mgmtList.find((m) => m.status === 'em_andamento') || mgmtList[0] || null;
          setActiveMgmt(targetMgmt);

          // If mode was not explicitly customized by caller, pick the most appropriate step
          if (mode === 'start' && targetMgmt && targetMgmt.status === 'em_andamento') {
            if (!targetMgmt.d9_executed_at) {
              setCurrentMode('step_d9');
            } else if (!targetMgmt.ia_executed_at) {
              setCurrentMode('step_ia');
            } else if (!targetMgmt.dg_executed_at) {
              setCurrentMode('step_dg');
            }
          }
        }

        // Pre-fill dates based on management if available
        if (targetMgmt) {
          if (targetMgmt.d9_date) setD9Date(targetMgmt.d9_date);
          if (targetMgmt.ia_date) setIaDate(targetMgmt.ia_date);
          if (targetMgmt.dg_date) setDgDate(targetMgmt.dg_date);
          if (targetMgmt.bull_id) setSelectedBullId(targetMgmt.bull_id);
          if (targetMgmt.semen_batch_id) setSelectedBatchId(targetMgmt.semen_batch_id);
          if (targetMgmt.inseminator_name) setInseminatorName(targetMgmt.inseminator_name);
          if (targetMgmt.ecc_ia) setEccIa(targetMgmt.ecc_ia.toFixed(2));
          if (targetMgmt.ecc_dg) setEccDg(targetMgmt.ecc_dg.toFixed(2));
          if (targetMgmt.pregnancy_status && ['prenha', 'vazia', 'inconclusivo'].includes(targetMgmt.pregnancy_status)) {
            setPregnancyStatus(targetMgmt.pregnancy_status as 'prenha' | 'vazia' | 'inconclusivo');
          }
        }
      } catch (err: unknown) {
        console.error('Error loading aux data:', err);
      } finally {
        setLoadingAux(false);
      }
    }

    loadAux();
  }, [isOpen, animalId, management, mode]);

  // Recalcular datas sugeridas do cronograma quando a data D0 ou protocolo mudar
  useEffect(() => {
    if (!startDate) return;
    const d0 = new Date(startDate + 'T00:00:00');
    let d9 = new Date(d0);
    d9.setDate(d9.getDate() + 9);
    let ia = new Date(d0);
    ia.setDate(ia.getDate() + 11);
    let dg = new Date(d0);
    dg.setDate(dg.getDate() + 44);

    const proto = protocols.find((p) => p.id === selectedProtocolId);
    if (proto?.protocol_steps) {
      for (const st of proto.protocol_steps) {
        const target = new Date(d0);
        target.setDate(target.getDate() + st.day_offset);
        const code = st.code.toUpperCase();
        if (code === 'D7' || code === 'D8' || code === 'D9') d9 = target;
        else if (code === 'IA') ia = target;
        else if (code === 'DG' || code === 'DG1') dg = target;
      }
    }

    setCustomD9Date(d9.toISOString().split('T')[0]);
    setCustomIaDate(ia.toISOString().split('T')[0]);
    setCustomDgDate(dg.toISOString().split('T')[0]);
  }, [startDate, selectedProtocolId, protocols]);

  // Effective management (either passed via prop or loaded automatically)
  const effectiveMgmt = activeMgmt || management;

  // Filtered semen batches by selected bull
  const availableBatches = semenBatches.filter(
    (b) => !selectedBullId || (b.bulls as Record<string, unknown> | null)?.id === selectedBullId || b.id === selectedBatchId
  );

  // Preview expected parturition date in DG mode
  const previewParturition = (() => {
    if (pregnancyStatus !== 'prenha') return null;
    const baseDate = effectiveMgmt?.ia_executed_at || effectiveMgmt?.ia_date || iaDate;
    if (baseDate) {
      const d = new Date(baseDate + 'T00:00:00');
      d.setDate(d.getDate() + 295);
      const day = String(d.getDate()).padStart(2, '0');
      const mon = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${mon}/${year}`;
    }
    // Caso de DG direto sem data de IA registrada prévia: estimativa baseada no exame (+250d)
    if (dgDate) {
      const d = new Date(dgDate + 'T00:00:00');
      d.setDate(d.getDate() + 250);
      const day = String(d.getDate()).padStart(2, '0');
      const mon = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${mon}/${year} (Previsão Estimada)`;
    }
    return null;
  })();

  // Handlers
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    try {
      if (currentMode === 'start') {
        if (!selectedProtocolId || !startDate) {
          setErrorMsg('Selecione o protocolo hormonal e a data D0.');
          setSubmitting(false);
          return;
        }

        const res = await startAnimalManagement({
          animal_id: animalId,
          farm_id: farmId,
          protocol_id: selectedProtocolId,
          season_id: selectedSeasonId || null,
          start_date: startDate,
          d0_responsible: responsibleName,
          d0_executed: d0Executed,
          notes: startNotes,
          custom_d9_date: customD9Date || null,
          custom_ia_date: customIaDate || null,
          custom_dg_date: customDgDate || null,
        });

        if (!res.success) {
          setErrorMsg(res.error || 'Erro ao iniciar manejo individual.');
          setSubmitting(false);
          return;
        }

        onSuccess();
        onClose();
      } else if (currentMode === 'step_d9') {
        if (!effectiveMgmt?.id) {
          setErrorMsg('Nenhum protocolo ativo encontrado para registrar a etapa D9.');
          setSubmitting(false);
          return;
        }
        const ok = await executeStepD9(effectiveMgmt.id, {
          executed_at: d9Date,
          responsible: d9Responsible,
          device_loss: d9DeviceLoss,
          notes: d9Notes,
        });

        if (!ok) {
          setErrorMsg('Erro ao registrar etapa D9.');
          setSubmitting(false);
          return;
        }

        onSuccess();
        onClose();
      } else if (currentMode === 'step_ia') {
        if (!effectiveMgmt?.id) {
          setErrorMsg('Nenhum protocolo ativo encontrado para registrar a IA.');
          setSubmitting(false);
          return;
        }
        const res = await executeStepIA(effectiveMgmt.id, {
          animal_id: animalId,
          executed_at: iaDate,
          bull_id: selectedBullId || null,
          semen_batch_id: selectedBatchId || null,
          inseminator_name: inseminatorName,
          ecc_ia: eccIa ? parseFloat(eccIa) : null,
          notes: iaNotes,
        });

        if (!res.success) {
          setErrorMsg(res.error || 'Erro ao registrar Inseminação Artificial.');
          setSubmitting(false);
          return;
        }

        onSuccess();
        onClose();
      } else if (currentMode === 'step_dg') {
        // Diagnóstico de Gestação (DG) - Suporta tanto com protocolo prévio quanto DG direto (toque avulso)
        const res = await recordDirectDG({
          animal_id: animalId,
          farm_id: farmId,
          dg_date: dgDate,
          pregnancy_status: pregnancyStatus,
          ecc_dg: eccDg ? parseFloat(eccDg) : null,
          notes: dgNotes,
          management_id: effectiveMgmt?.id || null,
        });

        if (!res.success) {
          setErrorMsg(res.error || 'Erro ao registrar Diagnóstico de Gestação.');
          setSubmitting(false);
          return;
        }

        onSuccess();
        onClose();
      }
    } catch (err: unknown) {
      console.error('Submit error:', err);
      const msg = err instanceof Error ? err.message : 'Ocorreu um erro inesperado.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
      <div className="glass-card w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-8 space-y-5 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-black text-lg shadow-md">
              {animalTag}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Syringe className="w-5 h-5 text-emerald-400" />
                {currentMode === 'start' && 'Novo Manejo / Protocolo'}
                {currentMode === 'step_d9' && 'Etapa Retirada / Indutores (D9)'}
                {currentMode === 'step_ia' && 'Inseminação Artificial (IA)'}
                {currentMode === 'step_dg' && 'Diagnóstico de Gestação (DG)'}
              </h3>
              <p className="text-xs text-slate-400">
                Matriz Brinco <strong className="text-emerald-400">{animalTag}</strong>
                {effectiveMgmt?.cycle_number && ` • ${effectiveMgmt.cycle_number}ª IATF`}
                {effectiveMgmt?.status === 'em_andamento' && (
                  <span className="ml-2 text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold">
                    Em andamento
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {animalId && (
              <Link
                href={`/animals/${animalId}`}
                title="Abrir ficha e histórico completo desta matriz"
                className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-emerald-400 bg-slate-800/80 hover:bg-slate-800 px-3 py-1.5 rounded-xl transition-colors border border-slate-700/60"
              >
                <span>Ficha completa</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Step Tabs - Sempre visíveis para livre escolha de qualquer etapa */}
        <div className="flex items-center gap-1 p-1 bg-slate-950/80 rounded-2xl border border-slate-800 overflow-x-auto">
          <button
            type="button"
            onClick={() => setCurrentMode('start')}
            className={`flex-1 min-w-26.25 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              currentMode === 'start'
                ? 'bg-emerald-500 text-slate-950 shadow-md glow-emerald'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span>D0 (Início)</span>
            {effectiveMgmt?.d0_executed_at && (
              <CheckCircle2 className={`w-3.5 h-3.5 ${currentMode === 'start' ? 'text-slate-950' : 'text-emerald-400'}`} />
            )}
          </button>

          <button
            type="button"
            onClick={() => setCurrentMode('step_d9')}
            className={`flex-1 min-w-26.25 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              currentMode === 'step_d9'
                ? 'bg-emerald-500 text-slate-950 shadow-md glow-emerald'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span>Retirada (D9)</span>
            {effectiveMgmt?.d9_executed_at && (
              <CheckCircle2 className={`w-3.5 h-3.5 ${currentMode === 'step_d9' ? 'text-slate-950' : 'text-emerald-400'}`} />
            )}
          </button>

          <button
            type="button"
            onClick={() => setCurrentMode('step_ia')}
            className={`flex-1 min-w-27.5 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              currentMode === 'step_ia'
                ? 'bg-emerald-500 text-slate-950 shadow-md glow-emerald'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span>Inseminar (IA)</span>
            {effectiveMgmt?.ia_executed_at && (
              <CheckCircle2 className={`w-3.5 h-3.5 ${currentMode === 'step_ia' ? 'text-slate-950' : 'text-emerald-400'}`} />
            )}
          </button>

          <button
            type="button"
            onClick={() => setCurrentMode('step_dg')}
            className={`flex-1 min-w-31.25 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              currentMode === 'step_dg'
                ? 'bg-emerald-500 text-slate-950 shadow-md glow-emerald'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span>Diagnóstico (DG)</span>
            {effectiveMgmt?.dg_executed_at && (
              <CheckCircle2 className={`w-3.5 h-3.5 ${currentMode === 'step_dg' ? 'text-slate-950' : 'text-emerald-400'}`} />
            )}
          </button>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {loadingAux ? (
          <div className="flex items-center justify-center py-12 text-slate-400 gap-2 text-sm">
            <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
            Carregando dados reprodutivos...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* ============================================================ */}
            {/* MODO START: INICIAR NOVO PROTOCOLO                           */}
            {/* ============================================================ */}
            {currentMode === 'start' && (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Protocolo Reprodutivo Hormonal *
                    </label>
                    <select
                      value={selectedProtocolId}
                      onChange={(e) => setSelectedProtocolId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                      required
                    >
                      {protocols.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.number_of_managements || 3} manejos)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                        Data D0 (Início) *
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Estação Reprodutiva
                      </label>
                      <select
                        value={selectedSeasonId}
                        onChange={(e) => setSelectedSeasonId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      >
                        {seasons.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} {s.status === 'active' ? '(Ativa)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-emerald-400" />
                      Responsável / Veterinário
                    </label>
                    <input
                      type="text"
                      value={responsibleName}
                      onChange={(e) => setResponsibleName(e.target.value)}
                      placeholder="Nome do veterinário ou equipe de campo"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="d0ExecutedCheck"
                      checked={d0Executed}
                      onChange={(e) => setD0Executed(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 border-slate-700 bg-slate-900"
                    />
                    <label htmlFor="d0ExecutedCheck" className="text-xs text-slate-300 cursor-pointer select-none">
                      Marcar <strong className="text-emerald-400">D0 (Inserção de Implante P4 + Benzoato)</strong> como já realizado hoje.
                    </label>
                  </div>

                  {/* Cronograma do Protocolo - Livre Escolha das Datas pelo Veterinário */}
                  <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" /> Cronograma do Protocolo (Livre Escolha das Datas)
                      </p>
                      <span className="text-[10px] text-slate-400">
                        Altere as datas livremente se necessário
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Retirada P4 (D9/D8)
                        </label>
                        <input
                          type="date"
                          value={customD9Date}
                          onChange={(e) => setCustomD9Date(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-indigo-300 font-mono focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Inseminação (IA)
                        </label>
                        <input
                          type="date"
                          value={customIaDate}
                          onChange={(e) => setCustomIaDate(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-emerald-300 font-mono focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Diagnóstico (DG)
                        </label>
                        <input
                          type="date"
                          value={customDgDate}
                          onChange={(e) => setCustomDgDate(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-amber-300 font-mono focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      Observações / Anotações
                    </label>
                    <textarea
                      rows={2}
                      value={startNotes}
                      onChange={(e) => setStartNotes(e.target.value)}
                      placeholder="Ex: matriz de primeira cria, condição corporal boa, etc."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </>
            )}

            {/* ============================================================ */}
            {/* MODO STEP_D9: RETIRADA DO IMPLANTE & INDUTORES               */}
            {/* ============================================================ */}
            {currentMode === 'step_d9' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs">
                  Registro da retirada do implante intravaginal de P4 e aplicação dos indutores (PGF2a + eCG + Cipionato de Estradiol).
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      Data Realizada *
                    </label>
                    <input
                      type="date"
                      value={d9Date}
                      onChange={(e) => setD9Date(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-indigo-400" />
                      Responsável
                    </label>
                    <input
                      type="text"
                      value={d9Responsible}
                      onChange={(e) => setD9Responsible(e.target.value)}
                      placeholder="Nome do aplicador"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="deviceLossCheck"
                    checked={d9DeviceLoss}
                    onChange={(e) => setD9DeviceLoss(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-500 focus:ring-rose-400 border-slate-700 bg-slate-900"
                  />
                  <label htmlFor="deviceLossCheck" className="text-xs text-slate-300 cursor-pointer select-none">
                    Houve <strong className="text-rose-400">perda do dispositivo P4</strong> (caiu no pasto ou foi expelido)?
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Observações da Retirada
                  </label>
                  <textarea
                    rows={2}
                    value={d9Notes}
                    onChange={(e) => setD9Notes(e.target.value)}
                    placeholder="Ex: presença de muco, tônus uterino, dosagens administradas..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* MODO STEP_IA: INSEMINAÇÃO ARTIFICIAL                         */}
            {/* ============================================================ */}
            {currentMode === 'step_ia' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                  Registro da Inseminação Artificial. O sistema abaterá automaticamente 1 dose da partida de sêmen selecionada.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                      Data da Inseminação *
                    </label>
                    <input
                      type="date"
                      value={iaDate}
                      onChange={(e) => setIaDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-emerald-400" />
                      Inseminador *
                    </label>
                    <input
                      type="text"
                      value={inseminatorName}
                      onChange={(e) => setInseminatorName(e.target.value)}
                      placeholder="Nome do inseminador"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
                      <Dna className="w-3.5 h-3.5 text-emerald-400" />
                      Touro Reprodutor
                    </label>
                    <select
                      value={selectedBullId}
                      onChange={(e) => {
                        setSelectedBullId(e.target.value);
                        // Auto-select batch if only one
                        const relatedBatches = semenBatches.filter((b) => (b.bulls as Record<string, unknown> | null)?.id === e.target.value);
                        if (relatedBatches.length === 1) setSelectedBatchId(relatedBatches[0].id);
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Selecione o touro...</option>
                      {bulls.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} {b.code ? `(${b.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5 text-emerald-400" />
                      Partida de Sêmen (Saldo)
                    </label>
                    <select
                      value={selectedBatchId}
                      onChange={(e) => setSelectedBatchId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                    >
                      <option value="">Selecione a partida...</option>
                      {availableBatches.map((sb) => {
                        const stock = sb.initial_quantity - (sb.used_quantity || 0) - (sb.lost_quantity || 0);
                        return (
                          <option key={sb.id} value={sb.id}>
                            Partida {sb.batch_number} ({stock} doses disp.)
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                {/* ECC na IA */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Escore de Condição Corporal (ECC na IA)
                    </label>
                    <span className="text-xs font-mono font-bold text-emerald-400">{eccIa}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {['2.25', '2.50', '2.75', '3.00', '3.25', '3.50', '3.75'].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setEccIa(val)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                          eccIa === val
                            ? 'bg-emerald-500 text-slate-950 shadow-md glow-emerald'
                            : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Observações da IA
                  </label>
                  <textarea
                    rows={2}
                    value={iaNotes}
                    onChange={(e) => setIaNotes(e.target.value)}
                    placeholder="Ex: passagem fácil da pipeta, muco cristalino, horário de descongelamento..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* MODO STEP_DG: DIAGNÓSTICO DE GESTAÇÃO                        */}
            {/* ============================================================ */}
            {currentMode === 'step_dg' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                  Registro da ultrassonografia/toque. Caso diagnosticada como Prenha, a Previsão de Parto (IA + 295 dias) será gerada automaticamente.
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Resultado do Diagnóstico *
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setPregnancyStatus('prenha')}
                      className={`py-3 rounded-xl font-bold text-xs flex flex-col items-center gap-1 border transition-all cursor-pointer ${
                        pregnancyStatus === 'prenha'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500 shadow-md shadow-emerald-500/20 glow-emerald'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <span>Prenha</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPregnancyStatus('vazia')}
                      className={`py-3 rounded-xl font-bold text-xs flex flex-col items-center gap-1 border transition-all cursor-pointer ${
                        pregnancyStatus === 'vazia'
                          ? 'bg-slate-800 text-slate-200 border-slate-600 shadow-md'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <X className="w-5 h-5 text-slate-400" />
                      <span>Vazia</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPregnancyStatus('inconclusivo')}
                      className={`py-3 rounded-xl font-bold text-xs flex flex-col items-center gap-1 border transition-all cursor-pointer ${
                        pregnancyStatus === 'inconclusivo'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-md'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <Clock className="w-5 h-5 text-amber-400" />
                      <span>Inconclusivo</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-amber-400" />
                      Data do Diagnóstico *
                    </label>
                    <input
                      type="date"
                      value={dgDate}
                      onChange={(e) => setDgDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        ECC no Diagnóstico
                      </label>
                      <span className="text-xs font-mono font-bold text-amber-400">{eccDg}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {['2.50', '2.75', '3.00', '3.25', '3.50'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setEccDg(val)}
                          className={`flex-1 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                            eccDg === val
                              ? 'bg-amber-500 text-slate-950 shadow-md'
                              : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Previsão de Parto Box */}
                {pregnancyStatus === 'prenha' && previewParturition && (
                  <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                        <Baby className="w-4 h-4 text-emerald-400" />
                        Previsão de Parto Calculada (RN-06)
                      </span>
                      <span className="text-xs text-slate-500">Gestação média de 295 dias</span>
                    </div>
                    <span className="text-lg font-bold text-emerald-300 font-mono">
                      {previewParturition}
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Observações do Diagnóstico
                  </label>
                  <textarea
                    rows={2}
                    value={dgNotes}
                    onChange={(e) => setDgNotes(e.target.value)}
                    placeholder="Ex: tamanho da vesícula embrionária, batimento cardíaco, corpo lúteo no ovário direito..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold px-5 py-2 rounded-xl text-xs sm:text-sm transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Salvando manejo...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-3" />
                    {currentMode === 'start' && 'Iniciar Protocolo'}
                    {currentMode === 'step_d9' && 'Concluir Retirada (D9)'}
                    {currentMode === 'step_ia' && 'Confirmar Inseminação'}
                    {currentMode === 'step_dg' && 'Confirmar Diagnóstico'}
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
