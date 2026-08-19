'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  CalendarDays, 
  Layers, 
  Syringe, 
  Package, 
  Upload, 
  FileText, 
  FolderTree, 
  ClipboardList, 
  ChevronLeft, 
  ChevronRight, 
  LogOut, 
  LogIn, 
  ShieldCheck, 
  Building2, 
  ChevronDown,
  X
} from 'lucide-react';
import { getOrgMetadata, getFarms, type OrgMetadata, type Farm } from '@/lib/db';
import { createClient } from '@/lib/supabase/client';

interface NavSection {
  title: string;
  items: {
    name: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Operacional',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
      { name: 'Agenda de Campo', href: '/agenda', icon: CalendarDays },
      { name: 'Lotes de IATF', href: '/lots', icon: Layers },
      { name: 'Matrizes & Rebanho', href: '/animals', icon: Syringe },
    ],
  },
  {
    title: 'Técnico & Protocolos',
    items: [
      { name: 'Protocolos Hormonais', href: '/protocols', icon: ClipboardList },
      { name: 'Estoque de Sêmen & Doses', href: '/inputs', icon: Package },
    ],
  },
  {
    title: 'Inteligência & Gestão',
    items: [
      { name: 'Relatórios & Gráficos', href: '/reports', icon: FileText },
      { name: 'Importação de Dados', href: '/import', icon: Upload },
      { name: 'Cadastros Gerais', href: '/registries', icon: FolderTree },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [metadata, setMetadata] = useState<OrgMetadata | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const [farms, setFarms] = useState<Farm[]>([]);
  const [activeFarmName, setActiveFarmName] = useState<string>('Fazenda Principal');

  useEffect(() => {
    async function loadData() {
      const [meta, farmsList] = await Promise.all([
        getOrgMetadata(),
        getFarms()
      ]);
      setMetadata(meta);
      setFarms(farmsList);

      const savedFarmId = localStorage.getItem('iatf_active_farm_id');
      const found = farmsList.find(f => f.id === savedFarmId);
      if (found) {
        setActiveFarmName(found.name);
      } else if (savedFarmId === 'all') {
        setActiveFarmName('Todas as Fazendas');
      } else if (meta?.farm?.name) {
        setActiveFarmName(meta.farm.name);
      }

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email ?? null);
      }
    }
    loadData();

    const handleFarmChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ farmId: string }>;
      const farmId = customEvent.detail?.farmId;
      if (farmId === 'all') {
        setActiveFarmName('Todas as Fazendas');
      } else {
        const found = farms.find(f => f.id === farmId);
        if (found) setActiveFarmName(found.name);
      }
    };
    window.addEventListener('iatf_farm_changed', handleFarmChange);
    return () => window.removeEventListener('iatf_farm_changed', handleFarmChange);
  }, [pathname, farms]);

  const handleLogout = async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('iatf_tab_session');
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    setUserEmail(null);
    setUserDropdownOpen(false);
    router.push('/login');
  };

  const farmName = activeFarmName || metadata?.farm?.name || 'Fazenda Principal';
  const orgName = metadata?.name || 'AgroPecuária Oliveira';
  const techResponsible = metadata?.farm?.technical_responsible || 'MV. Dr. Samoel Duarte';

  const initials = techResponsible
    .replace('MV. DR. ', '')
    .replace('DR. ', '')
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('');

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-900/95 border-r border-slate-800 text-slate-200 select-none backdrop-blur-xl">
      
      {/* 1. Header & Brand */}
      <div className={`flex items-center justify-between border-b border-slate-800/80 px-4 h-16 ${collapsed ? 'justify-center px-2' : ''}`}>
        <Link 
          href="/" 
          onClick={onCloseMobile}
          className={`flex items-center gap-3 group overflow-hidden transition-all ${collapsed ? 'justify-center' : ''}`}
        >
          <div className="w-10 h-10 rounded-2xl bg-linear-to-tr from-emerald-600 via-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black text-sm shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform shrink-0">
            IATF
          </div>
          {!collapsed && (
            <div className="overflow-hidden whitespace-nowrap animate-in fade-in duration-200">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-white text-base tracking-tight group-hover:text-emerald-400 transition-colors">
                  IATF Master
                </span>
                <span className="flex items-center gap-1 text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  PRO
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {farmName}
              </p>
            </div>
          )}
        </Link>

        {/* Mobile close button */}
        <button
          onClick={onCloseMobile}
          className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 md:hidden"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 2. Navigation Items organized by section */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-4 space-y-6">
        {NAV_SECTIONS.map((section, idx) => (
          <div key={idx} className="space-y-1.5">
            {!collapsed && (
              <h4 className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                {section.title}
              </h4>
            )}
            {collapsed && (
              <div className="h-px bg-slate-800 my-2 mx-1" />
            )}

            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onCloseMobile}
                    title={collapsed ? item.name : undefined}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all relative group ${
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-md shadow-emerald-500/5'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
                    } ${collapsed ? 'justify-center px-2 py-3' : ''}`}
                  >
                    {/* Active Left Indicator Bar */}
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                    )}

                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-200'
                      }`}
                    />

                    {!collapsed && (
                      <span className="truncate flex-1">{item.name}</span>
                    )}

                    {!collapsed && item.badge && (
                      <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                        {item.badge}
                      </span>
                    )}

                    {/* Collapsed Tooltip */}
                    {collapsed && (
                      <div className="fixed left-20 ml-2 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl border border-slate-700 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 whitespace-nowrap">
                        {item.name}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 3. Collapse/Expand Toggle button (Desktop) */}
      <div className="hidden md:flex items-center justify-between p-3 border-t border-slate-800/80 bg-slate-950/40">
        {!collapsed && (
          <span className="text-[11px] text-slate-500 font-medium px-2">Recolher menu</span>
        )}
        <button
          onClick={onToggleCollapse}
          className={`p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ${
            collapsed ? 'mx-auto' : ''
          }`}
          title={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-emerald-400" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* 4. User Profile & Organization Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60 relative">
        <button
          onClick={() => setUserDropdownOpen(!userDropdownOpen)}
          className={`w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-slate-800/80 transition-all text-left group border border-transparent hover:border-slate-700 ${
            collapsed ? 'justify-center p-1.5' : ''
          }`}
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 shadow-inner">
            {initials || 'SD'}
          </div>

          {!collapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors truncate">
                {techResponsible}
              </p>
              <p className="text-[10px] text-slate-400 truncate">
                {orgName}
              </p>
            </div>
          )}

          {!collapsed && (
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${userDropdownOpen ? 'rotate-180 text-emerald-400' : ''}`} />
          )}
        </button>

        {/* User Dropdown */}
        {userDropdownOpen && (
          <div className={`absolute bottom-16 ${collapsed ? 'left-16' : 'left-3 right-3'} rounded-2xl border border-slate-800 bg-slate-900/95 backdrop-blur-2xl shadow-2xl p-3 space-y-3 z-50 text-xs animate-in fade-in slide-in-from-bottom-2`}>
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Organização</span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono">Admin</span>
              </div>
              <p className="font-bold text-white flex items-center gap-1.5 truncate">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">{orgName}</span>
              </p>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1 border-t border-slate-800/60 truncate">
                <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="truncate">{farmName}</span>
              </p>
              {userEmail && (
                <p className="text-[10px] text-slate-500 font-mono truncate">
                  {userEmail}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Link
                href="/registries"
                onClick={() => setUserDropdownOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <FolderTree className="w-3.5 h-3.5 text-emerald-400" />
                <span>Gerenciar Cadastros</span>
              </Link>
            </div>

            <div className="pt-2 border-t border-slate-800">
              {userEmail ? (
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-900/30 transition-colors font-semibold"
                >
                  <span className="flex items-center gap-2">
                    <LogOut className="w-3.5 h-3.5" /> Sair da Conta
                  </span>
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setUserDropdownOpen(false)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5" /> Fazer Login
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside
        className={`hidden md:block fixed left-0 top-0 bottom-0 z-40 transition-all duration-300 ease-in-out ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Slide-over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[80vw] h-full animate-in slide-in-from-left duration-300">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
