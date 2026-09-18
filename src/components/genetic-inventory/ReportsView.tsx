'use client';

import React, { useState, useMemo } from 'react';
import type { InventoryBalance, SemenTank, GeneticClient } from '@/lib/types/genetic-inventory';
import { 
  FileText, 
  Download, 
  Layers, 
  AlertTriangle, 
  User, 
  BarChart3, 
  Dna, 
  Package 
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface ReportsViewProps {
  farmName?: string;
  balances: InventoryBalance[];
  tanks: SemenTank[];
  clients: GeneticClient[];
}

type ReportType = 
  | 'by_tank' 
  | 'by_animal' 
  | 'by_breed' 
  | 'by_sexing' 
  | 'by_client' 
  | 'low_stock';

export default function ReportsView({
  farmName = 'Fazenda',
  balances,
  tanks,
  clients,
}: ReportsViewProps) {
  const [activeReport, setActiveReport] = useState<ReportType>('by_tank');

  // 1. Relatório por Botijão
  const tankReportData = useMemo(() => {
    return tanks.map((tank) => {
      const tankBalances = balances.filter((b) => b.tank_id === tank.id);
      const totalDoses = tankBalances.reduce((acc, b) => acc + (b.quantity_available || 0), 0);
      const batchesCount = new Set(tankBalances.map((b) => b.batch_id)).size;
      const totalValue = tankBalances.reduce(
        (acc, b) => acc + (b.quantity_available || 0) * (b.genetic_material_batches?.cost_per_unit || 0),
        0
      );

      return {
        id: tank.id,
        number: tank.number,
        name: tank.name,
        currentN2: tank.current_nitrogen_level,
        status: tank.status,
        totalDoses,
        batchesCount,
        totalValue,
      };
    });
  }, [tanks, balances]);

  // 2. Relatório por Animal / Genética
  const animalReportData = useMemo(() => {
    const map = new Map<string, {
      name: string;
      code: string;
      breed: string;
      type: string;
      totalDoses: number;
      batchesCount: number;
      tanks: Set<string>;
    }>();

    balances.forEach((b) => {
      const mat = b.genetic_material_batches?.genetic_materials;
      const isSemen = mat?.type === 'SEMEN';
      const name = isSemen ? (mat?.bulls?.name || 'Touro') : (mat?.donor_name || mat?.animals?.tag_number || 'Doadora');
      const code = (isSemen ? mat?.bulls?.code : mat?.donor_rgd) || '-';
      const breed = mat?.breeds?.name || '-';
      const type = isSemen ? 'Sêmen' : 'Embrião';

      const key = `${name}_${code}`;
      const entry = map.get(key) || {
        name,
        code,
        breed,
        type,
        totalDoses: 0,
        batchesCount: 0,
        tanks: new Set<string>(),
      };

      entry.totalDoses += b.quantity_available || 0;
      entry.batchesCount += 1;
      if (b.semen_tanks?.number) entry.tanks.add(b.semen_tanks.number);

      map.set(key, entry);
    });

    return Array.from(map.values()).sort((a, b) => b.totalDoses - a.totalDoses);
  }, [balances]);

  // 3. Relatório por Raça
  const breedReportData = useMemo(() => {
    const map = new Map<string, { breed: string; totalDoses: number; animalsCount: Set<string> }>();

    balances.forEach((b) => {
      const breed = b.genetic_material_batches?.genetic_materials?.breeds?.name || 'Não Informada';
      const animal = b.genetic_material_batches?.genetic_materials?.bulls?.name || b.genetic_material_batches?.genetic_materials?.donor_name || 'Animal';
      const entry = map.get(breed) || { breed, totalDoses: 0, animalsCount: new Set<string>() };
      entry.totalDoses += b.quantity_available || 0;
      entry.animalsCount.add(animal);
      map.set(breed, entry);
    });

    return Array.from(map.values()).sort((a, b) => b.totalDoses - a.totalDoses);
  }, [balances]);

  // 4. Relatório por Sexagem
  const sexingReportData = useMemo(() => {
    const map = new Map<string, { sexing: string; totalDoses: number; count: number }>();

    balances.forEach((b) => {
      const sex = b.genetic_material_batches?.genetic_materials?.sexing || 'convencional';
      const entry = map.get(sex) || { sexing: sex, totalDoses: 0, count: 0 };
      entry.totalDoses += b.quantity_available || 0;
      entry.count += 1;
      map.set(sex, entry);
    });

    return Array.from(map.values()).sort((a, b) => b.totalDoses - a.totalDoses);
  }, [balances]);

  // 5. Relatório por Cliente
  const clientReportData = useMemo(() => {
    let ownDoses = 0;
    const clientMap = new Map<string, { clientName: string; doc: string; totalDoses: number; count: number }>();

    clients.forEach((c) => {
      clientMap.set(c.id, { clientName: c.name, doc: c.document_number || '-', totalDoses: 0, count: 0 });
    });

    balances.forEach((b) => {
      if (!b.owner_client_id) {
        ownDoses += b.quantity_available || 0;
      } else {
        const clientName = b.genetic_clients?.name || 'Cliente';
        const doc = b.genetic_clients?.document_number || '-';
        const entry = clientMap.get(b.owner_client_id) || { clientName, doc, totalDoses: 0, count: 0 };
        entry.totalDoses += b.quantity_available || 0;
        entry.count += 1;
        clientMap.set(b.owner_client_id, entry);
      }
    });

    const list = Array.from(clientMap.values());
    return {
      ownDoses,
      clientList: list.sort((a, b) => b.totalDoses - a.totalDoses),
    };
  }, [balances, clients]);

  // 6. Relatório de Estoque Baixo
  const lowStockData = useMemo(() => {
    return balances.filter((b) => b.quantity_available < 10).sort((a, b) => a.quantity_available - b.quantity_available);
  }, [balances]);

  // Exportar Relatório Ativo em Excel
  const handleExportCurrentReport = () => {
    let data: Record<string, string | number | null | undefined>[] = [];
    let sheetName = 'Relatorio';

    if (activeReport === 'by_tank') {
      sheetName = 'Estoque por Botijão';
      data = tankReportData.map((t) => ({
        'Número': t.number,
        'Nome do Botijão': t.name,
        'Nível de N2 (%)': t.currentN2,
        'Total de Doses': t.totalDoses,
        'Qtd. de Partidas': t.batchesCount,
        'Valor Total (R$)': t.totalValue,
        'Status': t.status,
      }));
    } else if (activeReport === 'by_animal') {
      sheetName = 'Estoque por Animal';
      data = animalReportData.map((a) => ({
        'Animal': a.name,
        'Código / RGD': a.code,
        'Tipo': a.type,
        'Raça': a.breed,
        'Total de Doses': a.totalDoses,
        'Partidas': a.batchesCount,
        'Botijões Presentes': Array.from(a.tanks).join(', '),
      }));
    } else if (activeReport === 'by_breed') {
      sheetName = 'Estoque por Raça';
      data = breedReportData.map((b) => ({
        'Raça': b.breed,
        'Total de Doses': b.totalDoses,
        'Quantidade de Animais': b.animalsCount.size,
      }));
    } else if (activeReport === 'by_sexing') {
      sheetName = 'Estoque por Sexagem';
      data = sexingReportData.map((s) => ({
        'Tipo de Sexagem': s.sexing,
        'Total de Doses': s.totalDoses,
        'Lotes': s.count,
      }));
    } else if (activeReport === 'by_client') {
      sheetName = 'Estoque por Proprietário';
      data = [
        { 'Proprietário': 'Fazenda (Estoque Próprio)', 'Documento': '-', 'Total Doses': clientReportData.ownDoses },
        ...clientReportData.clientList.map((c) => ({
          'Proprietário': c.clientName,
          'Documento': c.doc,
          'Total Doses': c.totalDoses,
        })),
      ];
    } else if (activeReport === 'low_stock') {
      sheetName = 'Estoque Baixo';
      data = lowStockData.map((b) => {
        const mat = b.genetic_material_batches?.genetic_materials;
        return {
          'Animal': mat?.bulls?.name || mat?.donor_name || 'Animal',
          'Partida': b.genetic_material_batches?.batch_number,
          'Botijão': b.semen_tanks?.number,
          'Caneca': `Caneca ${b.semen_tank_canisters?.position_number}`,
          'Saldo Remanescente': b.quantity_available,
        };
      });
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Relatorio_${sheetName.replace(/\s+/g, '_')}_${dateStr}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Header com Tabs de Relatório */}
      <div className="glass-card bg-slate-900/90 p-5 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            Relatórios Consolidados de Estoque Genético
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Reconciliação e consolidação analítica ({farmName}) por botijão, animal, raça, sexagem e proprietário.
          </p>
        </div>

        <button
          onClick={handleExportCurrentReport}
          className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md self-start md:self-auto"
        >
          <Download className="w-4 h-4" /> Exportar Este Relatório (.xlsx)
        </button>
      </div>

      {/* Relatório Seletor Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <button
          onClick={() => setActiveReport('by_tank')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
            activeReport === 'by_tank'
              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4 mb-2 text-emerald-400" />
          <span className="text-xs font-bold">Por Botijão</span>
        </button>

        <button
          onClick={() => setActiveReport('by_animal')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
            activeReport === 'by_animal'
              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Dna className="w-4 h-4 mb-2 text-cyan-400" />
          <span className="text-xs font-bold">Por Animal</span>
        </button>

        <button
          onClick={() => setActiveReport('by_breed')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
            activeReport === 'by_breed'
              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Package className="w-4 h-4 mb-2 text-purple-400" />
          <span className="text-xs font-bold">Por Raça</span>
        </button>

        <button
          onClick={() => setActiveReport('by_sexing')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
            activeReport === 'by_sexing'
              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4 mb-2 text-teal-400" />
          <span className="text-xs font-bold">Por Sexagem</span>
        </button>

        <button
          onClick={() => setActiveReport('by_client')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
            activeReport === 'by_client'
              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <User className="w-4 h-4 mb-2 text-amber-400" />
          <span className="text-xs font-bold">Por Proprietário</span>
        </button>

        <button
          onClick={() => setActiveReport('low_stock')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
            activeReport === 'low_stock'
              ? 'bg-amber-500/15 border-amber-500 text-amber-300'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4 mb-2 text-amber-400" />
          <span className="text-xs font-bold">Estoque Baixo (&lt;10)</span>
        </button>
      </div>

      {/* Tabela do Relatório Ativo */}
      <div className="glass-card bg-slate-900/95 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          {activeReport === 'by_tank' && (
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="p-3">Código</th>
                  <th className="p-3">Botijão</th>
                  <th className="p-3">Nível Nitrogênio</th>
                  <th className="p-3 text-right">Partidas Armazenadas</th>
                  <th className="p-3 text-right">Total de Doses</th>
                  <th className="p-3 text-right">Valor em Estoque (R$)</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 bg-slate-900/60 font-mono">
                {tankReportData.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/50">
                    <td className="p-3 font-bold text-emerald-400">{t.number}</td>
                    <td className="p-3 font-sans text-white font-medium">{t.name}</td>
                    <td className="p-3 text-cyan-400 font-bold">{t.currentN2}%</td>
                    <td className="p-3 text-right">{t.batchesCount}</td>
                    <td className="p-3 text-right font-bold text-white text-sm">{t.totalDoses}</td>
                    <td className="p-3 text-right text-slate-300">
                      {t.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="p-3 text-center font-sans">
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeReport === 'by_animal' && (
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="p-3">Tipo</th>
                  <th className="p-3">Animal / Genética</th>
                  <th className="p-3">Código / RGD</th>
                  <th className="p-3">Raça</th>
                  <th className="p-3">Botijões Presentes</th>
                  <th className="p-3 text-right">Partidas</th>
                  <th className="p-3 text-right">Total Doses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 bg-slate-900/60 font-mono">
                {animalReportData.map((a, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/50">
                    <td className="p-3 font-sans">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {a.type}
                      </span>
                    </td>
                    <td className="p-3 font-sans font-bold text-white text-xs">{a.name}</td>
                    <td className="p-3 text-slate-400">{a.code}</td>
                    <td className="p-3 font-sans text-slate-300">{a.breed}</td>
                    <td className="p-3 text-emerald-400">{Array.from(a.tanks).join(', ') || '-'}</td>
                    <td className="p-3 text-right">{a.batchesCount}</td>
                    <td className="p-3 text-right font-extrabold text-white text-sm">{a.totalDoses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeReport === 'by_breed' && (
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="p-3">Raça</th>
                  <th className="p-3 text-right">Animais Diferentes</th>
                  <th className="p-3 text-right">Total de Doses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 bg-slate-900/60 font-mono">
                {breedReportData.map((b, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/50">
                    <td className="p-3 font-sans font-bold text-white text-xs">{b.breed}</td>
                    <td className="p-3 text-right">{b.animalsCount.size}</td>
                    <td className="p-3 text-right font-extrabold text-emerald-400 text-sm">{b.totalDoses} doses</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeReport === 'by_sexing' && (
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="p-3">Tipo de Sexagem</th>
                  <th className="p-3 text-right">Lotes no Estoque</th>
                  <th className="p-3 text-right">Total de Doses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 bg-slate-900/60 font-mono">
                {sexingReportData.map((s, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/50">
                    <td className="p-3 font-sans font-bold text-white text-xs capitalize">{s.sexing}</td>
                    <td className="p-3 text-right">{s.count}</td>
                    <td className="p-3 text-right font-extrabold text-cyan-400 text-sm">{s.totalDoses} doses</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeReport === 'by_client' && (
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="p-3">Proprietário</th>
                  <th className="p-3">Documento (CPF/CNPJ)</th>
                  <th className="p-3 text-right">Doses sob Custódia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 bg-slate-900/60 font-mono">
                <tr className="hover:bg-slate-800/50 bg-slate-950/40">
                  <td className="p-3 font-sans font-bold text-emerald-400">Fazenda (Estoque Próprio)</td>
                  <td className="p-3 text-slate-500">-</td>
                  <td className="p-3 text-right font-extrabold text-white text-sm">{clientReportData.ownDoses} doses</td>
                </tr>
                {clientReportData.clientList.map((c, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/50">
                    <td className="p-3 font-sans font-bold text-amber-300">{c.clientName}</td>
                    <td className="p-3 text-slate-400">{c.doc}</td>
                    <td className="p-3 text-right font-extrabold text-amber-400 text-sm">{c.totalDoses} doses</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeReport === 'low_stock' && (
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="p-3">Animal</th>
                  <th className="p-3">Partida</th>
                  <th className="p-3">Localização (Botijão / Caneca)</th>
                  <th className="p-3 text-right">Saldo Remanescente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 bg-slate-900/60 font-mono">
                {lowStockData.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400 font-sans">
                      Nenhum item com estoque abaixo de 10 doses no momento.
                    </td>
                  </tr>
                ) : (
                  lowStockData.map((b) => {
                    const mat = b.genetic_material_batches?.genetic_materials;
                    const aName = mat?.type === 'SEMEN' ? mat?.bulls?.name : mat?.donor_name;
                    return (
                      <tr key={b.id} className="hover:bg-slate-800/50">
                        <td className="p-3 font-sans font-bold text-white">{aName}</td>
                        <td className="p-3 text-amber-400">{b.genetic_material_batches?.batch_number}</td>
                        <td className="p-3 font-sans">
                          {b.semen_tanks?.number} (Caneca #{b.semen_tank_canisters?.position_number})
                        </td>
                        <td className="p-3 text-right font-black text-rose-400 text-sm">
                          {b.quantity_available} doses
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
