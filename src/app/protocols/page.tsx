'use client';

import { useEffect, useState } from 'react';
import { getProtocols, createProtocol, type Protocol } from '@/lib/db';
import { ClipboardList, Plus, RefreshCw, X, CheckCircle2, Clock, Pill, Trash2 } from 'lucide-react';

export default function ProtocolsPage() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // New Protocol Form State
  const [form, setForm] = useState({
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
    const data = await getProtocols();
    setProtocols(data);
    setLoading(false);
  }

  const handleAddStep = () => {
    setForm((f) => ({
      ...f,
      steps: [
        ...f.steps,
        { code: 'D7', name: 'Manejo Intermediário', day_offset: 7, dosage_instruction: '' },
      ],
    }));
  };

  const handleRemoveStep = (index: number) => {
    setForm((f) => ({
      ...f,
      steps: f.steps.filter((_, i) => i !== index),
    }));
  };

  const handleStepChange = (index: number, field: string, value: any) => {
    setForm((f) => {
      const nextSteps = [...f.steps];
      nextSteps[index] = { ...nextSteps[index], [field]: value };
      return { ...f, steps: nextSteps };
    });
  };

  const handleCreateProtocol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || form.steps.length === 0) return;
    setSaving(true);
    const ok = await createProtocol({
      name: form.name,
      description: form.description || undefined,
      number_of_managements: form.number_of_managements,
      steps: form.steps,
    });
    setSaving(false);
    if (ok) {
      setShowModal(false);
      setForm({
        name: '',
        description: '',
        number_of_managements: 3,
        steps: [
          { code: 'D0', name: 'Implante P4 + Benzoato de Estradiol', day_offset: 0, dosage_instruction: '1 implante P4 + 2mg Benzoato IM' },
          { code: 'D9', name: 'PGF2a + eCG + Cipionato', day_offset: 9, dosage_instruction: '150mcg Cloprostenol + 300UI eCG + 0.5mg Cipionato IM' },
          { code: 'IA', name: 'Inseminação Artificial (retirada do implante)', day_offset: 11, dosage_instruction: 'Retirar implante + realizar IA' },
          { code: 'DG', name: 'Diagnóstico de Gestação Ultrassonográfico', day_offset: 44, dosage_instruction: 'DG via ultrassom' },
        ],
      });
      await loadProtocols();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-emerald-400" />
            Gestão de Protocolos Reprodutivos
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Definição de protocolos hormonais, offsets de dias (RN-04) e dosagens de medicamentos.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-md"
        >
          <Plus className="w-4 h-4" /> Novo Protocolo
        </button>
      </div>

      {/* Protocol Cards Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
          Carregando protocolos hormonais do Supabase...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {protocols.map((protocol) => {
            const sortedSteps = [...(protocol.protocol_steps || [])].sort((a, b) => a.day_offset - b.day_offset);
            return (
              <div
                key={protocol.id}
                className="glass-card p-6 rounded-2xl border border-slate-800 bg-slate-900/80 space-y-4 hover:border-slate-700 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {protocol.number_of_managements} Manejos
                    </span>
                    <h2 className="text-lg font-bold text-white mt-2">{protocol.name}</h2>
                    {protocol.description && (
                      <p className="text-xs text-slate-400 mt-1">{protocol.description}</p>
                    )}
                  </div>
                </div>

                {/* Steps Timeline */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                    Etapas do Protocolo
                  </span>
                  <div className="space-y-2">
                    {sortedSteps.map((step) => (
                      <div
                        key={step.id}
                        className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold font-mono text-xs">
                            {step.code}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-200">{step.name}</p>
                            {step.dosage_instruction && (
                              <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <Pill className="w-3 h-3 text-emerald-400" />
                                {step.dosage_instruction}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="font-mono text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                          {step.day_offset === 0 ? 'D0' : `+${step.day_offset} dias`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== New Protocol Modal ===== */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-2xl max-h-[90vh] rounded-2xl border border-slate-700 bg-slate-900 p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                Cadastrar Novo Protocolo Reprodutivo
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProtocol} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Nome do Protocolo *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Ex: PROTOCOLO SUPER PRENHEZ"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Qtd. Manejos
                  </label>
                  <input
                    type="number"
                    min="1"
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
                  placeholder="Ex: Utilizar preferencialmente em novilhas precoces com ECC > 3.0"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Dynamic Steps */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Etapas do Protocolo ({form.steps.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Etapa
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {form.steps.map((step, idx) => (
                    <div key={idx} className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
                      <div className="grid grid-cols-6 gap-2 items-center">
                        <div className="col-span-1">
                          <input
                            type="text"
                            placeholder="D0"
                            value={step.code}
                            onChange={(e) => handleStepChange(idx, 'code', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 text-center font-bold text-white px-2 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="col-span-3">
                          <input
                            type="text"
                            placeholder="Nome da etapa"
                            value={step.name}
                            onChange={(e) => handleStepChange(idx, 'name', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 text-white px-2 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="col-span-1">
                          <input
                            type="number"
                            placeholder="Offset (dias)"
                            value={step.day_offset}
                            onChange={(e) => handleStepChange(idx, 'day_offset', parseInt(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-700 text-center text-white px-2 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="col-span-1 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveStep(idx)}
                            className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Dosagem / Instruções de aplicação (Ex: 2mg Benzoato IM)"
                          value={step.dosage_instruction || ''}
                          onChange={(e) => handleStepChange(idx, 'dosage_instruction', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 text-slate-300 px-2 py-1 rounded-lg focus:outline-none focus:border-emerald-500 text-[11px]"
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
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {saving ? 'Cadastrando...' : 'Salvar Protocolo'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
