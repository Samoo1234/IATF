'use client';

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

interface ThemeToggleProps {
  variant?: 'compact' | 'full';
  className?: string;
}

export default function ThemeToggle({ variant = 'compact', className = '' }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  if (variant === 'full') {
    return (
      <button
        onClick={toggleTheme}
        type="button"
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
          isDark
            ? 'text-slate-300 hover:text-white hover:bg-slate-800'
            : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
        } ${className}`}
        title={isDark ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
      >
        <div className="flex items-center gap-2">
          {isDark ? (
            <Sun className="w-4 h-4 text-amber-400 transition-transform duration-300 hover:rotate-90" />
          ) : (
            <Moon className="w-4 h-4 text-indigo-500 transition-transform duration-300 hover:-rotate-12" />
          )}
          <span>{isDark ? 'Modo Claro' : 'Modo Escuro'}</span>
        </div>
        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800/20 dark:bg-slate-800 text-slate-400">
          {isDark ? 'Escuro' : 'Claro'}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      type="button"
      className={`relative p-2 rounded-xl border transition-all duration-300 cursor-pointer group flex items-center justify-center ${
        isDark
          ? 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-amber-400 hover:border-amber-400/40 shadow-sm'
          : 'bg-white border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-400/40 shadow-xs'
      } ${className}`}
      title={isDark ? 'Ativar Modo Claro' : 'Ativar Modo Escuro'}
      aria-label="Alternar tema de cores"
    >
      <div className="relative w-4 h-4 overflow-hidden">
        {/* Sun Icon */}
        <Sun
          className={`w-4 h-4 text-amber-400 absolute inset-0 transition-all duration-300 ease-in-out ${
            isDark
              ? 'opacity-0 rotate-90 scale-50 pointer-events-none'
              : 'opacity-100 rotate-0 scale-100'
          }`}
        />
        {/* Moon Icon */}
        <Moon
          className={`w-4 h-4 text-slate-300 group-hover:text-amber-300 absolute inset-0 transition-all duration-300 ease-in-out ${
            isDark
              ? 'opacity-100 rotate-0 scale-100'
              : 'opacity-0 -rotate-90 scale-50 pointer-events-none'
          }`}
        />
      </div>
    </button>
  );
}
