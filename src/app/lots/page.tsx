'use client';

import { useEffect, useState } from 'react';
import {
  getLots, getLotAnimals, getProtocols, getProperties, createLot,
  type LotStat, type LotAnimal, type Protocol, type Property
} from '@/lib/db';
import { Layers, Plus, Calendar, Search, RefreshCw, X, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

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
  const [saving, setSaving] = useState(false);

  // New lot form state
  const [form, setForm] = useState({
    code: '',
    property_id: '',
    protocol_id: '',
    start_date: '',
    responsible_name: 'MV. DR. SAMOEL DUARTE',
  });

  useEffect(() => {
    loadLots();
    loadFormData();
  }, []);

  async function loadLots() {
    setLoading(true);
    const data = await getLots();
    setLots(data);
    setLoading(false);
  }

  async function loadFormData() {
    const [p, pr] = await Promise.all([getProtocols(), getProperties()]);
    setProtocols(p);
    setProperties(pr);
  }

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
    }
  }

  const filteredLots = lots.filter(
    (l) =>
      l.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.property_name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.protocol_name ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedLot = lots.find((l) => l.id === selectedLotId);

  return (
    <div className="space-y-6">
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
            className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-md"
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
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
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
              <button onClick={() => setSelectedLotId(null)} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-4 gap-3 text-center text-xs">
              {[
                { label: 'MATRIZES', value: selectedLot.worked_qty, color: 'text-white' },
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

            {/* Animal Table */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-slate-200">
                Matrizes do Lote {loadingAnimals ? '(carregando...)' : `(${lotAnimals.length})`}
              </h3>
              {loadingAnimals ? (
                <div className="flex items-center gap-2 py-8 justify-center text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  Carregando matrizes...
                </div>
              ) : lotAnimals.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-6">Nenhuma matriz alocada neste lote.</p>
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
                      {lotAnimals.map((la) => (
                        <tr key={la.id} className="hover:bg-slate-800/50 transition-colors">
                          <td className="p-3 font-bold text-white">{la.animals?.tag_number}</td>
                          <td className="p-3">{la.animals?.animal_categories?.name ?? '-'}</td>
                          <td className="p-3 font-mono">{la.ecc_ia != null ? la.ecc_ia.toFixed(2) : '-'}</td>
                          <td className="p-3 font-mono">{la.ecc_dg != null ? la.ecc_dg.toFixed(2) : '-'}</td>
                          <td className="p-3 text-emerald-400 font-medium">{la.bulls?.name ?? '-'}</td>
                          <td className="p-3">{la.inseminator_name ?? '-'}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                              la.pregnancy_status === 'prenha'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : la.pregnancy_status === 'vazia'
                                ? 'bg-slate-800 text-slate-400'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {la.pregnancy_status === 'prenha' ? 'Prenha' : la.pregnancy_status === 'vazia' ? 'Vazia' : 'Pendente'}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-emerald-400">{la.expected_parturition_date ?? '-'}</td>
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

      {/* ===== New Lot Modal ===== */}
      {showNewLot && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" /> Novo Lote de IATF
              </h2>
              <button onClick={() => setShowNewLot(false)} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white">
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
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
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
                    <option key={p.id} value={p.id}>{p.name}</option>
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
                const addDays = (n: number) => { const r = new Date(d0); r.setDate(r.getDate() + n); return r.toLocaleDateString('pt-BR'); };
                const ia = steps.find((s) => s.code === 'IA');
                const dg = steps.find((s) => s.code === 'DG');
                return (
                  <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-3 text-xs text-slate-300 space-y-1">
                    <p className="font-semibold text-emerald-400 text-[11px] uppercase tracking-wider">Datas Calculadas Automaticamente (RN-04)</p>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <div className="text-center"><span className="text-slate-500 block">D0</span><strong>{new Date(form.start_date).toLocaleDateString('pt-BR')}</strong></div>
                      {ia && <div className="text-center"><span className="text-slate-500 block">IA</span><strong className="text-emerald-400">{addDays(ia.day_offset)}</strong></div>}
                      {dg && <div className="text-center"><span className="text-slate-500 block">DG</span><strong className="text-blue-400">{addDays(dg.day_offset)}</strong></div>}
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Salvando...</> : <><Plus className="w-4 h-4" /> Criar Lote & Gerar Agenda</>}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewLot(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white transition-all"
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
