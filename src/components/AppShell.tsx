'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/client';
import { FarmProvider } from '@/context/FarmContext';
import { SeasonProvider } from '@/context/SeasonContext';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);

  // Load saved collapse preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('iatf_sidebar_collapsed');
    if (saved !== null) {
      setCollapsed(saved === 'true');
    }
  }, []);

  // Client-side authentication check - executado apenas no carregamento inicial da aplicação
  useEffect(() => {
    let mounted = true;

    async function verifyAuth() {
      if (pathname === '/login') {
        if (mounted) setCheckingAuth(false);
        return;
      }

      // Modo Curral: Se estiver offline, mantém a sessão do operador sem redirecionar
      const isOffline = typeof window !== 'undefined' && !navigator.onLine;
      const hasTabSession = typeof window !== 'undefined' ? sessionStorage.getItem('iatf_tab_session') : null;
      const hasOfflineSession = typeof window !== 'undefined' ? localStorage.getItem('iatf_offline_session_active') : null;

      if (isOffline && (hasTabSession || hasOfflineSession)) {
        if (mounted) setCheckingAuth(false);
        return;
      }

      const supabase = createClient();
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session || !hasTabSession) {
          if (!isOffline) {
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem('iatf_tab_session');
              localStorage.removeItem('iatf_offline_session_active');
            }
            await supabase.auth.signOut();
            router.push('/login');
            return;
          }
        }

        if (session && typeof window !== 'undefined') {
          localStorage.setItem('iatf_offline_session_active', 'true');
        }
      } catch (err) {
        // Se falhou por erro de rede ao checar sessão, permite prosseguir se offline
        if (isOffline && (hasTabSession || hasOfflineSession)) {
          if (mounted) setCheckingAuth(false);
          return;
        }
        console.warn('[AppShell] Erro de rede ao verificar sessão:', err);
      }

      if (mounted) setCheckingAuth(false);
    }

    verifyAuth();
    return () => {
      mounted = false;
    };
  }, [pathname, router]);

  // Efeito de transição rápida visual ao mudar de rota
  useEffect(() => {
    setIsNavigating(true);
    const t = setTimeout(() => setIsNavigating(false), 200);
    return () => clearTimeout(t);
  }, [pathname]);

  const handleToggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('iatf_sidebar_collapsed', String(next));
      return next;
    });
  };

  // If on login page, don't show sidebar/header
  if (pathname === '/login') {
    return <>{children}</>;
  }

  // While checking auth on initial render of protected pages
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-linear-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-slate-950 font-black text-xl shadow-xl glow-emerald animate-pulse">
            IATF
          </div>
          <p className="text-xs text-slate-400 font-medium">Validando sessão...</p>
        </div>
      </div>
    );
  }

  return (
    <FarmProvider>
      <SeasonProvider>
        <div className="min-h-screen bg-slate-950 text-slate-100 flex relative">
          {/* Top Navigation Progress Bar */}
          {isNavigating && (
            <div className="fixed top-0 left-0 right-0 z-50 h-0.75 bg-linear-to-r from-emerald-500 via-teal-400 to-emerald-300 animate-pulse shadow-sm shadow-emerald-400/50" />
          )}

          {/* Sidebar Component */}
          <Sidebar
            collapsed={collapsed}
            onToggleCollapse={handleToggleCollapse}
            mobileOpen={mobileOpen}
            onCloseMobile={() => setMobileOpen(false)}
          />

          {/* Main Content Area */}
          <div
            className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${
              collapsed ? 'md:ml-20' : 'md:ml-64'
            }`}
          >
            {/* Top Header */}
            <Header
              collapsed={collapsed}
              onOpenMobileMenu={() => setMobileOpen(true)}
            />

            {/* Dynamic Page Content */}
            <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
              {children}
            </main>
          </div>
        </div>
      </SeasonProvider>
    </FarmProvider>
  );
}
