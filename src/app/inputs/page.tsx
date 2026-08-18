'use client';

import { useEffect, useState } from 'react';
import { getSemenBatches, getBulls, insertSemenBatch, type SemenBatch, type Bull } from '@/lib/db';
import { Package, Plus, RefreshCw, X, AlertTriangle } from 'lucide-react';

export default function InputsPage() {
  const [semenBatches, setSemenBatches] = useState<SemenBatch[]>([]);
  const [bulls, setBulls] = useState<Bull[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    bull_id: '',
    batch_number: '',
    supplier_central: '',
    initial_quantity: '',
  });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [batches, b] = await Promise.all([getSemenBatches(), getBulls()]);
    setSemenBatches(batches);
    setBulls(b);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.bull_id || !form.batch_number || !form.initial_quantity) return;
    setSaving(true);
    const ok = await insertSemenBatch({
      bull_id: form.bull_id,
      batch_number: form.batch_number,
      supplier_central: form.supplier_central || undefined,
      initial_quantity: parseInt(form.initial_quantity),
    });
    setSaving(false);
    if (ok) {
      setShowModal(false);
      setForm({ bull_id: '', batch_number: '', supplier_central: '', initial_quantity: '' });
      await load();
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-emerald-400" />
            Controle de Estoque & Perdas de Insumos
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Palhetas de sêmen por partida, dispositivos de progesterona (P4) e registro de perdas.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-md"
        >
          <Plus className="w-4 h-4" /> Cadastrar Lote de Sêmen
        </button>
      </div>

      {/* Table */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          Estoque de Sêmen por Touro e Partida
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 gap-3">
            <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
            Carregando estoque do Supabase...
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Touro</th>
                  <th className="p-3">Número da Partida</th>
                  <th className="p-3">Compradas</th>
                  <th className="p-3">Usadas em IA</th>
                  <th className="p-3">Perdas</th>
                  <th className="p-3">Saldo em Estoque</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-900/60 font-mono">
                {semenBatches.map((batch) => {
                  const current = batch.initial_quantity - batch.used_quantity - batch.lost_quantity;
                  const pct = batch.initial_quantity > 0 ? (current / batch.initial_quantity) * 100 : 0;
                  const isLow = current < 10;
                  return (
                    <tr key={batch.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-3 font-sans font-bold text-white">{batch.bulls?.name}</td>
                      <td className="p-3">
                        <span className="bg-slate-800 text-amber-400 border border-slate-700 px-2 py-0.5 rounded">
                          {batch.batch_number}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300">{batch.initial_quantity}</td>
                      <td className="p-3 text-slate-300">{batch.used_quantity}</td>
                      <td className="p-3 text-rose-400 font-bold">{batch.lost_quantity}</td>
                      <td className="p-3">
                        <span className={`font-bold text-sm ${isLow ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {current} palhetas
                        </span>
                        <div className="w-20 bg-slate-800 h-1 rounded-full mt-1 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isLow ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="p-3">
                        {isLow ? (
                          <span className="flex items-center gap-1 text-amber-400 text-[10px] font-sans font-semibold">
                            <AlertTriangle className="w-3 h-3" /> Estoque Baixo
                          </span>
                        ) : (
                          <span className="text-emerald-400 text-[10px] font-sans">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== New Semen Batch Modal ===== */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                Novo Lote de Sêmen
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Touro *</label>
                <select
                  required
                  value={form.bull_id}
                  onChange={(e) => setForm((f) => ({ ...f, bull_id: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione o touro...</option>
                  {bulls.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Número da Partida *</label>
                  <input
                    required
                    type="text"
                    placeholder="Ex: P-2025C"
                    value={form.batch_number}
                    onChange={(e) => setForm((f) => ({ ...f, batch_number: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Qtd. Palhetas *</label>
                  <input
                    required
                    type="number"
                    min="1"
                    placeholder="Ex: 150"
                    value={form.initial_quantity}
                    onChange={(e) => setForm((f) => ({ ...f, initial_quantity: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Central Fornecedora</label>
                <input
                  type="text"
                  placeholder="Ex: CRV Lagoa"
                  value={form.supplier_central}
                  onChange={(e) => setForm((f) => ({ ...f, supplier_central: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {saving ? 'Salvando...' : 'Cadastrar Partida'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white"
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
