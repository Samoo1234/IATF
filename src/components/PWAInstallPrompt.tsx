'use client';

import { useState, useEffect } from 'react';
import { Download, Share, PlusSquare, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed as standalone
    const isApp = window.matchMedia('(display-mode: standalone)').matches || 
                  (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(isApp);

    if (isApp) return;

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Listen for beforeinstallprompt (Android / Chrome)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // If iOS and not installed, show after 3 seconds
    if (isIosDevice && !isApp) {
      const dismissed = sessionStorage.getItem('pwa_ios_dismissed');
      if (!dismissed) {
        const timer = setTimeout(() => setShowPrompt(true), 3000);
        return () => clearTimeout(timer);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  if (isStandalone || !showPrompt) return null;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    if (isIOS) {
      sessionStorage.setItem('pwa_ios_dismissed', 'true');
    }
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-50 animate-in slide-in-from-bottom-5 duration-300">
      <div className="p-4 rounded-3xl bg-slate-900/95 border border-emerald-500/30 backdrop-blur-2xl shadow-2xl shadow-emerald-950/50 text-slate-100 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Instalar IATF Master</h4>
              <p className="text-[11px] text-slate-400">
                Acesse em tela cheia e use no curral mesmo sem internet
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isIOS ? (
          <div className="p-2.5 rounded-2xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-300 space-y-1">
            <p className="font-semibold text-emerald-400">Como instalar no iPhone:</p>
            <p className="flex items-center gap-1.5">
              1. Toque no botão <Share className="w-3.5 h-3.5 text-sky-400 inline" /> Compartilhar no Safari
            </p>
            <p className="flex items-center gap-1.5">
              2. Escolha <PlusSquare className="w-3.5 h-3.5 text-emerald-400 inline" /> Adicionar à Tela de Início
            </p>
          </div>
        ) : (
          <button
            onClick={handleInstallClick}
            className="w-full py-2.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Instalar Aplicativo Agora
          </button>
        )}
      </div>
    </div>
  );
}
