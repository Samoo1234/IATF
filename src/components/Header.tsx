'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Menu, 
  Building2, 
  Plus,
  CalendarDays,
  ChevronDown,
  Check,
  Sparkles
} from 'lucide-react';
import { getOrgMetadata, getFarms, type OrgMetadata, type Farm } from '@/lib/db';

interface HeaderProps {
  onOpenMobileMenu: () => void;
  collapsed?: boolean;
}

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard Executivo', subtitle: 'Visão Geral dos Indicadores de Taxa de Concepção e DG' },
  '/agenda': { title: 'Agenda de Campo', subtitle: 'Cronograma Operacional de Manejos e Aplicações' },
  '/lots': { title: 'Lotes de IATF', subtitle: 'Gestão de Lotes, Protocolos e Estatísticas' },
  '/animals': { title: 'Matrizes & Rebanho', subtitle: 'Cadastro Geral de Fêmeas e Histórico Reprodutivo' },
  '/protocols': { title: 'Protocolos Hormonais', subtitle: 'Configuração de Etapas, D0, D7, D9, IA e Fármacos' },
  '/inputs': { title: 'Estoque de Sêmen & Fármacos', subtitle: 'Controle de Doses, Touros, Centrais e Perdas' },
  '/reports': { title: 'Relatórios & Inteligência', subtitle: 'Análise de Desempenho, Touros e Inseminadores' },
  '/import': { title: 'Importação de Planilhas', subtitle: 'Importe dados de matrizes e lotes em Excel (.xlsx)' },
  '/registries': { title: 'Cadastros Gerais', subtitle: 'Fazendas, Retiros, Raças e Categorias' },
};

export default function Header({ onOpenMobileMenu }: HeaderProps) {
  const pathname = usePathname();
  const [metadata, setMetadata] = useState<OrgMetadata | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [activeFarmId, setActiveFarmId] = useState<string>('all');
  const [farmDropdownOpen, setFarmDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      const [meta, farmsList] = await Promise.all([
        getOrgMetadata(),
        getFarms()
      ]);
      setMetadata(meta);
      setFarms(farmsList);

      // Load saved active farm from localStorage
      const savedFarm = localStorage.getItem('iatf_active_farm_id');
      if (savedFarm) {
        setActiveFarmId(savedFarm);
      } else if (farmsList.length > 0) {
        setActiveFarmId(farmsList[0].id);
        localStorage.setItem('iatf_active_farm_id', farmsList[0].id);
      }
    }
    load();

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setFarmDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [pathname]);

  if (pathname === '/login') {
    return null;
  }

  const handleSelectFarm = (farmId: string) => {
    setActiveFarmId(farmId);
    localStorage.setItem('iatf_active_farm_id', farmId);
    setFarmDropdownOpen(false);
    // Dispara evento para sincronizar outros componentes
    window.dispatchEvent(new CustomEvent('iatf_farm_changed', { detail: { farmId } }));
  };

  const selectedFarm = farms.find(f => f.id === activeFarmId);
  const activeFarmName = activeFarmId === 'all' 
    ? 'Todas as Fazendas' 
    : (selectedFarm?.name || metadata?.farm?.name || 'Fazenda Principal');

  const currentPage = PAGE_TITLES[pathname] || {
    title: 'Plataforma IATF Master',
    subtitle: 'Gestão Reprodutiva Bovina de Alta Performance'
  };

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl px-4 sm:px-6 lg:px-8 flex items-center justify-between transition-all">
      
      {/* Left: Mobile Toggle + Breadcrumb / Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 md:hidden border border-slate-800"
          title="Abrir Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
            {currentPage.title}
          </h1>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            {currentPage.subtitle}
          </p>
        </div>
      </div>

      {/* Right: Farm Switcher Dropdown & Quick Actions */}
      <div className="flex items-center gap-3">
        
        {/* Farm Switcher Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setFarmDropdownOpen(!farmDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/40 transition-all text-xs group cursor-pointer shadow-sm"
            title="Clique para alternar de fazenda"
          >
            <div className="w-5 h-5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Building2 className="w-3 h-3" />
            </div>

            <div className="text-left hidden sm:block">
              <span className="font-bold text-slate-200 group-hover:text-white transition-colors block leading-tight max-w-35 truncate">
                {activeFarmName}
              </span>
              <span className="text-[9px] text-slate-400 block leading-tight">
                {activeFarmId === 'all' ? 'Consolidado' : 'Safra 25/26'}
              </span>
            </div>

            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${farmDropdownOpen ? 'rotate-180 text-emerald-400' : ''}`} />
          </button>

          {/* Farm Switcher Popup */}
          {farmDropdownOpen && (
            <div className="absolute right-0 top-12 w-72 rounded-2xl border border-slate-800 bg-slate-900/95 backdrop-blur-2xl shadow-2xl p-2.5 space-y-2 z-50 text-xs animate-in fade-in slide-in-from-top-2">
              <div className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Alternar Fazenda</span>
                <span className="text-emerald-400 font-mono">({farms.length} cadastradas)</span>
              </div>

              <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
                {/* Opção: Todas as Fazendas */}
                <button
                  onClick={() => handleSelectFarm('all')}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all text-left ${
                    activeFarmId === 'all'
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold'
                      : 'hover:bg-slate-800/80 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-semibold leading-tight">Todas as Fazendas</p>
                      <p className="text-[10px] text-slate-400 leading-tight">Visão consolidada da operação</p>
                    </div>
                  </div>
                  {activeFarmId === 'all' && <Check className="w-4 h-4 text-emerald-400 stroke-3" />}
                </button>

                {/* Lista de Fazendas Individuais */}
                {farms.map((farm) => {
                  const isSelected = activeFarmId === farm.id;
                  return (
                    <button
                      key={farm.id}
                      onClick={() => handleSelectFarm(farm.id)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all text-left ${
                        isSelected
                          ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold'
                          : 'hover:bg-slate-800/80 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 shrink-0">
                          <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <div className="overflow-hidden">
                          <p className="font-semibold leading-tight truncate">{farm.name}</p>
                          <p className="text-[10px] text-slate-400 leading-tight truncate">
                            {farm.city ? `${farm.city} - ${farm.state || 'MT'}` : (farm.technical_responsible || 'Fazenda Ativa')}
                          </p>
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-emerald-400 stroke-3 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* Botão para cadastrar nova fazenda */}
              <div className="pt-2 border-t border-slate-800">
                <Link
                  href="/registries"
                  onClick={() => setFarmDropdownOpen(false)}
                  className="w-full flex items-center justify-center gap-2 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Cadastrar Nova Fazenda</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="flex items-center gap-1.5">
          <Link
            href="/agenda"
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-slate-700 transition-colors"
            title="Ir para a Agenda"
          >
            <CalendarDays className="w-4 h-4" />
          </Link>
          
          <Link
            href="/lots"
            className="hidden xs:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 stroke-3" />
            <span>Novo Lote</span>
          </Link>
        </div>

      </div>

    </header>
  );
}
