'use client';

import React, { useState, useEffect } from 'react';
import type { 
  GeneticMaterialType, 
  SexingType, 
  PackageType, 
  CryopreservationType, 
  SemenTank, 
  TankCanister, 
  InventoryBalance, 
  GeneticClient, 
  GeneticCenter 
} from '@/lib/types/genetic-inventory';
import { 
  X, 
  Plus, 
  LogOut, 
  ArrowRightLeft, 
  AlertCircle, 
  RefreshCw, 
  Layers 
} from 'lucide-react';
import { 
  processInbound, 
  processOutbound, 
  processTransfer, 
  processAdjustment, 
  getCanisters 
} from '@/lib/services/geneticInventoryService';
import type { Bull } from '@/lib/db';

export type MovementWizardMode = 'inbound' | 'outbound' | 'transfer' | 'adjustment';

interface MovementWizardProps {
  farmId: string;
  initialMode?: MovementWizardMode;
  tanks: SemenTank[];
  clients: GeneticClient[];
  centers: GeneticCenter[];
  bulls: Bull[];
  balances: InventoryBalance[];
  prefill?: {
    tankId?: string;
    canisterId?: string;
    batchId?: string;
    balanceId?: string;
    materialType?: GeneticMaterialType;
  } | null;
  onSuccess: (result?: { action: string; [key: string]: unknown }) => void;
  onClose: () => void;
}

export default function MovementWizard({
  farmId,
  initialMode = 'inbound',
  tanks,
  clients,
  centers,
  bulls,
  balances,
  prefill,
  onSuccess,
  onClose,
}: MovementWizardProps) {
  const [activeTab, setActiveTab] = useState<MovementWizardMode>(initialMode);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Canecas dinâmicas
  const [sourceCanisters, setSourceCanisters] = useState<TankCanister[]>([]);
  const [destCanisters, setDestCanisters] = useState<TankCanister[]>([]);

  // ==========================================
  // ESTADO — ENTRADA (INBOUND)
  // ==========================================
  const [inboundType, setInboundType] = useState<GeneticMaterialType>('SEMEN');
  const [inboundIsNew, setInboundIsNew] = useState(true);
  const [inboundSelectedBalanceId, setInboundSelectedBalanceId] = useState('');
  
  // Novo material
  const [inboundSireId, setInboundSireId] = useState(bulls[0]?.id || '');
  const [inboundDonorName, setInboundDonorName] = useState('');
  const [inboundDonorRgd, setInboundDonorRgd] = useState('');
  const [inboundSexing, setInboundSexing] = useState<SexingType>('convencional');
  const [inboundPackageType, setInboundPackageType] = useState<PackageType>('palheta_025');
  const [inboundCryo, setInboundCryo] = useState<CryopreservationType>('nao_aplicavel');
  const [inboundBatchNumber, setInboundBatchNumber] = useState('');
  const [inboundRackCode, setInboundRackCode] = useState('');
  const [inboundCenterId, setInboundCenterId] = useState(centers[0]?.id || '');
  const [inboundCost, setInboundCost] = useState('');

  // Destino
  const [inboundTankId, setInboundTankId] = useState(prefill?.tankId || tanks[0]?.id || '');
  const [inboundCanisterId, setInboundCanisterId] = useState(prefill?.canisterId || '');
  const [inboundOwnerClientId, setInboundOwnerClientId] = useState('');
  const [inboundQuantity, setInboundQuantity] = useState('');
  const [inboundReason, setInboundReason] = useState('Compra de material genético');
  const [inboundNotes, setInboundNotes] = useState('');
  const [inboundDate, setInboundDate] = useState(new Date().toISOString().slice(0, 10));

  // ==========================================
  // ESTADO — SAÍDA / RETIRADA (OUTBOUND)
  // ==========================================
  const [outboundBalanceId, setOutboundBalanceId] = useState(prefill?.balanceId || '');
  const [outboundQuantity, setOutboundQuantity] = useState('');
  const [outboundReason, setOutboundReason] = useState('Inseminação Artificial em Campo');
  const [outboundRecipientName, setOutboundRecipientName] = useState('MV. Dr. Samoel Duarte');
  const [outboundRecipientDoc, setOutboundRecipientDoc] = useState('');
  const [outboundNotes, setOutboundNotes] = useState('');
  const [outboundDate, setOutboundDate] = useState(new Date().toISOString().slice(0, 10));

  // ==========================================
  // ESTADO — TRANSFERÊNCIA (TRANSFER)
  // ==========================================
  const [transferBalanceId, setTransferBalanceId] = useState(prefill?.balanceId || '');
  const [transferDestTankId, setTransferDestTankId] = useState('');
  const [transferDestCanisterId, setTransferDestCanisterId] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('');
  const [transferReason, setTransferReason] = useState('Remanejamento interno de caneca/botijão');
  const [transferNotes, setTransferNotes] = useState('');

  // ==========================================
  // ESTADO — AJUSTE / PERDA (ADJUSTMENT)
  // ==========================================
  const [adjBalanceId, setAdjBalanceId] = useState(prefill?.balanceId || '');
  const [adjIsPositive, setAdjIsPositive] = useState(false);
  const [adjIsLoss, setAdjIsLoss] = useState(false);
  const [adjQuantity, setAdjQuantity] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjNotes, setAdjNotes] = useState('');

  // Carregar canecas do botijão de entrada
  useEffect(() => {
    if (inboundTankId) {
      getCanisters(inboundTankId).then((list) => {
        setSourceCanisters(list);
        if (list.length > 0 && !prefill?.canisterId) {
          setInboundCanisterId(list[0].id);
        }
      });
    }
  }, [inboundTankId, prefill?.canisterId]);

  // Carregar canecas do botijão de destino de transferência
  useEffect(() => {
    if (transferDestTankId) {
      getCanisters(transferDestTankId).then((list) => {
        setDestCanisters(list);
        if (list.length > 0) {
          setTransferDestCanisterId(list[0].id);
        }
      });
    }
  }, [transferDestTankId]);

  // Carregar preenchimento inicial de balanço para saída/transferência se informado
  useEffect(() => {
    if (prefill?.balanceId) {
      setOutboundBalanceId(prefill.balanceId);
      setTransferBalanceId(prefill.balanceId);
      setAdjBalanceId(prefill.balanceId);
    }
  }, [prefill]);

  // Obter detalhes do saldo selecionado para saída
  const selectedOutboundBalance = balances.find((b) => b.id === outboundBalanceId);
  const selectedTransferBalance = balances.find((b) => b.id === transferBalanceId);
  const selectedAdjBalance = balances.find((b) => b.id === adjBalanceId);

  // Submeter Entrada
  const handleInboundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const qty = parseInt(inboundQuantity);
    if (!qty || qty <= 0) {
      setErrorMsg('Informe uma quantidade válida maior que zero.');
      return;
    }
    if (!inboundCanisterId) {
      setErrorMsg('Selecione uma caneca de destino.');
      return;
    }

    setSubmitting(true);
    let payload: Parameters<typeof processInbound>[1];

    if (inboundIsNew) {
      if (!inboundBatchNumber.trim()) {
        setErrorMsg('O número da partida/lote é obrigatório.');
        setSubmitting(false);
        return;
      }
      payload = {
        isNewMaterial: true,
        materialType: inboundType,
        sireId: inboundType === 'SEMEN' ? inboundSireId : undefined,
        donorName: inboundType === 'EMBRYO' ? inboundDonorName : undefined,
        donorRgd: inboundType === 'EMBRYO' ? inboundDonorRgd : undefined,
        sexing: inboundSexing,
        packageType: inboundPackageType,
        cryopreservation: inboundCryo,
        centerId: inboundCenterId || undefined,
        batchNumber: inboundBatchNumber.trim(),
        rackCode: inboundRackCode.trim() || undefined,
        costPerUnit: inboundCost ? parseFloat(inboundCost) : 0,
        tankId: inboundTankId,
        canisterId: inboundCanisterId,
        ownerClientId: inboundOwnerClientId || null,
        quantity: qty,
        reason: inboundReason,
        notes: inboundNotes || undefined,
        occurredAt: new Date(inboundDate).toISOString(),
      };
    } else {
      const b = balances.find((x) => x.id === inboundSelectedBalanceId);
      if (!b) {
        setErrorMsg('Selecione o lote cadastrado.');
        setSubmitting(false);
        return;
      }
      payload = {
        isNewMaterial: false,
        batchId: b.batch_id,
        materialType: b.genetic_material_batches?.genetic_materials?.type || 'SEMEN',
        tankId: inboundTankId,
        canisterId: inboundCanisterId,
        ownerClientId: inboundOwnerClientId || null,
        quantity: qty,
        reason: inboundReason,
        notes: inboundNotes || undefined,
        occurredAt: new Date(inboundDate).toISOString(),
      };
    }

    const res = await processInbound(farmId, payload);
    setSubmitting(false);
    if (res.success) {
      onSuccess({ action: 'inbound', movementId: res.movementId });
      onClose();
    } else {
      setErrorMsg(res.error || 'Erro ao registrar entrada de material.');
    }
  };

  // Submeter Saída
  const handleOutboundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!selectedOutboundBalance) {
      setErrorMsg('Selecione o lote do qual será feita a retirada.');
      return;
    }
    const qty = parseInt(outboundQuantity);
    if (!qty || qty <= 0) {
      setErrorMsg('Informe uma quantidade válida.');
      return;
    }
    if (qty > selectedOutboundBalance.quantity_available) {
      setErrorMsg(`Quantidade solicitada (${qty}) excede o saldo disponível (${selectedOutboundBalance.quantity_available}).`);
      return;
    }

    setSubmitting(true);
    const res = await processOutbound(farmId, {
      batchId: selectedOutboundBalance.batch_id,
      materialType: selectedOutboundBalance.genetic_material_batches?.genetic_materials?.type || 'SEMEN',
      tankId: selectedOutboundBalance.tank_id,
      canisterId: selectedOutboundBalance.canister_id,
      ownerClientId: selectedOutboundBalance.owner_client_id || null,
      quantity: qty,
      reason: outboundReason,
      notes: outboundNotes || undefined,
      recipientName: outboundRecipientName,
      recipientDocument: outboundRecipientDoc || undefined,
      occurredAt: new Date(outboundDate).toISOString(),
    });

    setSubmitting(false);
    if (res.success) {
      onSuccess({ action: 'outbound', receiptNumber: res.receiptNumber, receiptId: res.receiptId });
      onClose();
    } else {
      setErrorMsg(res.error || 'Erro ao registrar saída de estoque.');
    }
  };

  // Submeter Transferência
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!selectedTransferBalance) {
      setErrorMsg('Selecione o lote de origem.');
      return;
    }
    if (!transferDestTankId || !transferDestCanisterId) {
      setErrorMsg('Selecione o botijão e a caneca de destino.');
      return;
    }
    if (
      selectedTransferBalance.tank_id === transferDestTankId &&
      selectedTransferBalance.canister_id === transferDestCanisterId
    ) {
      setErrorMsg('O destino não pode ser exatamente igual à localização de origem.');
      return;
    }
    const qty = parseInt(transferQuantity);
    if (!qty || qty <= 0) {
      setErrorMsg('Informe uma quantidade válida.');
      return;
    }
    if (qty > selectedTransferBalance.quantity_available) {
      setErrorMsg(`Quantidade a transferir (${qty}) excede o saldo disponível (${selectedTransferBalance.quantity_available}).`);
      return;
    }

    setSubmitting(true);
    const res = await processTransfer(farmId, {
      batchId: selectedTransferBalance.batch_id,
      materialType: selectedTransferBalance.genetic_material_batches?.genetic_materials?.type || 'SEMEN',
      sourceTankId: selectedTransferBalance.tank_id,
      sourceCanisterId: selectedTransferBalance.canister_id,
      destTankId: transferDestTankId,
      destCanisterId: transferDestCanisterId,
      ownerClientId: selectedTransferBalance.owner_client_id || null,
      quantity: qty,
      reason: transferReason,
      notes: transferNotes || undefined,
    });

    setSubmitting(false);
    if (res.success) {
      onSuccess({ action: 'transfer', transferGroupId: res.transferGroupId });
      onClose();
    } else {
      setErrorMsg(res.error || 'Erro ao registrar transferência.');
    }
  };

  // Submeter Ajuste / Perda
  const handleAdjSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!selectedAdjBalance) {
      setErrorMsg('Selecione o lote.');
      return;
    }
    const qty = parseInt(adjQuantity);
    if (!qty || qty <= 0) {
      setErrorMsg('Informe uma quantidade válida.');
      return;
    }
    if (!adjReason.trim()) {
      setErrorMsg('A justificativa do ajuste/perda é obrigatória para auditoria.');
      return;
    }
    if (!adjIsPositive && qty > selectedAdjBalance.quantity_available) {
      setErrorMsg(`Quantidade de baixa (${qty}) excede o saldo disponível (${selectedAdjBalance.quantity_available}).`);
      return;
    }

    setSubmitting(true);
    const res = await processAdjustment(farmId, {
      batchId: selectedAdjBalance.batch_id,
      materialType: selectedAdjBalance.genetic_material_batches?.genetic_materials?.type || 'SEMEN',
      tankId: selectedAdjBalance.tank_id,
      canisterId: selectedAdjBalance.canister_id,
      ownerClientId: selectedAdjBalance.owner_client_id || null,
      quantity: qty,
      isPositive: adjIsPositive,
      isLoss: adjIsLoss,
      reason: adjReason.trim(),
      notes: adjNotes || undefined,
    });

    setSubmitting(false);
    if (res.success) {
      onSuccess({ action: 'adjustment' });
      onClose();
    } else {
      setErrorMsg(res.error || 'Erro ao registrar ajuste.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="glass-card w-full max-w-3xl rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm">
                IATF
              </span>
              Nova Movimentação de Estoque Genético
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Registro auditável no livro razão imutável com validação atômica de saldo
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 pt-2 gap-2 text-xs font-semibold overflow-x-auto">
          <button
            type="button"
            onClick={() => { setActiveTab('inbound'); setErrorMsg(null); }}
            className={`pb-3 px-3.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'inbound'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-3.5 h-3.5" /> Entrada de Doses
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('outbound'); setErrorMsg(null); }}
            className={`pb-3 px-3.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'outbound'
                ? 'border-rose-400 text-rose-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <LogOut className="w-3.5 h-3.5" /> Retirada / Saída
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('transfer'); setErrorMsg(null); }}
            className={`pb-3 px-3.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'transfer'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" /> Transferência
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('adjustment'); setErrorMsg(null); }}
            className={`pb-3 px-3.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'adjustment'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" /> Ajuste / Perda
          </button>
        </div>

        {/* Error notification */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4">
          
          {/* ======================================================== */}
          {/* TAB 1: ENTRADA DE MATERIAL */}
          {/* ======================================================== */}
          {activeTab === 'inbound' && (
            <form onSubmit={handleInboundSubmit} className="space-y-4">
              {/* Toggle Sêmen vs Embrião */}
              <div className="flex items-center justify-between bg-slate-950 p-2 rounded-xl border border-slate-800">
                <span className="text-xs font-semibold text-slate-400 pl-2">Tipo de Material:</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setInboundType('SEMEN')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      inboundType === 'SEMEN'
                        ? 'bg-emerald-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Sêmen Bovino
                  </button>
                  <button
                    type="button"
                    onClick={() => setInboundType('EMBRYO')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      inboundType === 'EMBRYO'
                        ? 'bg-purple-500 text-white shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Embrião
                  </button>
                </div>
              </div>

              {/* Toggle Lote Novo vs Lote Existente */}
              <div className="flex gap-3 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    name="inboundIsNew"
                    checked={inboundIsNew}
                    onChange={() => setInboundIsNew(true)}
                    className="accent-emerald-500"
                  />
                  <span>Cadastrar Novo Material + Partida</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    name="inboundIsNew"
                    checked={!inboundIsNew}
                    onChange={() => setInboundIsNew(false)}
                    className="accent-emerald-500"
                  />
                  <span>Dar Entrada em Partida Existente</span>
                </label>
              </div>

              {inboundIsNew ? (
                <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-3">
                  <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    Dados Genéticos do Material
                  </h4>

                  {inboundType === 'SEMEN' ? (
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Reprodutor / Touro *</label>
                      <select
                        required
                        value={inboundSireId}
                        onChange={(e) => setInboundSireId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">Selecione o touro cadastrado...</option>
                        {bulls.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} {b.code ? `(${b.code})` : ''} {b.owner_central ? `• ${b.owner_central}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Nome / Tag da Doadora *</label>
                        <input
                          required
                          type="text"
                          placeholder="Ex: DOADORA MATINHA 01"
                          value={inboundDonorName}
                          onChange={(e) => setInboundDonorName(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">RGD da Doadora</label>
                        <input
                          type="text"
                          placeholder="Ex: RGD-782991"
                          value={inboundDonorRgd}
                          onChange={(e) => setInboundDonorRgd(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Criopreservação</label>
                        <select
                          value={inboundCryo}
                          onChange={(e) => setInboundCryo(e.target.value as CryopreservationType)}
                          className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                        >
                          <option value="vitrificacao">Vitrificação</option>
                          <option value="congelamento_lento">Congelamento Lento</option>
                          <option value="fresco">A Fresco</option>
                          <option value="nao_aplicavel">Não especificado</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Sexagem</label>
                      <select
                        value={inboundSexing}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setInboundSexing(e.target.value as SexingType)}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                      >
                        <option value="convencional">Convencional</option>
                        <option value="femea">Fêmea (Sexado)</option>
                        <option value="macho">Macho (Sexado)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Envase</label>
                      <select
                        value={inboundPackageType}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setInboundPackageType(e.target.value as PackageType)}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                      >
                        <option value="palheta_025">Palheta Fina (0.25 mL)</option>
                        <option value="palheta_050">Palheta Média (0.50 mL)</option>
                        <option value="ampola">Ampola</option>
                        <option value="mini_tube">Mini Tube</option>
                        <option value="pellets">Pellets</option>
                        <option value="outro">Outro</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Central de Origem</label>
                      <select
                        value={inboundCenterId}
                        onChange={(e) => setInboundCenterId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">Sem central específica</option>
                        {centers.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Número da Partida *</label>
                      <input
                        required
                        type="text"
                        placeholder="Ex: P-2025D"
                        value={inboundBatchNumber}
                        onChange={(e) => setInboundBatchNumber(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Código do Rack</label>
                      <input
                        type="text"
                        placeholder="Ex: RACK-03"
                        value={inboundRackCode}
                        onChange={(e) => setInboundRackCode(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Custo Unitário (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Ex: 45.00"
                        value={inboundCost}
                        onChange={(e) => setInboundCost(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Selecionar Partida Existente *</label>
                  <select
                    required
                    value={inboundSelectedBalanceId}
                    onChange={(e) => setInboundSelectedBalanceId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Selecione a partida...</option>
                    {balances.map((b) => {
                      const mat = b.genetic_material_batches?.genetic_materials;
                      const aName = mat?.type === 'SEMEN' ? mat?.bulls?.name : mat?.donor_name;
                      return (
                        <option key={b.id} value={b.id}>
                          {aName} • Partida: {b.genetic_material_batches?.batch_number} (Atual: {b.quantity_available} un no {b.semen_tanks?.number})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Localização e Destino */}
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-3">
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" /> Localização Criogênica & Propriedade
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Botijão de Destino *</label>
                    <select
                      required
                      value={inboundTankId}
                      onChange={(e) => setInboundTankId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                    >
                      {tanks.map((t) => (
                        <option key={t.id} value={t.id}>{t.number} - {t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Caneca *</label>
                    <select
                      required
                      value={inboundCanisterId}
                      onChange={(e) => setInboundCanisterId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
                    >
                      {sourceCanisters.map((c) => (
                        <option key={c.id} value={c.id}>
                          Caneca #{c.position_number} {c.nickname ? `(${c.nickname})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Proprietário (Posse)</label>
                    <select
                      value={inboundOwnerClientId}
                      onChange={(e) => setInboundOwnerClientId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Fazenda (Estoque Próprio)</option>
                      {clients.map((cl) => (
                        <option key={cl.id} value={cl.id}>Cliente: {cl.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Qtd. de Doses / Palhetas *</label>
                    <input
                      required
                      type="number"
                      min="1"
                      placeholder="Ex: 50"
                      value={inboundQuantity}
                      onChange={(e) => setInboundQuantity(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 font-mono font-bold text-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Data da Entrada</label>
                    <input
                      type="date"
                      value={inboundDate}
                      onChange={(e) => setInboundDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Motivo / Tipo de Entrada</label>
                    <input
                      type="text"
                      value={inboundReason}
                      onChange={(e) => setInboundReason(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Observações Adicionais</label>
                  <input
                    type="text"
                    placeholder="Ex: Nota fiscal 4821, partida testada e aprovada."
                    value={inboundNotes}
                    onChange={(e) => setInboundNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex gap-3 pt-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                >
                  {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {submitting ? 'Gravando Entrada...' : 'Confirmar Entrada de Doses'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-3 rounded-xl border border-slate-700 text-slate-400 hover:text-white cursor-pointer text-xs"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {/* ======================================================== */}
          {/* TAB 2: SAÍDA / RETIRADA COM COMPROVANTE */}
          {/* ======================================================== */}
          {activeTab === 'outbound' && (
            <form onSubmit={handleOutboundSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Selecione o Lote e Posição para Retirada *
                </label>
                <select
                  required
                  value={outboundBalanceId}
                  onChange={(e) => setOutboundBalanceId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2.5 rounded-xl focus:outline-none focus:border-rose-500 font-sans"
                >
                  <option value="">Selecione de qual botijão/caneca retirar...</option>
                  {balances.map((b) => {
                    const mat = b.genetic_material_batches?.genetic_materials;
                    const aName = mat?.type === 'SEMEN' ? mat?.bulls?.name : mat?.donor_name;
                    const isClient = !!b.owner_client_id;
                    return (
                      <option key={b.id} value={b.id}>
                        {aName} • Partida: {b.genetic_material_batches?.batch_number} • {b.semen_tanks?.number} Caneca #{b.semen_tank_canisters?.position_number} • Saldo: {b.quantity_available} doses {isClient ? `[Cliente: ${b.genetic_clients?.name}]` : '[Próprio]'}
                      </option>
                    );
                  })}
                </select>
              </div>

              {selectedOutboundBalance && (
                <div className="bg-slate-950/80 p-4 rounded-2xl border border-rose-500/20 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Saldo Disponível Nesta Caneca:</span>
                    <span className="font-mono text-base font-black text-emerald-400">
                      {selectedOutboundBalance.quantity_available} doses
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
                    <span>
                      Localização: {selectedOutboundBalance.semen_tanks?.name} (Caneca #{selectedOutboundBalance.semen_tank_canisters?.position_number})
                    </span>
                    <span>
                      Propriedade: {selectedOutboundBalance.owner_client_id ? `Cliente: ${selectedOutboundBalance.genetic_clients?.name}` : 'Estoque Próprio da Fazenda'}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Qtd. a Retirar *</label>
                  <input
                    required
                    type="number"
                    min="1"
                    max={selectedOutboundBalance?.quantity_available || 9999}
                    placeholder="Ex: 20"
                    value={outboundQuantity}
                    onChange={(e) => setOutboundQuantity(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-rose-500 font-mono font-bold text-rose-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Data da Saída</label>
                  <input
                    type="date"
                    value={outboundDate}
                    onChange={(e) => setOutboundDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Finalidade da Retirada *</label>
                  <select
                    value={outboundReason}
                    onChange={(e) => setOutboundReason(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-rose-500"
                  >
                    <option value="Inseminação Artificial em Campo">Inseminação Artificial em Campo</option>
                    <option value="Uso em Lote de IATF">Uso em Lote de IATF</option>
                    <option value="Devolução ou Entrega ao Cliente">Devolução ou Entrega ao Cliente</option>
                    <option value="Venda de Doses">Venda de Doses</option>
                    <option value="Descarte por Inviabilidade">Descarte por Inviabilidade</option>
                    <option value="Outro">Outro Motivo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Responsável / Recebedor *</label>
                  <input
                    required
                    type="text"
                    placeholder="Nome do inseminador ou recebedor"
                    value={outboundRecipientName}
                    onChange={(e) => setOutboundRecipientName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Documento / CPF</label>
                  <input
                    type="text"
                    placeholder="Ex: 000.000.000-00"
                    value={outboundRecipientDoc}
                    onChange={(e) => setOutboundRecipientDoc(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-rose-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Observações da Saída</label>
                <input
                  type="text"
                  placeholder="Ex: Retirado para aplicação no lote de novilhas do retiro sul."
                  value={outboundNotes}
                  onChange={(e) => setOutboundNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                >
                  {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                  {submitting ? 'Processando Baixa...' : 'Confirmar Retirada & Emitir Comprovante'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-3 rounded-xl border border-slate-700 text-slate-400 hover:text-white cursor-pointer text-xs"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {/* ======================================================== */}
          {/* TAB 3: TRANSFERÊNCIA ENTRE BOTIJÕES / CANECAS */}
          {/* ======================================================== */}
          {activeTab === 'transfer' && (
            <form onSubmit={handleTransferSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Origem (Selecione o Lote) *</label>
                <select
                  required
                  value={transferBalanceId}
                  onChange={(e) => setTransferBalanceId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2.5 rounded-xl focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Selecione o saldo de origem...</option>
                  {balances.map((b) => {
                    const mat = b.genetic_material_batches?.genetic_materials;
                    const aName = mat?.type === 'SEMEN' ? mat?.bulls?.name : mat?.donor_name;
                    return (
                      <option key={b.id} value={b.id}>
                        {aName} • Partida: {b.genetic_material_batches?.batch_number} • {b.semen_tanks?.number} Caneca #{b.semen_tank_canisters?.position_number} • Saldo: {b.quantity_available} un
                      </option>
                    );
                  })}
                </select>
              </div>

              {selectedTransferBalance && (
                <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-xs flex items-center justify-between">
                  <span className="text-slate-400">Saldo disponível para transferir:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {selectedTransferBalance.quantity_available} doses
                  </span>
                </div>
              )}

              {/* Destino */}
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ArrowRightLeft className="w-3.5 h-3.5" /> Localização de Destino
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Botijão de Destino *</label>
                    <select
                      required
                      value={transferDestTankId}
                      onChange={(e) => setTransferDestTankId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-cyan-500"
                    >
                      <option value="">Selecione o botijão...</option>
                      {tanks.map((t) => (
                        <option key={t.id} value={t.id}>{t.number} - {t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Caneca de Destino *</label>
                    <select
                      required
                      value={transferDestCanisterId}
                      onChange={(e) => setTransferDestCanisterId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-cyan-500 font-mono"
                    >
                      <option value="">Selecione a caneca...</option>
                      {destCanisters.map((c) => (
                        <option key={c.id} value={c.id}>
                          Caneca #{c.position_number} {c.nickname ? `(${c.nickname})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Quantidade a Transferir *</label>
                    <input
                      required
                      type="number"
                      min="1"
                      max={selectedTransferBalance?.quantity_available || 9999}
                      placeholder="Ex: 30"
                      value={transferQuantity}
                      onChange={(e) => setTransferQuantity(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-cyan-500 font-mono font-bold text-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Motivo</label>
                    <input
                      type="text"
                      value={transferReason}
                      onChange={(e) => setTransferReason(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Observações</label>
                  <input
                    type="text"
                    placeholder="Ex: Mudança de botijão para facilitar manejo no retiro."
                    value={transferNotes}
                    onChange={(e) => setTransferNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                >
                  {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                  {submitting ? 'Executando Transferência...' : 'Confirmar Transferência Atômica'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-3 rounded-xl border border-slate-700 text-slate-400 hover:text-white cursor-pointer text-xs"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {/* ======================================================== */}
          {/* TAB 4: AJUSTE / PERDA COM AUDITORIA */}
          {/* ======================================================== */}
          {activeTab === 'adjustment' && (
            <form onSubmit={handleAdjSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Selecione o Lote *</label>
                <select
                  required
                  value={adjBalanceId}
                  onChange={(e) => setAdjBalanceId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2.5 rounded-xl focus:outline-none focus:border-amber-500"
                >
                  <option value="">Selecione o saldo a ajustar...</option>
                  {balances.map((b) => {
                    const mat = b.genetic_material_batches?.genetic_materials;
                    const aName = mat?.type === 'SEMEN' ? mat?.bulls?.name : mat?.donor_name;
                    return (
                      <option key={b.id} value={b.id}>
                        {aName} • Partida: {b.genetic_material_batches?.batch_number} • Saldo Atual: {b.quantity_available} un
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    name="adjType"
                    checked={!adjIsPositive && !adjIsLoss}
                    onChange={() => { setAdjIsPositive(false); setAdjIsLoss(false); }}
                    className="accent-amber-500"
                  />
                  <span>Ajuste Negativo (Correção)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    name="adjType"
                    checked={adjIsLoss}
                    onChange={() => { setAdjIsPositive(false); setAdjIsLoss(true); }}
                    className="accent-rose-500"
                  />
                  <span>Perda Operacional</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    name="adjType"
                    checked={adjIsPositive}
                    onChange={() => { setAdjIsPositive(true); setAdjIsLoss(false); }}
                    className="accent-emerald-500"
                  />
                  <span>Ajuste Positivo (Sobra)</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Quantidade de Doses *</label>
                  <input
                    required
                    type="number"
                    min="1"
                    placeholder="Ex: 5"
                    value={adjQuantity}
                    onChange={(e) => setAdjQuantity(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-amber-500 font-mono font-bold text-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Motivo / Justificativa Obrigatória *</label>
                  <input
                    required
                    type="text"
                    placeholder="Ex: Palheta danificada durante o descongelamento."
                    value={adjReason}
                    onChange={(e) => setAdjReason(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Observações Complementares</label>
                <textarea
                  rows={2}
                  placeholder="Informações adicionais para a trilha de auditoria."
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                >
                  {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
                  {submitting ? 'Registrando Ajuste...' : 'Confirmar Ajuste Auditado'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-3 rounded-xl border border-slate-700 text-slate-400 hover:text-white cursor-pointer text-xs"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
