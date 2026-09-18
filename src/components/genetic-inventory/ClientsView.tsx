'use client';

import React, { useState } from 'react';
import type { GeneticClient, InventoryBalance } from '@/lib/types/genetic-inventory';
import { User, Plus, Phone, Mail, Package, X, RefreshCw } from 'lucide-react';
import { createClientRecord } from '@/lib/services/geneticInventoryService';

interface ClientsViewProps {
  farmId: string;
  clients: GeneticClient[];
  balances: InventoryBalance[];
  onRefresh: () => Promise<void>;
  onStartActionForClient?: (client: GeneticClient) => void;
}

export default function ClientsView({
  farmId,
  clients,
  balances,
  onRefresh,
  onStartActionForClient,
}: ClientsViewProps) {
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    document_number: '',
    phone: '',
    email: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const res = await createClientRecord(farmId, form);
    setSaving(false);
    if (res.success) {
      setShowModal(false);
      setForm({ name: '', document_number: '', phone: '', email: '', notes: '' });
      await onRefresh();
    } else {
      alert(res.error || 'Erro ao cadastrar cliente.');
    }
  };

  // Calcular doses sob custódia de cada cliente
  const clientDosesMap = new Map<string, { totalDoses: number; batchesCount: number }>();
  balances.forEach((b) => {
    if (b.owner_client_id) {
      const cur = clientDosesMap.get(b.owner_client_id) || { totalDoses: 0, batchesCount: 0 };
      cur.totalDoses += b.quantity_available || 0;
      cur.batchesCount += 1;
      clientDosesMap.set(b.owner_client_id, cur);
    }
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <User className="w-5 h-5 text-amber-400" />
            Clientes & Proprietários de Genética sob Custódia
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Gerencie o estoque de terceiros armazenado nos botijões da fazenda com separação contábil rigorosa.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-md self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Novo Cliente
        </button>
      </div>

      {/* Grid de Clientes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {clients.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-400 glass-card rounded-2xl border border-slate-800">
            <User className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-base font-semibold text-slate-300">Nenhum cliente cadastrado.</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Cadastre clientes caso sua fazenda armazene doses de terceiros sob custódia.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs cursor-pointer"
            >
              Cadastrar Cliente
            </button>
          </div>
        ) : (
          clients.map((c) => {
            const stats = clientDosesMap.get(c.id) || { totalDoses: 0, batchesCount: 0 };

            return (
              <div
                key={c.id}
                className="glass-card bg-slate-900/90 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all p-5 flex flex-col justify-between space-y-4 shadow-lg"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-white">{c.name}</h3>
                      {c.document_number && (
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                          CPF/CNPJ: {c.document_number}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      Custódia
                    </span>
                  </div>

                  {/* Contato */}
                  <div className="space-y-1 text-xs text-slate-300 pt-3">
                    {c.phone && (
                      <p className="flex items-center gap-2 text-slate-300">
                        <Phone className="w-3.5 h-3.5 text-slate-400" /> {c.phone}
                      </p>
                    )}
                    {c.email && (
                      <p className="flex items-center gap-2 text-slate-300">
                        <Mail className="w-3.5 h-3.5 text-slate-400" /> {c.email}
                      </p>
                    )}
                  </div>
                </div>

                {/* Métricas sob custódia */}
                <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400">Total em Custódia</span>
                    <p className="font-mono text-base font-black text-amber-400 mt-0.5">
                      {stats.totalDoses} doses
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400">Partidas</span>
                    <p className="font-mono text-sm font-bold text-white mt-0.5">
                      {stats.batchesCount}
                    </p>
                  </div>
                </div>

                {onStartActionForClient && (
                  <button
                    onClick={() => onStartActionForClient(c)}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Package className="w-3.5 h-3.5 text-amber-400" />
                    Entrada / Movimentação do Cliente
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal Novo Cliente */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <User className="w-5 h-5 text-amber-400" />
                Cadastrar Novo Cliente
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Nome Completo / Razão Social *</label>
                <input
                  required
                  type="text"
                  placeholder="Ex: Fazenda Santa Maria / João da Silva"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Documento (CPF ou CNPJ)</label>
                <input
                  type="text"
                  placeholder="Ex: 000.000.000-00"
                  value={form.document_number}
                  onChange={(e) => setForm({ ...form, document_number: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="Ex: (65) 99999-0000"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">E-mail</label>
                  <input
                    type="email"
                    placeholder="cliente@exemplo.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Observações</label>
                <textarea
                  rows={2}
                  placeholder="Observações do contrato de custódia, taxas ou restrições."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {saving ? 'Salvando...' : 'Cadastrar Cliente'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white cursor-pointer text-xs"
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
