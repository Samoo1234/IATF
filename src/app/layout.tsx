import type { Metadata, Viewport } from 'next';
import AppShell from '@/components/AppShell';
import PWARegistration from '@/components/PWARegistration';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import './globals.css';

export const metadata: Metadata = {
  title: 'IATF Master — Plataforma de Gestão Reprodutiva Bovina',
  description: 'Sistema profissional de controle operacional de IATF, protocolos hormonais, manejos, estoques de sêmen e inteligência reprodutiva baseada em Supabase.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'IATF Master',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body 
        className="bg-slate-950 text-slate-100 min-h-screen font-sans antialiased selection:bg-emerald-500 selection:text-slate-950"
        suppressHydrationWarning
      >
        <PWARegistration />
        <PWAInstallPrompt />
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
