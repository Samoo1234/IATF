'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/client';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Load saved collapse preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('iatf_sidebar_collapsed');
    if (saved !== null) {
      setCollapsed(saved === 'true');
    }
  }, []);

  // Client-side authentication & tab session verification
  useEffect(() => {
    async function verifyAuth() {
      if (pathname === '/login') {
        setCheckingAuth(false);
        return;
      }

      const hasTabSession = sessionStorage.getItem('iatf_tab_session');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session || !hasTabSession) {
        // Sem sessão ativa na aba ou nova aba aberta após fechar a anterior
        sessionStorage.removeItem('iatf_tab_session');
        await supabase.auth.signOut();
        router.push('/login');
        return;
      }

      setCheckingAuth(false);
    }

    verifyAuth();
  }, [pathname, router]);

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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
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
  );
}
