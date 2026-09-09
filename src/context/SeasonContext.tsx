'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  getReproductiveSeasons, 
  setActiveReproductiveSeason,
  type ReproductiveSeason 
} from '@/lib/db';

interface SeasonContextType {
  seasons: ReproductiveSeason[];
  activeSeasonId: string | null;
  activeSeason: ReproductiveSeason | null;
  setActiveSeasonId: (id: string) => void;
  setAsGlobalActiveSeason: (id: string) => Promise<boolean>;
  loading: boolean;
  refreshSeasons: () => Promise<void>;
}

const SeasonContext = createContext<SeasonContextType>({
  seasons: [],
  activeSeasonId: null,
  activeSeason: null,
  setActiveSeasonId: () => {},
  setAsGlobalActiveSeason: async () => false,
  loading: true,
  refreshSeasons: async () => {},
});

export function SeasonProvider({ children }: { children: React.ReactNode }) {
  const [seasons, setSeasons] = useState<ReproductiveSeason[]>([]);
  const [activeSeasonId, setActiveSeasonIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selectAndPersistSeason = useCallback((seasonId: string) => {
    setActiveSeasonIdState(seasonId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('iatf_active_season_id', seasonId);
      window.dispatchEvent(new CustomEvent('iatf_season_changed', { detail: { seasonId } }));
    }
  }, []);

  const refreshSeasons = useCallback(async () => {
    try {
      const seasonList = await getReproductiveSeasons(true);
      setSeasons(seasonList);

      if (seasonList.length > 0) {
        // Priority 1: Check if there is a saved season in localStorage and it exists in the list
        const savedSeason = typeof window !== 'undefined' ? localStorage.getItem('iatf_active_season_id') : null;
        const validSaved = savedSeason && seasonList.some((s) => s.id === savedSeason);

        // Priority 2: Check for a season with status === 'active'
        const serverActive = seasonList.find((s) => s.status === 'active');

        const targetSeasonId = validSaved
          ? (savedSeason as string)
          : serverActive
          ? serverActive.id
          : seasonList[0].id;

        selectAndPersistSeason(targetSeasonId);
      } else {
        setActiveSeasonIdState(null);
      }
    } catch (err) {
      console.error('Error loading seasons in SeasonProvider:', err);
    } finally {
      setLoading(false);
    }
  }, [selectAndPersistSeason]);

  useEffect(() => {
    refreshSeasons();
  }, [refreshSeasons]);

  const setActiveSeasonId = useCallback((id: string) => {
    selectAndPersistSeason(id);
  }, [selectAndPersistSeason]);

  const setAsGlobalActiveSeason = useCallback(async (id: string): Promise<boolean> => {
    try {
      const ok = await setActiveReproductiveSeason(id);
      if (ok) {
        selectAndPersistSeason(id);
        await refreshSeasons();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error setting global active season:', err);
      return false;
    }
  }, [refreshSeasons, selectAndPersistSeason]);

  const activeSeason = seasons.find((s) => s.id === activeSeasonId) || null;

  return (
    <SeasonContext.Provider
      value={{
        seasons,
        activeSeasonId,
        activeSeason,
        setActiveSeasonId,
        setAsGlobalActiveSeason,
        loading,
        refreshSeasons,
      }}
    >
      {children}
    </SeasonContext.Provider>
  );
}

export function useActiveSeason() {
  const context = useContext(SeasonContext);
  if (!context) {
    throw new Error('useActiveSeason must be used within a SeasonProvider');
  }
  return context;
}
