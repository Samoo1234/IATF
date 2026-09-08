'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getFarms, type Farm } from '@/lib/db';

interface FarmContextType {
  farms: Farm[];
  activeFarmId: string | null;
  activeFarm: Farm | null;
  setActiveFarmId: (id: string) => void;
  loading: boolean;
  refreshFarms: () => Promise<void>;
}

const FarmContext = createContext<FarmContextType>({
  farms: [],
  activeFarmId: null,
  activeFarm: null,
  setActiveFarmId: () => {},
  loading: true,
  refreshFarms: async () => {},
});

export function FarmProvider({ children }: { children: React.ReactNode }) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [activeFarmId, setActiveFarmIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selectAndPersistFarm = useCallback((farmId: string) => {
    setActiveFarmIdState(farmId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('iatf_active_farm_id', farmId);
      window.dispatchEvent(new CustomEvent('iatf_farm_changed', { detail: { farmId } }));
    }
  }, []);

  const refreshFarms = useCallback(async () => {
    try {
      const farmsList = await getFarms(true);
      setFarms(farmsList);

      if (farmsList.length > 0) {
        const savedFarm = typeof window !== 'undefined' ? localStorage.getItem('iatf_active_farm_id') : null;
        // If saved farm is valid and not 'all', keep it. Otherwise pick the first farm.
        const validSaved = savedFarm && savedFarm !== 'all' && farmsList.some((f) => f.id === savedFarm);
        const targetFarmId = validSaved ? (savedFarm as string) : farmsList[0].id;
        selectAndPersistFarm(targetFarmId);
      } else {
        setActiveFarmIdState(null);
      }
    } catch (err) {
      console.error('Error loading farms in FarmProvider:', err);
    } finally {
      setLoading(false);
    }
  }, [selectAndPersistFarm]);

  useEffect(() => {
    refreshFarms();
  }, [refreshFarms]);

  const setActiveFarmId = useCallback((id: string) => {
    if (id === 'all') return; // Enforce strict single farm selection
    selectAndPersistFarm(id);
  }, [selectAndPersistFarm]);

  const activeFarm = farms.find((f) => f.id === activeFarmId) || null;

  return (
    <FarmContext.Provider
      value={{
        farms,
        activeFarmId,
        activeFarm,
        setActiveFarmId,
        loading,
        refreshFarms,
      }}
    >
      {children}
    </FarmContext.Provider>
  );
}

export function useActiveFarm() {
  const context = useContext(FarmContext);
  if (!context) {
    throw new Error('useActiveFarm must be used within a FarmProvider');
  }
  return context;
}
