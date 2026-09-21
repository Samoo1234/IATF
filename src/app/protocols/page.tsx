'use client';

import { useEffect, useState, useMemo } from 'react';
import { 
  getProtocols, 
  createProtocol, 
  updateProtocol, 
  deleteProtocol, 
  toggleProtocolStatus, 
  type Protocol 
} from '@/lib/db';
import { 
  ClipboardList, Plus, RefreshCw, X, Pill, Trash2, 
  Edit2, Copy, Search, Archive, CheckCircle2, AlertCircle, 
  Sparkles, Clock, Calendar, Check, ArrowRight
} from 'lucide-react';

interface StepFormItem {
  code: string;
  name: string;
  day_offset: number;
  dosage_instruction: string;
}

const DEFAULT_PRESETS: { title: string; desc: string; managements: number; steps: StepFormItem[] }[] = [
  {
    title: 'Tradicional 3 Manejos',
    desc: 'Protocolo clássico D0, D9, IA em 48h com DG no D44.',
    managements: 3,
    steps: [
      { code: 'D0', name: 'Implante P4 + Benzoato de Estradiol', day_offset: 0, dosage_instruction: '1 implante P4 + 2mg Benzoato de Estradiol IM' },
      { code: 'D9', name: 'PGF2a + eCG + Cipionato + Retirada P4', day_offset: 9, dosage_instruction: '150mcg Cloprostenol + 300UI eCG + 0.5mg Cipionato IM' },
      { code: 'IA', name: 'Inseminação Artificial (IATF)', day_offset: 11, dosage_instruction: 'Realizar IA 48h após D9' },
      { code: 'DG', name: 'Diagnóstico de Gestação Ultrassonográfico', day_offset: 44, dosage_instruction: 'DG via ultrassom (30-35 dias após a IA)' },
    ],
  },
  {
    title: '4 Manejos (eCG no D7)',
    desc: 'Protocolo com estímulo folicular intermediário.',
    managements: 4,
    steps: [
      { code: 'D0', name: 'Implante P4 + Benzoato de Estradiol', day_offset: 0, dosage_instruction: '1 implante P4 + 2mg Benzoato de Estradiol IM' },
      { code: 'D7', name: 'Estímulo Folicular eCG + PGF2a', day_offset: 7, dosage_instruction: '300UI eCG + 150mcg Cloprostenol IM' },
      { code: 'D9', name: 'Retirada de P4 + Cipionato de Estradiol', day_offset: 9, dosage_instruction: 'Retirar implante + 0.5mg Cipionato IM' },
      { code: 'IA', name: 'Inseminação Artificial (IATF)', day_offset: 11, dosage_instruction: 'Realizar IA 48h-54h após D9' },
      { code: 'DG', name: 'Diagnóstico de Gestação Ultrassonográfico', day_offset: 44, dosage_instruction: 'DG via ultrassom' },
    ],
  },
  {
    title: 'Novilhas Precoces (D0 / D8)',
    desc: 'Protocolo curto de 8 dias para fêmeas jovens com boa ciclicidade.',
    managements: 3,
    steps: [
      { code: 'D0', name: 'Implante P4 (1º uso) + Benzoato', day_offset: 0, dosage_instruction: 'Implante P4 + 2mg Benzoato de Estradiol IM' },
      { code: 'D8', name: 'Retirada P4 + PGF2a + eCG + Cipionato', day_offset: 8, dosage_instruction: 'Retirar implante + 150mcg Cloprostenol + 250UI eCG + 0.5mg Cipionato IM' },
      { code: 'IA', name: 'Inseminação Artificial (IATF)', day_offset: 10, dosage_instruction: 'Realizar IA 48h após D8' },
      { code: 'DG', name: 'Diagnóstico de Gestação Ultrassonográfico', day_offset: 40, dosage_instruction: 'DG via ultrassom (30 dias pós IA)' },
    ],
  },
];

export default function ProtocolsPage() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProtocolId, setEditingProtocolId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterManagements, setFilterManagements] = useState<'all' | '3' | '4' | 'other'>('all');
  const [filterStatus, setFilterStatus] = useState<'active' | 'archived' | 'all'>('active');

  // Protocol Form State
  const [form, setForm] = useState<{
    name: string;
    description: string;
    number_of_managements: number;
    steps: StepFormItem[];
  }>({
    name: '',
    description: '',
    number_of_managements: 3,
    steps: [
      { code: 'D0', name: 'Implante P4 + Benzoato de Estradiol', day_offset: 0, dosage_instruction: '1 implante P4 + 2mg Benzoato IM' },
      { code: 'D9', name: 'PGF2a + eCG + Cipionato', day_offset: 9, dosage_instruction: '150mcg Cloprostenol + 300UI eCG + 0.5mg Cipionato IM' },
      { code: 'IA', name: 'Inseminação Artificial (retirada do implante)', day_offset: 11, dosage_instruction: 'Retirar implante + realizar IA 48h-54h após D9' },
      { code: 'DG', name: 'Diagnóstico de Gestação Ultrassonográfico', day_offset: 44, dosage_instruction: 'DG via ultrassom (30-35 dias após a IA)' },
    ],
  });

  useEffect(() => {
    loadProtocols();
  }, []);

  async function loadProtocols() {
    setLoading(true);
    // Fetch all (active and archived) so filterStatus can toggle without refetch lag
    const data = await getProtocols(true, true);
    setProtocols(data);
    setLoading(false);
  }

  const resetForm = () => {
    setEditingProtocolId(null);
    setForm({
      name: '',
      description: '',
      number_of_managements: 3,
      steps: [
        { code: 'D0', name: 'Implante P4 + Benzoato de Estradiol', day_offset: 0, dosage_instruction: '1 implante P4 + 2mg Benzoato IM' },
        { code: 'D9', name: 'PGF2a + eCG + Cipionato', day_offset: 9, dosage_instruction: '150mcg Cloprostenol + 300UI eCG + 0.5mg Cipionato IM' },
        { code: 'IA', name: 'Inseminação Artificial (retirada do implante)', day_offset: 11, dosage_instruction: 'Retirar implante + realizar IA 48h-54h após D9' },
        { code: 'DG', name: 'Diagnóstico de Gestação Ultrassonográfico', day_offset: 44, dosage_instruction: 'DG via ultrassom' },
      ],
    });
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const handleOpenEdit = (p: Protocol) => {
    setEditingProtocolId(p.id);
    const sortedSteps = [...(p.protocol_steps || [])].sort((a, b) => a.day_offset - b.day_offset);
    setForm({
      name: p.name,
      description: p.description || '',
      number_of_managements: p.number_of_managements || 3,
      steps: sortedSteps.map((s) => ({
        code: s.code,
        name: s.name,
        day_offset: s.day_offset,
        dosage_instruction: s.dosage_instruction || '',
      })),
    });
    setShowModal(true);
  };

  const handleDuplicate = (p: Protocol) => {
    setEditingProtocolId(null);
    const sortedSteps = [...(p.protocol_steps || [])].sort((a, b) => a.day_offset - b.day_offset);
    setForm({
      name: `${p.name} (Cópia)`,
      description: p.description || '',
      number_of_managements: p.number_of_managements || 3,
      steps: sortedSteps.map((s) => ({
        code: s.code,
        name: s.name,
        day_offset: s.day_offset,
        dosage_instruction: s.dosage_instruction || '',
      })),
    });
    setShowModal(true);
  };

  const handleApplyPreset = (preset: typeof DEFAULT_PRESETS[0]) => {
    setForm((f) => ({
      ...f,
      name: f.name || preset.title,
      description: f.description || preset.desc,
      number_of_managements: preset.managements,
      steps: preset.steps.map((s) => ({ ...s })),
    }));
  };

  const handleAddStep = () => {
    setForm((f) => {
      const lastOffset = f.steps.length > 0 ? f.steps[f.steps.length - 1].day_offset : 0;
      return {
        ...f,
        steps: [
          ...f.steps,
          { code: `D${lastOffset + 2}`, name: 'Manejo Adicional', day_offset: lastOffset + 2, dosage_instruction: '' },
        ],
      };
    });
  };

  const handleRemoveStep = (index: number) => {
    if (form.steps.length <= 1) {
      alert('O protocolo deve conter pelo menos uma etapa.');
      return;
    }
    setForm((f) => ({
      ...f,
      steps: f.steps.filter((_, i) => i !== index),
    }));
  };

  const handleStepChange = (index: number, field: keyof StepFormItem, value: string | number) => {
    setForm((f) => {
      const nextSteps = [...f.steps];
      nextSteps[index] = { ...nextSteps[index], [field]: value };
      return { ...f, steps: nextSteps };
    });
  };

  const handleSaveProtocol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || form.steps.length === 0) {
      setFeedbackMsg({ type: 'error', text: 'Informe o nome do protocolo e adicione ao menos uma etapa.' });
      return;
    }

    setSaving(true);
    let success = false;

    if (editingProtocolId) {
      success = await updateProtocol(editingProtocolId, {
        name: form.name,
        description: form.description || null,
        number_of_managements: form.number_of_managements,
        steps: form.steps,
      });
    } else {
      success = await createProtocol({
        name: form.name,
        description: form.description || undefined,
        number_of_managements: form.number_of_managements,
        steps: form.steps,
      });
    }
    setSaving(false);

    if (success) {
      setShowModal(false);
      resetForm();
      setFeedbackMsg({
        type: 'success',
        text: editingProtocolId ? 'Protocolo atualizado com sucesso!' : 'Protocolo cadastrado com sucesso!',
      });
      await loadProtocols();
      setTimeout(() => setFeedbackMsg(null), 4000);
    } else {
      setFeedbackMsg({ type: 'error', text: 'Erro ao salvar protocolo reprodutivo.' });
    }
  };

  const handleDeleteProtocol = async (p: Protocol) => {
    if (!confirm(`Deseja realmente excluir o protocolo "${p.name}"?\n\nEsta ação só poderá ser concluída se não houver lotes de IATF vinculados a ele.`)) {
      return;
    }

    setSaving(true);
    const res = await deleteProtocol(p.id);
    setSaving(false);

    if (res.success) {
      setFeedbackMsg({ type: 'success', text: `Protocolo "${p.name}" excluído com sucesso!` });
      await loadProtocols();
      setTimeout(() => setFeedbackMsg(null), 4000);
    } else {
      setFeedbackMsg({ type: 'error', text: res.error || 'Erro ao excluir protocolo.' });
    }
  };

  const handleToggleStatus = async (p: Protocol) => {
    const isArchived = p.status === 'archived';
    const targetStatus = isArchived ? 'active' : 'archived';
    const actionLabel = isArchived ? 'reativar' : 'arquivar';

    if (!confirm(`Deseja realmente ${actionLabel} o protocolo "${p.name}"?`)) return;

    setSaving(true);
    const ok = await toggleProtocolStatus(p.id, targetStatus);
    setSaving(false);

    if (ok) {
      setFeedbackMsg({
        type: 'success',
        text: isArchived ? `Protocolo "${p.name}" reativado com sucesso!` : `Protocolo "${p.name}" arquivado com sucesso!`,
      });
      await loadProtocols();
      setTimeout(() => setFeedbackMsg(null), 4000);
    } else {
      setFeedbackMsg({ type: 'error', text: `Erro ao ${actionLabel} protocolo.` });
    }
  };

  // Filtered protocols
  const filteredProtocols = useMemo(() => {
    return protocols.filter((p) => {
      // Status Filter
      if (filterStatus === 'active' && p.status === 'archived') return false;
      if (filterStatus === 'archived' && p.status !== 'archived') return false;

      // Managements Filter
      if (filterManagements === '3' && p.number_of_managements !== 3) return false;
      if (filterManagements === '4' && p.number_of_managements !== 4) return false;
      if (filterManagements === 'other' && (p.number_of_managements === 3 || p.number_of_managements === 4)) return false;

      // Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchDesc = p.description?.toLowerCase().includes(q) ?? false;
        const matchSteps = p.protocol_steps?.some(
          (s) => s.code.toLowerCase().includes(q) ||
                 s.name.toLowerCase().includes(q) ||
                 (s.dosage_instruction && s.dosage_instruction.toLowerCase().includes(q))
        ) ?? false;
        return matchName || matchDesc || matchSteps;
      }

      return true;
    });
  }, [protocols, filterStatus, filterManagements, searchQuery]);

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
            <ClipboardList className="w-6 h-6 text-emerald-400" />
            Gestão de Protocolos Reprodutivos
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Definição de protocolos hormonais, cronogramas de manejos (RN-04), dosagens e fármacos aplicados.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/20 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" /> Novo Protocolo
        </button>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por protocolo, fármaco ou etapa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 pl-8 pr-7 py-2 rounded-xl focus:outline-none focus:border-emerald-500 placeholder:text-slate-600"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Managements filter chips */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setFilterManagements('all')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                filterManagements === 'all' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterManagements('3')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                filterManagements === '3' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              3 Manejos
            </button>
            <button
              onClick={() => setFilterManagements('4')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                filterManagements === '4' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              4 Manejos
            </button>
          </div>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs self-start md:self-auto">
          <button
            onClick={() => setFilterStatus('active')}
            className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              filterStatus === 'active' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Ativos ({protocols.filter((p) => p.status !== 'archived').length})
          </button>
          <button
            onClick={() => setFilterStatus('archived')}
            className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
              filterStatus === 'archived' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Archive className="w-3 h-3" />
            Arquivados ({protocols.filter((p) => p.status === 'archived').length})
          </button>
        </div>
      </div>

      {/* Protocol Cards Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
          Carregando protocolos reprodutivos...
        </div>
      ) : filteredProtocols.length === 0 ? (
        <div className="glass-card p-12 text-center rounded-2xl border border-slate-800 space-y-3">
          <ClipboardList className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-slate-400 text-sm font-medium">Nenhum protocolo encontrado com os filtros selecionados.</p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-emerald-400 hover:underline cursor-pointer"
            >
              Limpar busca
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredProtocols.map((protocol) => {
            const sortedSteps = [...(protocol.protocol_steps || [])].sort((a, b) => a.day_offset - b.day_offset);
            const isArchived = protocol.status === 'archived';
            const iaStep = sortedSteps.find((s) => s.code.toUpperCase() === 'IA');
            const dgStep = sortedSteps.find((s) => s.code.toUpperCase() === 'DG');

            return (
              <div
                key={protocol.id}
                className={`glass-card p-6 rounded-2xl border bg-slate-900/80 space-y-4 transition-all flex flex-col justify-between ${
                  isArchived ? 'border-slate-800/60 opacity-75' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 overflow-hidden">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {protocol.number_of_managements} Manejos
                        </span>
                        {isArchived ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                            <Archive className="w-3 h-3" /> Arquivado
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Ativo
                          </span>
                        )}
                        {iaStep && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/60">
                            IA em D{iaStep.day_offset}
                          </span>
                        )}
                      </div>

                      <h2 className="text-lg font-bold text-white mt-1.5 truncate">{protocol.name}</h2>
                      {protocol.description ? (
                        <p className="text-xs text-slate-400 line-clamp-2">{protocol.description}</p>
                      ) : (
                        <p className="text-xs text-slate-500 italic">Sem observações técnicas informadas.</p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(protocol)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Editar protocolo e etapas"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(protocol)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Duplicar protocolo (criar cópia)"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(protocol)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          isArchived 
                            ? 'text-sky-400 hover:bg-sky-950/50' 
                            : 'text-slate-400 hover:text-amber-400 hover:bg-slate-800'
                        }`}
                        title={isArchived ? 'Reativar protocolo' : 'Arquivar protocolo'}
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProtocol(protocol)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Excluir protocolo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Steps Timeline */}
                  <div className="space-y-2 pt-3 mt-3 border-t border-slate-800/80">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      <span>Etapas do Protocolo ({sortedSteps.length})</span>
                      {dgStep && (
                        <span className="text-[10px] lowercase font-normal text-slate-500">
                          Ciclo completo: {dgStep.day_offset} dias
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      {sortedSteps.map((step) => (
                        <div
                          key={step.id || `${step.code}-${step.day_offset}`}
                          className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs hover:border-slate-700/80 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold font-mono text-[11px] shrink-0">
                              {step.code}
                            </div>
                            <div className="overflow-hidden">
                              <p className="font-semibold text-slate-200 truncate">{step.name}</p>
                              {step.dosage_instruction ? (
                                <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                                  <Pill className="w-3 h-3 text-emerald-400 shrink-0" />
                                  <span className="truncate">{step.dosage_instruction}</span>
                                </p>
                              ) : (
                                <p className="text-[10px] text-slate-500 italic">Sem instrução de dosagem</p>
                              )}
                            </div>
                          </div>
                          <span className="font-mono text-[11px] text-slate-300 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800 shrink-0 ml-2">
                            {step.day_offset === 0 ? 'D0' : `+${step.day_offset}d`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Atualizado no sistema</span>
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(protocol)}
                    className="text-emerald-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    Editar detalhes <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Create / Edit Protocol Modal ===== */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-2xl max-h-[90vh] rounded-2xl border border-slate-700 bg-slate-900 p-6 overflow-y-auto space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-emerald-400" />
                  {editingProtocolId ? 'Editar Protocolo Reprodutivo' : 'Cadastrar Novo Protocolo'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure as etapas hormonais, dias de manejo e instruções de aplicação.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Presets Bar (only shown when creating a new protocol) */}
            {!editingProtocolId && (
              <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Carregar Modelos Prontos (Presets)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {DEFAULT_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/40 text-left transition-all cursor-pointer group"
                    >
                      <p className="font-bold text-xs text-slate-200 group-hover:text-emerald-400 transition-colors">
                        {preset.title}
                      </p>
                      <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{preset.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSaveProtocol} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Nome do Protocolo *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Ex: PROTOCOLO SUPER PRENHEZ 3M"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Qtd. de Manejos
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={form.number_of_managements}
                    onChange={(e) => setForm((f) => ({ ...f, number_of_managements: parseInt(e.target.value) || 3 }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Descrição / Observações Técnicas
                </label>
                <input
                  type="text"
                  placeholder="Ex: Recomendado para novilhas ou vacas paridas com ECC > 2.75"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Dynamic Steps Builder */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    Etapas do Cronograma ({form.steps.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Etapa
                  </button>
                </div>

                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {form.steps.map((step, idx) => (
                    <div key={idx} className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-2">
                          <label className="block text-[10px] text-slate-500 mb-0.5">Código</label>
                          <input
                            type="text"
                            required
                            placeholder="D0"
                            value={step.code}
                            onChange={(e) => handleStepChange(idx, 'code', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 text-center font-bold text-white px-2 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500 uppercase"
                          />
                        </div>
                        <div className="col-span-6">
                          <label className="block text-[10px] text-slate-500 mb-0.5">Nome do Manejo</label>
                          <input
                            type="text"
                            required
                            placeholder="Nome da etapa (Ex: Implante P4 + BE)"
                            value={step.name}
                            onChange={(e) => handleStepChange(idx, 'name', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 text-white px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="block text-[10px] text-slate-500 mb-0.5">Offset (dias)</label>
                          <input
                            type="number"
                            min="0"
                            required
                            placeholder="0"
                            value={step.day_offset}
                            onChange={(e) => handleStepChange(idx, 'day_offset', parseInt(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-700 text-center text-white px-2 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500 font-mono"
                          />
                        </div>
                        <div className="col-span-1 text-right pt-4">
                          <button
                            type="button"
                            onClick={() => handleRemoveStep(idx)}
                            className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                            title="Remover etapa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Dosagens e instruções (Ex: 1 implante P4 + 2mg Benzoato de Estradiol IM)"
                          value={step.dosage_instruction}
                          onChange={(e) => handleStepChange(idx, 'dosage_instruction', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 text-slate-300 px-2.5 py-1 rounded-lg focus:outline-none focus:border-emerald-500 text-[11px]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-800">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm cursor-pointer shadow-md shadow-emerald-500/20"
                >
                  {saving ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : editingProtocolId ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {saving
                    ? (editingProtocolId ? 'Salvando...' : 'Cadastrando...')
                    : editingProtocolId
                    ? 'Salvar Alterações'
                    : 'Cadastrar Protocolo'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm cursor-pointer"
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
