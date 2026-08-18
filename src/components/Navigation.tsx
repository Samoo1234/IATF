'use client';

import { useEffect, useState, useRef } from 'react';
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
  ShieldCheck, 
  UserCheck, 
  ClipboardList,
  FolderTree,
  LogOut,
  LogIn,
  ChevronDown,
  Building2,
  Sparkles,
  MapPin
} from 'lucide-react';
import { getOrgMetadata, type OrgMetadata } from '@/lib/db';
import { createClient } from '@/lib/supabase/client';

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [metadata, setMetadata] = useState<OrgMetadata | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadData() {
      const meta = await getOrgMetadata();
      setMetadata(meta);

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email ?? null);
      }
    }
    loadData();

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [pathname]);

  if (pathname === '/login') {
    return null;
  }

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUserEmail(null);
    setUserMenuOpen(false);
    router.push('/login');
  };

  const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Agenda', href: '/agenda', icon: CalendarDays },
    { name: 'Lotes', href: '/lots', icon: Layers },
    { name: 'Protocolos', href: '/protocols', icon: ClipboardList },
    { name: 'Matrizes', href: '/animals', icon: Syringe },
    { name: 'Estoque', href: '/inputs', icon: Package },
    { name: 'Cadastros', href: '/registries', icon: FolderTree },
    { name: 'Relatórios', href: '/reports', icon: FileText },
    { name: 'Importar', href: '/import', icon: Upload },
  ];

  const farmName = metadata?.farm?.name || 'Fazenda Boi Gordo';
  const orgName = metadata?.name || 'AgroPecuária Oliveira';
  const techResponsible = metadata?.farm?.technical_responsible || 'MV. Dr. Samoel Duarte';

  // Iniciais para avatar
  const initials = techResponsible
    .replace('MV. DR. ', '')
    .replace('DR. ', '')
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('');

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Brand Logo & Context */}
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-linear-to-br from-emerald-400 via-emerald-600 to-teal-700 flex items-center justify-center text-slate-950 font-black text-sm shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                IATF
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-white text-base tracking-tight group-hover:text-emerald-400 transition-colors">
                    IATF Master
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Live
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <span>{farmName}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-emerald-400/90 font-medium">2025/2026</span>
                </p>
              </div>
            </Link>
          </div>

          {/* Navigation Links - Single row with clean pills and hidden scrollbar */}
          <nav className="flex items-center gap-1 overflow-x-auto py-1 no-scrollbar text-xs font-medium">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold shadow-sm shadow-emerald-500/5'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/90 border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* User Profile & Organization Dropdown */}
          <div className="flex items-center gap-3 shrink-0 relative" ref={menuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2.5 p-1.5 pr-2.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-xs">
                {initials || 'SD'}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors leading-tight">
                  {techResponsible}
                </p>
                <p className="text-[10px] text-slate-400 leading-tight truncate max-w-35">
                  {orgName}
                </p>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180 text-emerald-400' : ''}`} />
            </button>

            {/* Profile Popup Menu */}
            {userMenuOpen && (
              <div className="absolute right-0 top-12 w-64 rounded-2xl border border-slate-800 bg-slate-900/95 backdrop-blur-xl shadow-2xl p-3 space-y-3 z-50 text-xs animate-in fade-in slide-in-from-top-2">
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Organização Ativa</span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono">Admin</span>
                  </div>
                  <p className="font-bold text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">{orgName}</span>
                  </p>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1 border-t border-slate-800/60">
                    <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
                    <span>{farmName}</span>
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
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    <FolderTree className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Gerenciar Cadastros & Fazendas</span>
                  </Link>
                  <Link
                    href="/protocols"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    <ClipboardList className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Protocolos Hormonais</span>
                  </Link>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  {userEmail ? (
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-900/30 transition-colors font-semibold"
                    >
                      <span className="flex items-center gap-2">
                        <LogOut className="w-3.5 h-3.5" /> Sair da Conta
                      </span>
                    </button>
                  ) : (
                    <Link
                      href="/login"
                      onClick={() => setUserMenuOpen(false)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold transition-colors"
                    >
                      <LogIn className="w-3.5 h-3.5" /> Entrar / Fazer Login
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}
