'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  getLotCategoryReports, 
  getCategorySummaryReports, 
  getLots, 
  getSemenBatches, 
  getVeterinarians, 
  type LotCategoryStat, 
  type CategorySummaryStat, 
  type LotStat, 
  type SemenBatch, 
  type Veterinarian 
} from '@/lib/db';
import { useActiveFarm } from '@/context/FarmContext';
import { useActiveSeason } from '@/context/SeasonContext';
import { 
  FileText, 
  Printer, 
  Download, 
  Layers, 
  Syringe, 
  RefreshCw, 
  Award, 
  TrendingUp, 
  Search, 
  Building2, 
  Calendar, 
  BarChart3, 
  CheckCircle2, 
  AlertTriangle,
  HeartPulse,
  Filter
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Cell 
} from 'recharts';
import * as XLSX from 'xlsx';

type ReportTab = 'lote_categoria' | 'comparativo_categoria' | 'lotes_geral' | 'semen';

export default function ReportsPage() {
  const { farms, activeFarmId } = useActiveFarm();
  const { seasons, activeSeasonId, activeSeason } = useActiveSeason();

  const [activeTab, setActiveTab] = useState<ReportTab>('lote_categoria');
  const [loading, setLoading] = useState(true);

  // Filtros de seleção
  const [selectedFarmId, setSelectedFarmId] = useState<string>('all');
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Dados carregados
  const [lotCatData, setLotCatData] = useState<LotCategoryStat[]>([]);
  const [catSummaryData, setCatSummaryData] = useState<CategorySummaryStat[]>([]);
  const [lots, setLots] = useState<LotStat[]>([]);
  const [semenBatches, setSemenBatches] = useState<SemenBatch[]>([]);
  const [veterinarians, setVeterinarians] = useState<Veterinarian[]>([]);

  // Sincronizar com fazenda ativa inicial caso exista
  useEffect(() => {
    if (activeFarmId && selectedFarmId === 'all') {
      setSelectedFarmId(activeFarmId);
    }
  }, [activeFarmId, selectedFarmId]);

  useEffect(() => {
    if (activeSeasonId && selectedSeasonId === 'all') {
      setSelectedSeasonId(activeSeasonId);
    }
  }, [activeSeasonId, selectedSeasonId]);

  const loadData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      const targetFarm = selectedFarmId === 'all' ? undefined : selectedFarmId;
      const targetSeason = selectedSeasonId === 'all' ? undefined : selectedSeasonId;

      const [lc, cs, l, s, v] = await Promise.all([
        getLotCategoryReports(forceRefresh, targetFarm, targetSeason),
        getCategorySummaryReports(forceRefresh, targetFarm, targetSeason),
        getLots(forceRefresh, targetFarm),
        getSemenBatches(),
        getVeterinarians(),
      ]);

      setLotCatData(lc);
      setCatSummaryData(cs);
      setLots(l);
      setSemenBatches(s);
      setVeterinarians(v);
    } catch (err) {
      console.error('Erro ao carregar relatórios:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedFarmId, selectedSeasonId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Lista de categorias disponíveis
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    lotCatData.forEach((item) => set.add(item.category_name));
    return Array.from(set);
  }, [lotCatData]);

  // Filtragem dos dados de Lote x Categoria
  const filteredLotCatData = useMemo(() => {
    return lotCatData.filter((item) => {
      // Filtro de Categoria
      if (selectedCategory !== 'ALL' && item.category_name !== selectedCategory) {
        return false;
      }

      // Busca textual
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const lotCode = item.lot_code.toLowerCase();
        const lotName = item.lot_name?.toLowerCase() || '';
        const farmName = item.farm_name.toLowerCase();
        const catName = item.category_name.toLowerCase();
        const proto = item.protocol_name.toLowerCase();

        return lotCode.includes(q) || lotName.includes(q) || farmName.includes(q) || catName.includes(q) || proto.includes(q);
      }

      return true;
    });
  }, [lotCatData, selectedCategory, searchQuery]);

  // Agrupamento por Lote para tabela hierárquica
  const groupedByLot = useMemo(() => {
    const map = new Map<string, {
      lot_id: string;
      lot_code: string;
      lot_name: string | null;
      farm_name: string;
      protocol_name: string;
      property_name: string | null;
      ia_date: string | null;
      dg_date: string | null;
      categories: LotCategoryStat[];
      subtotalFemales: number;
      subtotalInseminated: number;
      subtotalPregnant: number;
      subtotalEmpty: number;
      subtotalRate: number;
    }>();

    filteredLotCatData.forEach((item) => {
      if (!map.has(item.lot_id)) {
        map.set(item.lot_id, {
          lot_id: item.lot_id,
          lot_code: item.lot_code,
          lot_name: item.lot_name,
          farm_name: item.farm_name,
          protocol_name: item.protocol_name,
          property_name: item.property_name,
          ia_date: item.ia_date,
          dg_date: item.dg_date,
          categories: [],
          subtotalFemales: 0,
          subtotalInseminated: 0,
          subtotalPregnant: 0,
          subtotalEmpty: 0,
          subtotalRate: 0,
        });
      }

      const lotGroup = map.get(item.lot_id)!;
      lotGroup.categories.push(item);
      lotGroup.subtotalFemales += item.total_females;
      lotGroup.subtotalInseminated += item.inseminated_qty;
      lotGroup.subtotalPregnant += item.pregnant_qty;
      lotGroup.subtotalEmpty += item.empty_qty;
    });

    // Calcular subtotal rates
    map.forEach((g) => {
      g.subtotalRate = g.subtotalInseminated > 0 ? (g.subtotalPregnant / g.subtotalInseminated) * 100 : 0;
    });

    return Array.from(map.values());
  }, [filteredLotCatData]);

  // Totais Gerais
  const overallStats = useMemo(() => {
    const totalFemales = filteredLotCatData.reduce((s, i) => s + i.total_females, 0);
    const totalInseminated = filteredLotCatData.reduce((s, i) => s + i.inseminated_qty, 0);
    const totalPregnant = filteredLotCatData.reduce((s, i) => s + i.pregnant_qty, 0);
    const totalEmpty = filteredLotCatData.reduce((s, i) => s + i.empty_qty, 0);
    const overallRate = totalInseminated > 0 ? (totalPregnant / totalInseminated) * 100 : 0;

    // Estatísticas de Primíparas
    const primiparaItems = lotCatData.filter((i) => i.category_name.toLowerCase().includes('primípara'));
    const primiparaInsem = primiparaItems.reduce((s, i) => s + i.inseminated_qty, 0);
    const primiparaPreg = primiparaItems.reduce((s, i) => s + i.pregnant_qty, 0);
    const primiparaRate = primiparaInsem > 0 ? (primiparaPreg / primiparaInsem) * 100 : 0;

    // Melhor categoria
    let bestCatName = '-';
    let bestCatRate = 0;
    catSummaryData.forEach((cs) => {
      if (cs.inseminated_qty >= 2 && cs.pregnancy_rate > bestCatRate) {
        bestCatRate = cs.pregnancy_rate;
        bestCatName = cs.category_name;
      }
    });

    return {
      totalFemales,
      totalInseminated,
      totalPregnant,
      totalEmpty,
      overallRate,
      primiparaInsem,
      primiparaPreg,
      primiparaRate,
      bestCatName,
      bestCatRate,
    };
  }, [filteredLotCatData, lotCatData, catSummaryData]);

  // Médico Veterinário responsável
  const defaultVet = veterinarians.find((v) => v.is_default) || veterinarians[0];
  const vetDisplayName = defaultVet ? defaultVet.name : 'DR. SAMOEL DUARTE';
  const vetCrmv = defaultVet?.crmv ? `CRMV: ${defaultVet.crmv}` : 'CRMV-SP 12345';

  // Exportar para Excel (.xlsx)
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const dateStr = new Date().toISOString().slice(0, 10);

    if (activeTab === 'lote_categoria') {
      const dataRows = filteredLotCatData.map((item) => ({
        'Fazenda': item.farm_name,
        'Lote': item.lot_code,
        'Retiro / Propriedade': item.property_name || '-',
        'Protocolo': item.protocol_name,
        'Data IA': item.ia_date || '-',
        'Data DG': item.dg_date || '-',
        'Categoria Animal': item.category_name,
        'Fêmeas Sincronizadas': item.total_females,
        'Inseminadas': item.inseminated_qty,
        'Prenhas': item.pregnant_qty,
        'Vazias': item.empty_qty,
        'Taxa de Concepção (%)': item.pregnancy_rate,
        'ECC Médio IA': item.avg_ecc_ia !== null ? item.avg_ecc_ia : '-',
        'ECC Médio DG': item.avg_ecc_dg !== null ? item.avg_ecc_dg : '-',
      }));

      const ws = XLSX.utils.json_to_sheet(dataRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Lote_x_Categoria');
      XLSX.writeFile(wb, `Relatorio_IATF_Lote_Categoria_${dateStr}.xlsx`);
    } else if (activeTab === 'comparativo_categoria') {
      const dataRows = catSummaryData.map((c) => ({
        'Categoria Animal': c.category_name,
        'Total Fêmeas': c.total_females,
        'Inseminadas': c.inseminated_qty,
        'Prenhas': c.pregnant_qty,
        'Vazias': c.empty_qty,
        'Taxa de Concepção (%)': c.pregnancy_rate,
        'ECC Médio na IA': c.avg_ecc_ia !== null ? c.avg_ecc_ia : '-',
        'Qtd. de Lotes Participantes': c.lots_count,
      }));

      const ws = XLSX.utils.json_to_sheet(dataRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Resumo_Categorias');
      XLSX.writeFile(wb, `Relatorio_IATF_Resumo_Categorias_${dateStr}.xlsx`);
    } else if (activeTab === 'lotes_geral') {
      const dataRows = lots.map((l) => ({
        'Lote': l.code,
        'Fazenda': l.farm_name || '-',
        'Protocolo': l.protocol_name || '-',
        'Início D0': l.start_date,
        'Data IA': l.ia_planned_date || '-',
        'Data DG': l.dg_planned_date || '-',
        'Trabalhadas': l.worked_qty,
        'Inseminadas': l.inseminated_qty,
        'Prenhas': l.pregnancies,
        'Vazias': l.empty_count,
        'Taxa (%)': Number(l.pregnancy_rate.toFixed(2)),
        'Status': l.status,
      }));

      const ws = XLSX.utils.json_to_sheet(dataRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Lotes_Geral');
      XLSX.writeFile(wb, `Relatorio_IATF_Lotes_Geral_${dateStr}.xlsx`);
    } else {
      const dataRows = semenBatches.map((b) => {
        const current = b.initial_quantity - b.used_quantity - b.lost_quantity;
        return {
          'Touro': b.bulls?.name || 'Touro',
          'Partida': b.batch_number,
          'Compradas': b.initial_quantity,
          'Utilizadas': b.used_quantity,
          'Perdas': b.lost_quantity,
          'Saldo Remanescente': current,
          '% Utilizado': b.initial_quantity > 0 ? ((b.used_quantity / b.initial_quantity) * 100).toFixed(1) : 0,
        };
      });

      const ws = XLSX.utils.json_to_sheet(dataRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Estoque_Semen');
      XLSX.writeFile(wb, `Relatorio_IATF_Estoque_Semen_${dateStr}.xlsx`);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header do Módulo de Relatórios */}
      <div className="glass-card bg-slate-900/90 p-5 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 print:border-none print:p-0">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-black shadow-inner print:hidden">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                Relatórios & Indicadores Reprodutivos
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 print:hidden">
                  IATF Master
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Desempenho zootécnico por lote e por categoria de matriz (Novilha, Primípara, Secundípara, Multípara).
              </p>
            </div>
          </div>
        </div>

        {/* Botões de Ação: Excel e Imprimir / PDF */}
        <div className="flex items-center gap-2.5 print:hidden self-start md:self-auto">
          <button
            onClick={handleExportExcel}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold px-3.5 py-2 rounded-xl border border-slate-700 text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md"
            title="Exportar dados da visualização atual para planilha Excel"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Exportar Excel (.xlsx)</span>
          </button>

          <button
            onClick={() => window.print()}
            className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md"
            title="Imprimir ou salvar relatório oficial em PDF"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir / PDF Oficial</span>
          </button>
        </div>
      </div>

      {/* 2. Barra de Filtros Globais */}
      <div className="glass-card bg-slate-900/60 p-4 rounded-2xl border border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs print:hidden">
        {/* Seletor de Fazenda */}
        <div>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 mb-1">
            <Building2 className="w-3.5 h-3.5 text-emerald-400" />
            Propriedade / Fazenda
          </label>
          <select
            value={selectedFarmId}
            onChange={(e) => setSelectedFarmId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 text-white px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="all">Todas as Fazendas (Integrada)</option>
            {farms.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        {/* Seletor de Estação Reprodutiva */}
        <div>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 mb-1">
            <Calendar className="w-3.5 h-3.5 text-sky-400" />
            Estação Reprodutiva
          </label>
          <select
            value={selectedSeasonId}
            onChange={(e) => setSelectedSeasonId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 text-white px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="all">Todas as Estações</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.id === activeSeasonId ? '(Vigente)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro de Categoria Animal */}
        <div>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 mb-1">
            <Filter className="w-3.5 h-3.5 text-amber-400" />
            Categoria Animal
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 text-white px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="ALL">Todas as Categorias</option>
            {availableCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Busca textual */}
        <div>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 mb-1">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            Filtrar por Lote / Texto
          </label>
          <input
            type="text"
            placeholder="Ex: Lote 01, Protocolo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 text-white px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 text-xs"
          />
        </div>
      </div>

      {/* 3. Cards de KPIs e Destaques Zootécnicos */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Matrizes Sincronizadas */}
        <div className="glass-card bg-slate-900/90 p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>Matrizes</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-black text-white font-mono">{overallStats.totalFemales}</p>
          <span className="text-[10px] text-slate-400 font-medium block">
            {overallStats.totalInseminated} inseminadas
          </span>
        </div>

        {/* Taxa Geral de Prenhez */}
        <div className="glass-card bg-slate-900/90 p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>Taxa Geral</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400 font-mono">
            {overallStats.overallRate.toFixed(1)}%
          </p>
          <span className="text-[10px] text-slate-400 font-medium block">
            {overallStats.totalPregnant} prenhas / {overallStats.totalEmpty} vazias
          </span>
        </div>

        {/* Desafio Primíparas */}
        <div className="glass-card bg-slate-900/90 p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>Primíparas (1ª Cria)</span>
            <HeartPulse className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-black text-amber-400 font-mono">
            {overallStats.primiparaRate > 0 ? `${overallStats.primiparaRate.toFixed(1)}%` : '-'}
          </p>
          <span className="text-[10px] text-slate-400 font-medium block">
            {overallStats.primiparaPreg}/{overallStats.primiparaInsem} fêmeas prenhas
          </span>
        </div>

        {/* Categoria Destaque */}
        <div className="glass-card bg-slate-900/90 p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>Melhor Categoria</span>
            <Award className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-base font-black text-cyan-300 truncate mt-1">
            {overallStats.bestCatName}
          </p>
          <span className="text-[10px] text-cyan-400 font-bold font-mono block">
            {overallStats.bestCatRate > 0 ? `${overallStats.bestCatRate.toFixed(1)}% de prenhez` : '-'}
          </span>
        </div>

        {/* Lotes Avaliados */}
        <div className="glass-card bg-slate-900/90 p-4 rounded-2xl border border-slate-800 space-y-1 col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>Lotes no Filtro</span>
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
          </div>
          <p className="text-2xl font-black text-teal-300 font-mono">{groupedByLot.length}</p>
          <span className="text-[10px] text-slate-400 font-medium block">
            {filteredLotCatData.length} cruzamentos avaliados
          </span>
        </div>
      </div>

      {/* 4. Abas de Navegação */}
      <div className="flex space-x-2 border-b border-slate-800 pb-2 print:hidden">
        {[
          { id: 'lote_categoria' as const, label: 'Desempenho por Lote × Categoria', icon: Layers },
          { id: 'comparativo_categoria' as const, label: 'Comparativo por Categoria', icon: BarChart3 },
          { id: 'lotes_geral' as const, label: `Visão Geral dos Lotes (${lots.length})`, icon: FileText },
          { id: 'semen' as const, label: `Estoque de Sêmen & Touros (${semenBatches.length})`, icon: Syringe },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === id
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* 5. Conteúdo Principal das Abas */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-5">
        {/* Cabeçalho de Relatório Oficial para Impressão */}
        <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold text-white uppercase tracking-wider">
              {activeTab === 'lote_categoria' && 'Relatório Analítico de Concepção por Lote e Categoria Zootécnica'}
              {activeTab === 'comparativo_categoria' && 'Comparativo Consolidado de Desempenho por Categoria Animal'}
              {activeTab === 'lotes_geral' && 'Relatório Oficial Consolidado de Lotes de IATF'}
              {activeTab === 'semen' && 'Relatório de Utilização e Saldo de Sêmen por Touro'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Estação: <strong className="text-slate-200">{activeSeason?.name || 'Vigente'}</strong> • 
              Propriedade: <strong className="text-slate-200">{selectedFarmId === 'all' ? 'Todas as Fazendas (Integrada)' : farms.find(f => f.id === selectedFarmId)?.name}</strong>
            </p>
          </div>

          <div className="text-left sm:text-right font-mono">
            <span className="text-xs font-semibold text-white block">{vetDisplayName}</span>
            <span className="text-[11px] text-emerald-400 block">{vetCrmv}</span>
          </div>
        </div>

        {/* Loading Spinner */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
            <span className="text-sm font-semibold">Processando indicadores reprodutivos...</span>
          </div>
        ) : (
          <>
            {/* ======================================================== */}
            {/* ABA 1: LOTE X CATEGORIA ANIMAL (TABELA CRUZADA) */}
            {/* ======================================================== */}
            {activeTab === 'lote_categoria' && (
              <div className="space-y-4">
                {groupedByLot.length === 0 ? (
                  <div className="py-16 text-center text-slate-400">
                    <AlertTriangle className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                    <p className="text-sm font-semibold text-slate-300">Nenhum dado encontrado para os filtros selecionados.</p>
                    <p className="text-xs text-slate-500 mt-1">Verifique se os animais estão vinculados aos lotes e com categoria preenchida.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                        <tr>
                          <th className="p-3">Lote / Fazenda</th>
                          <th className="p-3">Categoria da Matriz</th>
                          <th className="p-3">Protocolo</th>
                          <th className="p-3">Datas (IA / DG)</th>
                          <th className="p-3 text-right">Sincronizadas</th>
                          <th className="p-3 text-right">Inseminadas</th>
                          <th className="p-3 text-right">Prenhas</th>
                          <th className="p-3 text-right">Vazias</th>
                          <th className="p-3 text-right font-bold">Taxa Concepção</th>
                          <th className="p-3 text-right">ECC Médio IA</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-800/80 bg-slate-900/60 font-mono">
                        {groupedByLot.map((lotGroup) => (
                          <React.Fragment key={lotGroup.lot_id}>
                            {/* Linhas de cada Categoria dentro do Lote */}
                            {lotGroup.categories.map((cat, idx) => {
                              let badgeColor = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
                              if (cat.pregnancy_rate < 35) badgeColor = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
                              else if (cat.pregnancy_rate < 48) badgeColor = 'bg-amber-500/15 text-amber-400 border-amber-500/30';

                              return (
                                <tr key={`${lotGroup.lot_id}_${cat.category_id}`} className="hover:bg-slate-800/40 transition-colors">
                                  {/* Coluna Lote (apenas na 1ª linha do grupo) */}
                                  {idx === 0 ? (
                                    <td rowSpan={lotGroup.categories.length + 1} className="p-3 align-top font-sans border-r border-slate-800/80 bg-slate-950/30">
                                      <div className="font-extrabold text-white text-sm">
                                        {lotGroup.lot_code}
                                      </div>
                                      <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                                        {lotGroup.farm_name}
                                      </div>
                                      {lotGroup.property_name && (
                                        <div className="text-[10px] text-slate-400">
                                          {lotGroup.property_name}
                                        </div>
                                      )}
                                    </td>
                                  ) : null}

                                  {/* Categoria */}
                                  <td className="p-3 font-sans">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-800 border border-slate-700 text-slate-200">
                                      {cat.category_name}
                                    </span>
                                  </td>

                                  {/* Protocolo */}
                                  <td className="p-3 font-sans text-[11px] text-slate-300">
                                    {cat.protocol_name}
                                  </td>

                                  {/* Datas IA e DG */}
                                  <td className="p-3 text-[11px] text-slate-400 font-sans">
                                    IA: <strong className="text-slate-200 font-mono">{cat.ia_date ? cat.ia_date.split('-').reverse().join('/') : '-'}</strong>
                                    {cat.dg_date && (
                                      <span className="block text-[10px]">
                                        DG: <strong className="text-slate-300 font-mono">{cat.dg_date.split('-').reverse().join('/')}</strong>
                                      </span>
                                    )}
                                  </td>

                                  {/* Quantidades */}
                                  <td className="p-3 text-right">{cat.total_females}</td>
                                  <td className="p-3 text-right">{cat.inseminated_qty}</td>
                                  <td className="p-3 text-right font-bold text-emerald-400">{cat.pregnant_qty}</td>
                                  <td className="p-3 text-right text-slate-400">{cat.empty_qty}</td>

                                  {/* Taxa de Prenhez com Badge */}
                                  <td className="p-3 text-right">
                                    <span className={`px-2 py-0.5 rounded border text-[11px] font-black ${badgeColor}`}>
                                      {cat.pregnancy_rate.toFixed(1)}%
                                    </span>
                                  </td>

                                  {/* ECC Médio */}
                                  <td className="p-3 text-right text-slate-300">
                                    {cat.avg_ecc_ia !== null ? cat.avg_ecc_ia.toFixed(2) : '-'}
                                  </td>
                                </tr>
                              );
                            })}

                            {/* Linha de Subtotal do Lote */}
                            <tr className="bg-slate-950/70 text-slate-300 font-bold border-b-2 border-slate-800 text-[11px]">
                              <td className="p-2.5 font-sans italic text-slate-400">
                                Subtotal ({lotGroup.lot_code})
                              </td>
                              <td colSpan={2} className="p-2.5 font-sans text-slate-500">
                                Todas as categorias do lote
                              </td>
                              <td className="p-2.5 text-right">{lotGroup.subtotalFemales}</td>
                              <td className="p-2.5 text-right">{lotGroup.subtotalInseminated}</td>
                              <td className="p-2.5 text-right text-emerald-400">{lotGroup.subtotalPregnant}</td>
                              <td className="p-2.5 text-right text-slate-400">{lotGroup.subtotalEmpty}</td>
                              <td className="p-2.5 text-right font-black text-emerald-400">
                                {lotGroup.subtotalRate.toFixed(1)}%
                              </td>
                              <td className="p-2.5 text-right text-slate-500">-</td>
                            </tr>
                          </React.Fragment>
                        ))}

                        {/* Linha de Total Geral */}
                        <tr className="bg-slate-800/80 font-extrabold text-white text-xs border-t-2 border-slate-700">
                          <td colSpan={4} className="p-3.5 font-sans tracking-wide">
                            TOTAL GERAL CONSOLIDADO
                          </td>
                          <td className="p-3.5 text-right">{overallStats.totalFemales}</td>
                          <td className="p-3.5 text-right">{overallStats.totalInseminated}</td>
                          <td className="p-3.5 text-right text-emerald-400">{overallStats.totalPregnant}</td>
                          <td className="p-3.5 text-right text-slate-400">{overallStats.totalEmpty}</td>
                          <td className="p-3.5 text-right text-emerald-400 text-sm">
                            {overallStats.overallRate.toFixed(1)}%
                          </td>
                          <td className="p-3.5 text-right">-</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ======================================================== */}
            {/* ABA 2: COMPARATIVO POR CATEGORIA (GRÁFICOS & CARDS) */}
            {/* ======================================================== */}
            {activeTab === 'comparativo_categoria' && (
              <div className="space-y-6">
                {/* Gráfico Recharts de Concepção por Categoria */}
                <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-emerald-400" />
                      Taxa de Concepção por Categoria Animal (%)
                    </h3>
                    <span className="text-xs text-slate-400">Dados consolidados da fazenda / estação</span>
                  </div>

                  <div className="h-64 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={catSummaryData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                        <XAxis dataKey="category_name" stroke="#64748b" fontSize={11} tickLine={false} />
                        <YAxis stroke="#64748b" fontSize={11} tickLine={false} unit="%" domain={[0, 100]} />
                        <Tooltip 
                          formatter={(val) => [`${Number(val).toFixed(1)}%`, 'Taxa de Concepção']}
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px', color: '#fff' }} 
                        />
                        <Bar dataKey="pregnancy_rate" radius={[8, 8, 0, 0]}>
                          {catSummaryData.map((entry) => {
                            let fillColor = '#10b981'; // emerald
                            if (entry.category_name.toLowerCase().includes('primípara')) fillColor = '#f59e0b'; // amber
                            else if (entry.category_name.toLowerCase().includes('novilha')) fillColor = '#06b6d4'; // cyan
                            else if (entry.pregnancy_rate < 35) fillColor = '#f43f5e'; // rose
                            return <Cell key={entry.category_name} fill={fillColor} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Cards Comparativos Detalhados por Categoria */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {catSummaryData.map((c) => {
                    let ringColor = 'border-emerald-500/40 bg-emerald-500/5';
                    let accentText = 'text-emerald-400';
                    if (c.category_name.toLowerCase().includes('primípara')) {
                      ringColor = 'border-amber-500/40 bg-amber-500/5';
                      accentText = 'text-amber-400';
                    } else if (c.category_name.toLowerCase().includes('novilha')) {
                      ringColor = 'border-cyan-500/40 bg-cyan-500/5';
                      accentText = 'text-cyan-400';
                    }

                    return (
                      <div
                        key={c.category_name}
                        className={`glass-card p-5 rounded-2xl border ${ringColor} space-y-3 shadow-lg`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="text-base font-bold text-white">{c.category_name}</h4>
                            <p className="text-[11px] text-slate-400">{c.lots_count} lotes participantes</p>
                          </div>
                          <span className={`text-xl font-black font-mono ${accentText}`}>
                            {c.pregnancy_rate.toFixed(1)}%
                          </span>
                        </div>

                        <div className="space-y-1.5 text-xs text-slate-300 font-mono border-t border-slate-800/80 pt-2.5">
                          <div className="flex justify-between">
                            <span className="text-slate-400 font-sans">Total Sincronizadas:</span>
                            <span className="font-bold text-white">{c.total_females}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400 font-sans">Inseminadas:</span>
                            <span>{c.inseminated_qty}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400 font-sans">Prenhas Confirmadas:</span>
                            <span className="font-bold text-emerald-400">{c.pregnant_qty}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400 font-sans">Vazias:</span>
                            <span className="text-slate-400">{c.empty_qty}</span>
                          </div>
                          {c.avg_ecc_ia !== null && (
                            <div className="flex justify-between pt-1 border-t border-slate-800/50">
                              <span className="text-slate-400 font-sans">ECC Médio na IA:</span>
                              <span className="text-amber-300 font-bold">{c.avg_ecc_ia.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* ABA 3: VISÃO GERAL DE LOTES (COMPLETA) */}
            {/* ======================================================== */}
            {activeTab === 'lotes_geral' && (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3">Lote</th>
                      <th className="p-3">Fazenda</th>
                      <th className="p-3">Retiro</th>
                      <th className="p-3">Protocolo</th>
                      <th className="p-3">D0</th>
                      <th className="p-3">IA</th>
                      <th className="p-3">DG</th>
                      <th className="p-3 text-right">Matrizes</th>
                      <th className="p-3 text-right">Inseminadas</th>
                      <th className="p-3 text-right">Prenhas</th>
                      <th className="p-3 text-right">Vazias</th>
                      <th className="p-3 text-right font-bold">Taxa %</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-900/60 font-mono">
                    {lots.map((lot) => (
                      <tr key={lot.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="p-3 font-bold text-white font-sans">{lot.code}</td>
                        <td className="p-3 font-sans text-emerald-400 font-semibold">{lot.farm_name || '-'}</td>
                        <td className="p-3 font-sans">{lot.property_name ?? '-'}</td>
                        <td className="p-3 font-sans text-[11px] text-slate-300">{lot.protocol_name}</td>
                        <td className="p-3">{lot.start_date ? lot.start_date.split('-').reverse().join('/') : '-'}</td>
                        <td className="p-3">{lot.ia_planned_date ? lot.ia_planned_date.split('-').reverse().join('/') : '-'}</td>
                        <td className="p-3">{lot.dg_planned_date ? lot.dg_planned_date.split('-').reverse().join('/') : '-'}</td>
                        <td className="p-3 text-right">{lot.worked_qty}</td>
                        <td className="p-3 text-right">{lot.inseminated_qty}</td>
                        <td className="p-3 text-right text-emerald-400 font-bold">{lot.pregnancies}</td>
                        <td className="p-3 text-right text-slate-400">{lot.empty_count}</td>
                        <td className="p-3 text-right text-emerald-400 font-bold">
                          {lot.pregnancy_rate.toFixed(1)}%
                        </td>
                        <td className="p-3 text-center font-sans">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            lot.status === 'concluido' ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' :
                            lot.status === 'em_andamento' ? 'text-blue-400 bg-blue-500/10 border border-blue-500/20' :
                            'text-slate-400 bg-slate-800'
                          }`}>
                            {lot.status === 'concluido' ? 'Concluído' : lot.status === 'em_andamento' ? 'Em andamento' : 'Planejado'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ======================================================== */}
            {/* ABA 4: ESTOQUE DE SÊMEN & TOUROS */}
            {/* ======================================================== */}
            {activeTab === 'semen' && (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3">Touro Reprodutor</th>
                      <th className="p-3">Partida</th>
                      <th className="p-3 text-right">Compradas</th>
                      <th className="p-3 text-right">Utilizadas</th>
                      <th className="p-3 text-right">Perdas</th>
                      <th className="p-3 text-right font-bold">Saldo Disponível</th>
                      <th className="p-3 text-right">% Utilizado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-900/60 font-mono">
                    {semenBatches.map((b) => {
                      const current = b.initial_quantity - b.used_quantity - b.lost_quantity;
                      const usedPct = b.initial_quantity > 0 ? ((b.used_quantity / b.initial_quantity) * 100).toFixed(1) : '0';
                      return (
                        <tr key={b.id} className="hover:bg-slate-800/50 transition-colors">
                          <td className="p-3 font-bold text-white font-sans">{b.bulls?.name || 'Touro'}</td>
                          <td className="p-3">
                            <span className="bg-slate-800 text-amber-400 border border-slate-700 px-2 py-0.5 rounded font-mono text-xs">
                              {b.batch_number}
                            </span>
                          </td>
                          <td className="p-3 text-right">{b.initial_quantity}</td>
                          <td className="p-3 text-right">{b.used_quantity}</td>
                          <td className="p-3 text-right text-rose-400 font-bold">{b.lost_quantity}</td>
                          <td className={`p-3 text-right font-black ${current < 10 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {current} doses
                          </td>
                          <td className="p-3 text-right text-slate-400">{usedPct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* 6. Assinatura e Rodapé Oficial para Laudo Técnico / Impressão */}
        <div className="pt-8 pb-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-slate-400 print:mt-6">
          <div className="space-y-1 text-center sm:text-left">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
              Sistema IATF Master — Gestão Reprodutiva e Zootécnica de Alta Precisão
            </p>
            <p className="text-slate-400">
              Data de Emissão do Laudo: <strong className="text-slate-300">{new Date().toLocaleDateString('pt-BR')}</strong> às {new Date().toLocaleTimeString('pt-BR').slice(0, 5)}
            </p>
          </div>
          <div className="text-center sm:text-right min-w-64 pt-4 sm:pt-0">
            <div className="w-60 h-px bg-slate-600 mx-auto sm:ml-auto sm:mr-0 mb-2" />
            <p className="font-bold text-white uppercase text-xs">{vetDisplayName}</p>
            <p className="text-[11px] text-emerald-400 font-mono">{vetCrmv}</p>
            <span className="text-[10px] text-slate-500 block">Médico Veterinário Responsável Técnico</span>
          </div>
        </div>
      </div>
    </div>
  );
}
