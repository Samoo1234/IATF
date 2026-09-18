import type { Metadata, Viewport } from 'next';
import AppShell from '@/components/AppShell';
import PWARegistration from '@/components/PWARegistration';
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
    icon: '/icons/icon-192.svg',
    apple: '/icons/icon-192.svg',
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
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
