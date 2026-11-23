'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  getLotAnimals, 
  getCurrentUserRoleAndTenant, 
  type LotStat, 
  type LotAnimal 
} from '@/lib/db';
import { MASTER_CRIA_LOGO_BASE64 } from '@/components/masterCriaLogoBase64';
import { 
  Printer, 
  Download, 
  RefreshCw, 
  Layers, 
  Search,
  ShieldCheck
} from 'lucide-react';
import { exportFichaRelatorioFinalExcel } from '@/lib/excelFichaRelatorioExport';

interface Props {
  farms: { id: string; name: string }[];
  activeFarmId: string | null;
  activeSeasonId: string | null;
  lots: LotStat[];
}

export default function FichaRelatorioFinalView({
  farms,
  lots
}: Props) {
  // Lote selecionado
  const [selectedLotId, setSelectedLotId] = useState<string>('');
  const [animals, setAnimals] = useState<LotAnimal[]>([]);
  const [loading, setLoading] = useState(false);

  // Informações de Role / Tenant
  const [isMasterCria, setIsMasterCria] = useState(false);
  const [orgName, setOrgName] = useState<string>('');

  // Metadados da Ficha (Campos de Cabeçalho)
  const [produtor, setProdutor] = useState('');
  const [propriedade, setPropriedade] = useState('');
  const [dataFicha, setDataFicha] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaTermino, setHoraTermino] = useState('');
  const [observacoes, setObservacoes] = useState('');

  // Filtro de busca na tabela
  const [searchTerm, setSearchTerm] = useState('');

  // Identificação do tenant/role ao montar
  useEffect(() => {
    async function loadAuth() {
      const authData = await getCurrentUserRoleAndTenant();
      setIsMasterCria(authData.isMasterCria);
      setOrgName(authData.orgName || '');
    }
    loadAuth();
  }, []);

  // Seleciona o primeiro lote disponível se nenhum selecionado
  useEffect(() => {
    if (lots.length > 0 && !selectedLotId) {
      setSelectedLotId(lots[0].id);
    }
  }, [lots, selectedLotId]);

  // Carrega os animais e metadados quando o lote muda
  useEffect(() => {
    if (!selectedLotId) {
      setAnimals([]);
      return;
    }

    const currentLot = lots.find((l) => l.id === selectedLotId);
    if (currentLot) {
      const currentFarm = farms.find((f) => f.id === currentLot.farm_id);
      setPropriedade(currentLot.farm_name || currentFarm?.name || '');
      setProdutor(orgName || 'Produtor');
      setDataFicha(
        currentLot.dg_planned_date 
          ? new Date(currentLot.dg_planned_date + 'T12:00:00').toLocaleDateString('pt-BR')
          : new Date().toLocaleDateString('pt-BR')
      );
    }

    async function fetchAnimals() {
      setLoading(true);
      try {
        const data = await getLotAnimals(selectedLotId, true);
        setAnimals(data);
      } catch (err) {
        console.error('Erro ao buscar animais do lote:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchAnimals();
  }, [selectedLotId, lots, farms, orgName]);

  // Estatísticas calculadas da ficha
  const stats = useMemo(() => {
    const total = animals.length;
    let prenhas = 0;
    let vazias = 0;
    const porTouro: Record<string, { total: number; prenhas: number }> = {};
    const porCategoria: Record<string, { total: number; prenhas: number }> = {};

    animals.forEach((a) => {
      const isPrenha = 
        a.pregnancy_status?.toLowerCase().includes('prenh') ||
        a.pregnancy_status === 'PRENHA' ||
        a.pregnancy_status === 'P';

      if (isPrenha) prenhas++;
      else vazias++;

      const touroNome = a.bulls?.name || 'Não Informado';
      if (!porTouro[touroNome]) porTouro[touroNome] = { total: 0, prenhas: 0 };
      porTouro[touroNome].total++;
      if (isPrenha) porTouro[touroNome].prenhas++;

      const catNome = a.animals?.animal_categories?.name || 'Não Classificada';
      if (!porCategoria[catNome]) porCategoria[catNome] = { total: 0, prenhas: 0 };
      porCategoria[catNome].total++;
      if (isPrenha) porCategoria[catNome].prenhas++;
    });

    const taxa = total > 0 ? (prenhas / total) * 100 : 0;
    return { total, prenhas, vazias, taxa, porTouro, porCategoria };
  }, [animals]);

  // Filtro de animais
  const filteredAnimals = useMemo(() => {
    if (!searchTerm) return animals;
    const term = searchTerm.toLowerCase();
    return animals.filter((a) => {
      const brinco = a.animals?.tag_number?.toLowerCase() || '';
      const touro = a.bulls?.name?.toLowerCase() || '';
      const cat = a.animals?.animal_categories?.name?.toLowerCase() || '';
      return brinco.includes(term) || touro.includes(term) || cat.includes(term);
    });
  }, [animals, searchTerm]);

  // Formata data DD/MM/AAAA
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00');
      return d.toLocaleDateString('pt-BR');
    } catch {
      return dateStr;
    }
  };

  // Formata mês de previsão de parto
  const formatMonthParto = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00');
      return d.toLocaleDateString('pt-BR');
    } catch {
      return dateStr;
    }
  };

  // Dispara Impressão A4 / Salvar em PDF
  const handlePrint = () => {
    window.print();
  };

  // Exporta no formato exato da planilha de campo original com estilização profissional
  const handleExportXLSX = async () => {
    const currentLot = lots.find((l) => l.id === selectedLotId);
    const lotName = currentLot?.code || 'Lote';
    const currentLotIaDate = currentLot?.ia_planned_date ? formatDate(currentLot.ia_planned_date) : '-';
    const currentLotDgDate = currentLot?.dg_planned_date ? formatDate(currentLot.dg_planned_date) : '-';

    await exportFichaRelatorioFinalExcel({
      lotName,
      produtor: produtor || 'RAMIRO ANTÔNIO DAVI',
      propriedade: propriedade || 'FAZENDA SÃO LUCAS',
      dataFicha: dataFicha || '',
      horaInicio: horaInicio || '',
      horaTermino: horaTermino || '',
      observacoes: observacoes || '',
      isMasterCria,
      iaPlannedDate: currentLotIaDate,
      dgPlannedDate: currentLotDgDate,
      animals: animals.map((a, index) => {
        const isPrenha = 
          a.pregnancy_status?.toLowerCase().includes('prenh') ||
          a.pregnancy_status === 'PRENHA' ||
          a.pregnancy_status === 'P';

        return {
          seq: index + 1,
          tagNumber: a.animals?.tag_number || 'SN',
          category: a.animals?.animal_categories?.name || 'MULTÍPARA',
          property: a.animals?.properties?.name || 'SEDE',
          bullName: a.bulls?.name || 'Rep. Touro',
          breed: a.animals?.breeds?.name || 'N.E',
          iaDate: currentLotIaDate,
          diagnostico: isPrenha ? 'PRENHA' : 'Não Prenha ',
          dgDate: currentLotDgDate,
          parturitionDate: isPrenha ? formatMonthParto(a.expected_parturition_date) : '',
        };
      }),
      stats,
    });
  };

  const currentLot = lots.find((l) => l.id === selectedLotId);
  const currentLotIaDate = currentLot?.ia_planned_date ? formatDate(currentLot.ia_planned_date) : '-';
  const currentLotDgDate = currentLot?.dg_planned_date ? formatDate(currentLot.dg_planned_date) : '-';

  return (
    <div className="space-y-6">
      {/* ======================================================== */}
      {/* CONTROLES DE FILTRO E CONFIGURAÇÃO (SOMENTE NA TELA)   */}
      {/* ======================================================== */}
      <div className="print:hidden glass-card bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Ficha Relatório Final (Modelo de Campo XLSX)
                {isMasterCria ? (
                  <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Master Cria Oficial
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full">
                    Layout Neutro
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                Layout de impressão idêntico ao modelo da planilha original, com as 10 colunas e grade técnica oficial.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={animals.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-950/40 disabled:opacity-50 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Imprimir / PDF
            </button>
            <button
              onClick={handleExportXLSX}
              disabled={animals.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              Exportar XLSX
            </button>
          </div>
        </div>

        {/* Linha de Seleção de Lote e Metadados Editáveis */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-2 border-t border-slate-800/80">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Selecionar Lote
            </label>
            <select
              value={selectedLotId}
              onChange={(e) => setSelectedLotId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {l.farm_name || 'Fazenda'} ({l.worked_qty} fêmeas)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Produtor
            </label>
            <input
              type="text"
              value={produtor}
              onChange={(e) => setProdutor(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Propriedade
            </label>
            <input
              type="text"
              value={propriedade}
              onChange={(e) => setPropriedade(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Hora Início
            </label>
            <input
              type="time"
              value={horaInicio}
              onChange={(e) => setHoraInicio(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Hora Término
            </label>
            <input
              type="time"
              value={horaTermino}
              onChange={(e) => setHoraTermino(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Observações e Busca */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2">
            <input
              type="text"
              placeholder="Observações de campo..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 placeholder:text-slate-500"
            />
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filtrar por brinco, touro ou categoria..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 placeholder:text-slate-500"
            />
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* FOLHA DE RELATÓRIO IDÊNTICA AO XLSX ORIGINAL             */}
      {/* ======================================================== */}
      <div 
        id="printable-ficha-final" 
        className="p-6 sm:p-8 rounded-none shadow-xl border border-slate-300 print:border-none print:shadow-none print:p-0 print:m-0 w-full"
        style={{ backgroundColor: '#ffffff', color: '#000000', fontFamily: 'Arial, sans-serif' }}
      >
        {/* Linha de Título e Logomarca Condicional */}
        <div className="relative flex items-center justify-center mb-6 pt-2">
          {/* Logomarca condicional à esquerda (somente para role mastercriareproducao) */}
          {isMasterCria && (
            <div className="absolute left-0 top-0 flex items-center gap-2">
              <img
                src={MASTER_CRIA_LOGO_BASE64}
                alt="Master Cria Reprodução Animal"
                className="w-16 h-16 object-contain"
              />
            </div>
          )}

          {/* Título Oficial Exato da Planilha: Ficha Relatório Final. */}
          <div className="text-center">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-black">
              Ficha Relatório Final.
            </h1>
          </div>
        </div>

        {/* Quadro de Metadados com Bordas Pretas Exatas do XLSX */}
        <div className="border border-black text-xs font-bold text-black mb-1">
          {/* Linha 5 da Planilha: Produtor e Propriedade */}
          <div className="px-3 py-1.5 border-b border-black text-center uppercase tracking-wide">
            Produtor:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{produtor || 'RAMIRO ANTÔNIO DAVI'}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- Propriedade: {propriedade || 'FAZENDA SÃO LUCAS'}
          </div>

          {/* Linha 6 da Planilha: Data, Hora início e Hora término */}
          <div className="grid grid-cols-12 divide-x divide-black border-b border-black">
            <div className="col-span-6 px-3 py-1.5">
              Data: {dataFicha || '-'}
            </div>
            <div className="col-span-3 px-3 py-1.5">
              Hora início: {horaInicio || ''}
            </div>
            <div className="col-span-3 px-3 py-1.5">
              Hora término: {horaTermino || ''}
            </div>
          </div>

          {/* Linha 7 da Planilha: Observações */}
          <div className="px-3 py-2 min-h-8">
            Observações: {observacoes || ''}
          </div>
        </div>

        {/* Espaço antes da tabela (linhas 8 e 9 vazias no Excel) */}
        <div className="h-4" />

        {/* TABELA OFICIAL DE 10 COLUNAS COM BORDA TOTAL EM GRADE */}
        {loading ? (
          <div className="py-12 text-center text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Carregando animais do lote...</span>
          </div>
        ) : filteredAnimals.length === 0 ? (
          <div className="py-12 text-center text-slate-500 font-bold border border-black">
            Nenhum animal encontrado para este lote.
          </div>
        ) : (
          <table className="w-full border-collapse border border-black text-[10px] text-black">
            <thead>
              <tr className="border border-black font-bold uppercase text-[9px]">
                <th className="border border-black py-1.5 px-1 text-center w-8">Seq.</th>
                <th className="border border-black py-1.5 px-2 text-center">Número da fêmea</th>
                <th className="border border-black py-1.5 px-2 text-center">CATEGORIA</th>
                <th className="border border-black py-1.5 px-2 text-center">RETIRO</th>
                <th className="border border-black py-1.5 px-2 text-center">TOURO</th>
                <th className="border border-black py-1.5 px-1 text-center w-12">RAÇA</th>
                <th className="border border-black py-1.5 px-2 text-center">DATA I.A</th>
                <th className="border border-black py-1.5 px-2 text-center">DIAGNÓSTICO</th>
                <th className="border border-black py-1.5 px-2 text-center">DATA D.G</th>
                <th className="border border-black py-1.5 px-2 text-center">MÊS P.P</th>
              </tr>
            </thead>
            <tbody>
              {filteredAnimals.map((a, idx) => {
                const isPrenha = 
                  a.pregnancy_status?.toLowerCase().includes('prenh') ||
                  a.pregnancy_status === 'PRENHA' ||
                  a.pregnancy_status === 'P';

                return (
                  <tr key={a.id || idx} className="border border-black">
                    <td className="border border-black py-1 px-1 text-center font-bold">
                      {idx + 1}
                    </td>
                    <td className="border border-black py-1 px-2 text-center font-bold">
                      {a.animals?.tag_number || 'SN'}
                    </td>
                    <td className="border border-black py-1 px-2 text-center font-bold uppercase">
                      {a.animals?.animal_categories?.name || 'MULTÍPARA'}
                    </td>
                    <td className="border border-black py-1 px-2 text-center font-bold uppercase">
                      {a.animals?.properties?.name || 'SEDE'}
                    </td>
                    <td className="border border-black py-1 px-2 text-center font-bold">
                      {a.bulls?.name || 'Rep. Touro'}
                    </td>
                    <td className="border border-black py-1 px-1 text-center font-bold uppercase">
                      {a.animals?.breeds?.name || 'N.E'}
                    </td>
                    <td className="border border-black py-1 px-2 text-center font-bold">
                      {currentLotIaDate}
                    </td>
                    <td className="border border-black py-1 px-2 text-center font-bold">
                      {isPrenha ? 'PRENHA' : 'Não Prenha '}
                    </td>
                    <td className="border border-black py-1 px-2 text-center font-bold">
                      {currentLotDgDate}
                    </td>
                    <td className="border border-black py-1 px-2 text-center font-bold">
                      {isPrenha ? formatMonthParto(a.expected_parturition_date) : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Rodapé Estatístico Resumido Oficial */}
        <div className="mt-6 pt-3 border-t-2 border-black space-y-3">
          <div 
            className="flex flex-wrap items-center justify-between gap-4 text-xs font-bold text-black border border-black p-2.5"
            style={{ backgroundColor: '#ffffff', color: '#000000', borderColor: '#000000' }}
          >
            <div>Total Trabalhadas: <span>{stats.total}</span></div>
            <div>Prenhas: <span>{stats.prenhas}</span> ({stats.taxa.toFixed(1)}%)</div>
            <div>Não Prenhas: <span>{stats.vazias}</span> ({stats.total > 0 ? ((stats.vazias / stats.total) * 100).toFixed(1) : 0}%)</div>
            <div>Taxa de Concepção: <span>{stats.taxa.toFixed(1)}%</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
