import { createClient } from './supabase/client';
import { offlineDb, type OfflineLotAnimal } from './offline/offlineDb';
import { syncEngine } from './offline/syncEngine';
import { getTodayDateString, addDaysToDateString } from './dateUtils';

export const DEFAULT_BREEDS = [
  { id: 'breed-nelore', name: 'Nelore' },
  { id: 'breed-angus', name: 'Angus' },
  { id: 'breed-brangus', name: 'Brangus' },
  { id: 'breed-senepol', name: 'Senepol' },
  { id: 'breed-braford', name: 'Braford' },
  { id: 'breed-tabapua', name: 'Tabapuã' },
  { id: 'breed-gir', name: 'Gir Leiteiro' },
  { id: 'breed-girolando', name: 'Girolando' },
  { id: 'breed-brahman', name: 'Brahman' },
  { id: 'breed-cruzamento', name: 'Cruzamento Industrial' },
];

export const DEFAULT_CATEGORIES = [
  { id: 'cat-novilha', name: 'Novilha' },
  { id: 'cat-primipara', name: 'Primípara' },
  { id: 'cat-multipara', name: 'Multípara' },
  { id: 'cat-solteira', name: 'Solteira' },
  { id: 'cat-parida', name: 'Vaca Parida' },
];

// ============================================================
// DYNAMIC MULTI-TENANT RESOLVER & GLOBAL IN-MEMORY CACHE
// ============================================================

let cachedOrgId: string | null = null;
let cachedOrgIdTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos de cache de sessão

let cachedMetadata: OrgMetadata | null = null;
let cachedMetadataTimestamp = 0;

let cachedFarms: Farm[] | null = null;
let cachedFarmsTimestamp = 0;

// Universal SWR / Query In-Memory Cache
const queryCache = new Map<string, { data: unknown; timestamp: number }>();
const QUERY_CACHE_TTL = 3 * 60 * 1000; // 3 minutos

export function getCached<T>(key: string, ttl = QUERY_CACHE_TTL): T | null {
  const entry = queryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttl) return null;
  return entry.data as T;
}

export function setCached<T>(key: string, data: T): void {
  queryCache.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    queryCache.clear();
    cachedOrgId = null;
    cachedOrgIdTimestamp = 0;
    cachedMetadata = null;
    cachedMetadataTimestamp = 0;
    cachedFarms = null;
    cachedFarmsTimestamp = 0;
    return;
  }
  for (const key of queryCache.keys()) {
    if (key.startsWith(keyPrefix)) {
      queryCache.delete(key);
    }
  }
}

export function clearTenantCache() {
  invalidateCache();
}

export function clearFarmsCache() {
  cachedFarms = null;
  cachedFarmsTimestamp = 0;
  invalidateCache('farms');
}

export function isSystemOffline(): boolean {
  if (typeof window === 'undefined') return false;
  return syncEngine.isOffline();
}

export function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  if (typeof window !== 'undefined' && !navigator.onLine) return true;
  const msg = (error as { message?: string })?.message || String(error);
  return (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('ERR_INTERNET_DISCONNECTED') ||
    msg.includes('Failed to send request') ||
    msg.includes('Network request failed') ||
    msg.includes('fetch failed') ||
    msg.includes('Load failed') ||
    msg.includes('connection error') ||
    msg.includes('network error')
  );
}

export async function getCurrentOrgId(): Promise<string | null> {
  const now = Date.now();
  if (cachedOrgId && now - cachedOrgIdTimestamp < CACHE_TTL_MS) {
    return cachedOrgId;
  }

  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;

  if (isOffline) {
    if (storedOrgId) {
      cachedOrgId = storedOrgId;
      cachedOrgIdTimestamp = now;
      return cachedOrgId;
    }
    const fromFarm = (await offlineDb.farms.toCollection().first())?.organization_id;
    if (fromFarm) {
      const orgStr = String(fromFarm);
      cachedOrgId = orgStr;
      cachedOrgIdTimestamp = now;
      if (typeof window !== 'undefined') localStorage.setItem('iatf_current_org_id', orgStr);
      return orgStr;
    }
    const fromLot = (await offlineDb.lots.toCollection().first())?.organization_id;
    if (fromLot) {
      const orgStr = String(fromLot);
      cachedOrgId = orgStr;
      cachedOrgIdTimestamp = now;
      if (typeof window !== 'undefined') localStorage.setItem('iatf_current_org_id', orgStr);
      return orgStr;
    }
    return null;
  }

  try {
    const supabase = createClient();
    // getSession() lê a sessão localmente em milissegundos sem fazer chamada remota à API de auth
    const { data: { session } } = await supabase.auth.getSession();
    let user = session?.user ?? null;

    if (!user) {
      const { data: userData } = await supabase.auth.getUser();
      user = userData?.user ?? null;
    }

    if (!user) {
      if (storedOrgId) {
        cachedOrgId = storedOrgId;
        cachedOrgIdTimestamp = now;
        return cachedOrgId;
      }
      return null;
    }

    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (member?.organization_id) {
      cachedOrgId = member.organization_id;
      cachedOrgIdTimestamp = now;
      if (typeof window !== 'undefined' && cachedOrgId) {
        localStorage.setItem('iatf_current_org_id', cachedOrgId);
      }
      return cachedOrgId;
    }

    // Fallback: Check if user owns an organization directly
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);

    if (orgs && orgs.length > 0) {
      cachedOrgId = orgs[0].id;
      cachedOrgIdTimestamp = now;
      if (typeof window !== 'undefined' && cachedOrgId) {
        localStorage.setItem('iatf_current_org_id', cachedOrgId);
      }
      return cachedOrgId;
    }
  } catch (err) {
    if (isNetworkError(err)) {
      syncEngine.markOffline();
    }
    console.warn('[getCurrentOrgId] Falha na rede, utilizando fallback local:', err);
    if (storedOrgId) {
      cachedOrgId = storedOrgId;
      cachedOrgIdTimestamp = now;
      return cachedOrgId;
    }
    const fromFarm = (await offlineDb.farms.toCollection().first())?.organization_id;
    if (fromFarm) {
      cachedOrgId = fromFarm;
      cachedOrgIdTimestamp = now;
      return fromFarm;
    }
  }

  if (storedOrgId) {
    cachedOrgId = storedOrgId;
    cachedOrgIdTimestamp = now;
    return cachedOrgId;
  }

  return null;
}

// ============================================================
// SYSTEM & TENANT INFO
// ============================================================

export interface OrgMetadata {
  id: string;
  name: string;
  code: string | null;
  document_number: string | null;
  farm: {
    id: string;
    name: string;
    technical_responsible: string | null;
    city: string | null;
    state: string | null;
  } | null;
}

export async function getOrgMetadata(): Promise<OrgMetadata | null> {
  const now = Date.now();
  if (cachedMetadata && now - cachedMetadataTimestamp < CACHE_TTL_MS) {
    return cachedMetadata;
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return null;

  if (isSystemOffline()) {
    if (cachedMetadata) return cachedMetadata;
    try {
      const offlineFarms = await offlineDb.farms.toArray();
      const firstFarm = offlineFarms[0];
      return {
        id: orgId,
        name: firstFarm?.name || 'Organização Offline',
        code: null,
        document_number: null,
        farm: firstFarm
          ? {
              id: firstFarm.id,
              name: firstFarm.name,
              technical_responsible: (firstFarm.technical_responsible as string | null) || null,
              city: (firstFarm.city as string | null) || null,
              state: (firstFarm.state as string | null) || null,
            }
          : null,
      };
    } catch {
      return null;
    }
  }

  const supabase = createClient();
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, code, document_number')
    .eq('id', orgId)
    .maybeSingle();

  if (orgErr || !org) {
    if (isNetworkError(orgErr)) {
      syncEngine.markOffline();
      return cachedMetadata;
    }
    console.error('getOrgMetadata error:', orgErr);
    return null;
  }

  const { data: farm } = await supabase
    .from('farms')
    .select('id, name, technical_responsible, city, state')
    .eq('organization_id', orgId)
    .limit(1)
    .maybeSingle();

  const result: OrgMetadata = {
    ...org,
    farm: farm || null,
  };

  cachedMetadata = result;
  cachedMetadataTimestamp = now;
  return result;
}

export interface LotStat {
  id: string;
  code: string;
  farm_id: string;
  season_id?: string;
  season_name?: string | null;
  start_date: string;
  ia_planned_date: string | null;
  dg_planned_date: string | null;
  responsible_name: string | null;
  status: string;
  property_name: string | null;
  protocol_id?: string | null;
  protocol_name: string | null;
  farm_name: string | null;
  worked_qty: number;
  inseminated_qty: number;
  diagnosed_qty?: number;
  pregnancies: number;
  empty_count: number;
  pregnancy_rate: number;
  pending_dg: number;
  notes?: string | null;
}

export async function getLots(forceRefresh = false, farmId?: string): Promise<LotStat[]> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      let offlineLots = await offlineDb.lots.toArray();
      if (farmId && farmId !== 'all') {
        offlineLots = offlineLots.filter((l) => l.farm_id === farmId);
      }
      return offlineLots.map((l) => ({
        id: l.id,
        code: l.code || 'Lote',
        farm_id: l.farm_id,
        season_id: l.season_id,
        season_name: null,
        start_date: (l.start_date as string) || getTodayDateString(),
        ia_planned_date: (l.ia_planned_date as string) || null,
        dg_planned_date: (l.dg_planned_date as string) || null,
        responsible_name: (l.responsible_name as string) || null,
        status: (l.status as string) || 'ativo',
        property_name: (l.property_name as string) || null,
        protocol_name: (l.protocol_name as string) || null,
        farm_name: (l.farm_name as string) || null,
        worked_qty: (l.females_count as number) || 0,
        inseminated_qty: (l.inseminated_count as number) || 0,
        pregnancies: (l.pregnant_count as number) || 0,
        empty_count: (l.empty_count as number) || 0,
        pregnancy_rate: (l.pregnancy_rate as number) || 0,
        pending_dg: (l.pending_dg as number) || 0,
        notes: (l.notes as string) || null,
      }));
    } catch (e) {
      console.warn('Falha ao carregar lotes offline:', e);
      return [];
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) {
    try {
      let offlineLots = await offlineDb.lots.toArray();
      if (farmId && farmId !== 'all') {
        offlineLots = offlineLots.filter((l) => l.farm_id === farmId);
      }
      return offlineLots.map((l) => ({
        id: l.id,
        code: l.code || 'Lote',
        farm_id: l.farm_id,
        season_id: l.season_id,
        season_name: null,
        start_date: (l.start_date as string) || getTodayDateString(),
        ia_planned_date: (l.ia_planned_date as string) || null,
        dg_planned_date: (l.dg_planned_date as string) || null,
        responsible_name: (l.responsible_name as string) || null,
        status: (l.status as string) || 'ativo',
        property_name: (l.property_name as string) || null,
        protocol_name: (l.protocol_name as string) || null,
        farm_name: (l.farm_name as string) || null,
        worked_qty: (l.females_count as number) || 0,
        inseminated_qty: (l.inseminated_count as number) || 0,
        pregnancies: (l.pregnant_count as number) || 0,
        empty_count: (l.empty_count as number) || 0,
        pregnancy_rate: (l.pregnancy_rate as number) || 0,
        pending_dg: (l.pending_dg as number) || 0,
        notes: (l.notes as string) || null,
      }));
    } catch {
      // ignore
    }
    return [];
  }

  const cacheKey = `lots_${orgId}_${farmId || 'all'}`;
  if (!forceRefresh) {
    const cached = getCached<LotStat[]>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  let query = supabase
    .from('lot_stats')
    .select('*')
    .eq('organization_id', orgId);

  if (farmId && farmId !== 'all') {
    query = query.eq('farm_id', farmId);
  }

  const { data, error } = await query.order('start_date', { ascending: true });

  if (error) {
    console.error('getLots error:', error);
    try {
      let offlineLots = await offlineDb.lots.toArray();
      if (farmId && farmId !== 'all') {
        offlineLots = offlineLots.filter((l) => l.farm_id === farmId);
      }
      return offlineLots.map((l) => ({
        id: l.id,
        code: l.code || 'Lote',
        farm_id: l.farm_id,
        season_id: l.season_id,
        season_name: null,
        start_date: (l.start_date as string) || getTodayDateString(),
        ia_planned_date: (l.ia_planned_date as string) || null,
        dg_planned_date: (l.dg_planned_date as string) || null,
        responsible_name: (l.responsible_name as string) || null,
        status: (l.status as string) || 'ativo',
        property_name: (l.property_name as string) || null,
        protocol_name: (l.protocol_name as string) || null,
        farm_name: (l.farm_name as string) || null,
        worked_qty: (l.females_count as number) || 0,
        inseminated_qty: (l.inseminated_count as number) || 0,
        pregnancies: (l.pregnant_count as number) || 0,
        empty_count: (l.empty_count as number) || 0,
        pregnancy_rate: (l.pregnancy_rate as number) || 0,
        pending_dg: (l.pending_dg as number) || 0,
        notes: (l.notes as string) || null,
      }));
    } catch {
      // ignore
    }
    return getCached<LotStat[]>(cacheKey) ?? [];
  }
  const result = (data ?? []) as LotStat[];
  setCached(cacheKey, result);

  if (result.length > 0) {
    try {
      await offlineDb.lots.bulkPut(
        result.map((l) => ({
          id: l.id,
          farm_id: l.farm_id,
          season_id: l.season_id || undefined,
          code: l.code,
          name: l.code,
          status: l.status,
          start_date: l.start_date,
          ia_planned_date: l.ia_planned_date || undefined,
          dg_planned_date: l.dg_planned_date || undefined,
          responsible_name: l.responsible_name || undefined,
          property_name: l.property_name || undefined,
          protocol_name: l.protocol_name || undefined,
          farm_name: l.farm_name || undefined,
          females_count: l.worked_qty,
          inseminated_count: l.inseminated_qty,
          pregnant_count: l.pregnancies,
          empty_count: l.empty_count,
          pregnancy_rate: l.pregnancy_rate,
          pending_dg: l.pending_dg,
          notes: l.notes || undefined,
          organization_id: orgId,
          updated_at: new Date().toISOString(),
        } as unknown as import('./offline/offlineDb').OfflineLot))
      );
    } catch (e) {
      console.warn('Erro ao salvar lotes no IndexedDB:', e);
    }
  }

  return result;
}

export async function getLotById(id: string, forceRefresh = false): Promise<LotStat | null> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const l = await offlineDb.lots.get(id);
      if (l) {
        return {
          id: l.id,
          code: l.code || 'Lote',
          farm_id: l.farm_id,
          season_id: l.season_id,
          season_name: null,
          start_date: (l.start_date as string) || getTodayDateString(),
          ia_planned_date: (l.ia_planned_date as string) || null,
          dg_planned_date: (l.dg_planned_date as string) || null,
          responsible_name: (l.responsible_name as string) || null,
          status: (l.status as string) || 'ativo',
          property_name: (l.property_name as string) || null,
          protocol_name: (l.protocol_name as string) || null,
          farm_name: (l.farm_name as string) || null,
          worked_qty: (l.females_count as number) || 0,
          inseminated_qty: (l.inseminated_count as number) || 0,
          pregnancies: (l.pregnant_count as number) || 0,
          empty_count: (l.empty_count as number) || 0,
          pregnancy_rate: (l.pregnancy_rate as number) || 0,
          pending_dg: (l.pending_dg as number) || 0,
        };
      }
    } catch (e) {
      console.warn('Falha ao carregar lote offline:', e);
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return null;

  const cacheKey = `lot_${id}`;
  if (!forceRefresh) {
    const cached = getCached<LotStat>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('lot_stats')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single();

  if (error) {
    console.error('getLotById error:', error);
    return getCached<LotStat>(cacheKey);
  }
  const result = data as LotStat;
  if (result) setCached(cacheKey, result);
  return result;
}

// ============================================================
// LOT ANIMALS
// ============================================================

export interface LotAnimal {
  id: string;
  lot_id: string;
  animal_id: string;
  ecc_ia: number | null;
  ecc_dg: number | null;
  inseminator_name: string | null;
  pregnancy_status: string;
  expected_parturition_date: string | null;
  notes: string | null;
  bull_id?: string | null;
  semen_batch_id?: string | null;
  animals: {
    tag_number: string;
    reproductive_status: string;
    breeds: { name: string } | null;
    animal_categories: { name: string } | null;
    properties: { name: string } | null;
  } | null;
  bulls: { name: string } | null;
  semen_batches: { batch_number: string } | null;
}

export async function getLotAnimals(lotId: string, forceRefresh = false): Promise<LotAnimal[]> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const offlineAnimals = await offlineDb.lot_animals
        .where('lot_id')
        .equals(lotId)
        .toArray();
      return offlineAnimals as unknown as LotAnimal[];
    } catch (e) {
      console.warn('Falha ao carregar animais do lote offline:', e);
      return [];
    }
  }

  const cacheKey = `lot_animals_${lotId}`;
  if (!forceRefresh) {
    const cached = getCached<LotAnimal[]>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('iatf_lot_animals')
    .select(`
      *,
      animals (tag_number, reproductive_status, breeds(name), animal_categories(name), properties(name)),
      bulls (name),
      semen_batches (batch_number)
    `)
    .eq('lot_id', lotId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('getLotAnimals error:', error);
    try {
      const offlineAnimals = await offlineDb.lot_animals
        .where('lot_id')
        .equals(lotId)
        .toArray();
      if (offlineAnimals.length > 0) {
        return offlineAnimals as unknown as LotAnimal[];
      }
    } catch {
      // ignore
    }
    return getCached<LotAnimal[]>(cacheKey) ?? [];
  }
  const result = (data ?? []) as unknown as LotAnimal[];
  setCached(cacheKey, result);

  if (result.length > 0) {
    try {
      await offlineDb.lot_animals.bulkPut(
        result.map((la) => ({
          ...la,
          updated_at: new Date().toISOString(),
        } as unknown as import('./offline/offlineDb').OfflineLotAnimal))
      );
    } catch (e) {
      console.warn('Erro ao salvar animais do lote no IndexedDB:', e);
    }
  }

  return result;
}

export async function updateAnimalDG(
  lotAnimalId: string,
  pregnancyStatus: 'prenha' | 'vazia' | 'repeticao',
  eccDg?: number
): Promise<boolean> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      await syncEngine.recordOfflineLotAnimalDG(lotAnimalId, pregnancyStatus, eccDg);
      invalidateCache('lot_animals');
      invalidateCache('lots');
      invalidateCache('metrics');
      return true;
    } catch (e) {
      console.error('Erro ao atualizar DG offline:', e);
      return false;
    }
  }

  const supabase = createClient();
  const updateData: Record<string, unknown> = {
    pregnancy_status: pregnancyStatus,
    updated_at: new Date().toISOString(),
  };
  if (pregnancyStatus === 'prenha' && eccDg !== undefined) {
    updateData.ecc_dg = eccDg;
  }
  if (pregnancyStatus !== 'prenha') {
    updateData.expected_parturition_date = null;
  }
  if (eccDg !== undefined) updateData.ecc_dg = eccDg;

  const { error } = await supabase
    .from('iatf_lot_animals')
    .update(updateData)
    .eq('id', lotAnimalId);

  if (error) {
    console.error('updateAnimalDG error:', error);
    return false;
  }

  invalidateCache('lot_animals');
  invalidateCache('lots');
  invalidateCache('metrics');
  return true;
}

export async function addAnimalsToLot(
  lotId: string,
  animalIds: string[]
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!animalIds.length) return { success: true, count: 0 };

  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const lot = await offlineDb.lots.get(lotId);
      const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
      const orgId = (lot?.organization_id as string) || storedOrgId || undefined;
      const farmId = lot?.farm_id;

      for (const animalId of animalIds) {
        const lotAnimalId = crypto.randomUUID();
        const animal = await offlineDb.animals.get(animalId);

        const record: OfflineLotAnimal = {
          id: lotAnimalId,
          lot_id: lotId,
          animal_id: animalId,
          farm_id: farmId,
          status: 'active',
          pregnancy_status: 'pendente',
          is_pregnant: null,
          animals: animal ? {
            tag_number: (animal.tag_number || animal.ear_tag) as string,
            reproductive_status: (animal.reproductive_status as string) || 'vazia',
            breeds: animal.breed ? { name: String(animal.breed) } : null,
            animal_categories: animal.category ? { name: String(animal.category) } : null,
            properties: null,
          } : null,
          bulls: null,
          semen_batches: null,
          updated_at: new Date().toISOString(),
        };

        await offlineDb.lot_animals.put(record);

        await syncEngine.enqueueMutation('insert', 'iatf_lot_animals', lotAnimalId, farmId, {
          id: lotAnimalId,
          lot_id: lotId,
          animal_id: animalId,
          pregnancy_status: 'pendente',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, orgId);
      }

      if (lot) {
        await offlineDb.lots.update(lotId, {
          females_count: ((lot.females_count as number) || 0) + animalIds.length,
          updated_at: new Date().toISOString(),
        });
      }

      invalidateCache('lot_animals');
      invalidateCache('lots');
      invalidateCache('animals');
      invalidateCache('metrics');
      return { success: true, count: animalIds.length };
    } catch (e: unknown) {
      console.error('addAnimalsToLot offline error:', e);
      return {
        success: false,
        count: 0,
        error: 'Erro offline ao vincular matrizes: ' + (e instanceof Error ? e.message : String(e)),
      };
    }
  }

  const supabase = createClient();
  const records = animalIds.map((animalId) => ({
    lot_id: lotId,
    animal_id: animalId,
    pregnancy_status: 'pendente',
  }));

  const { data, error } = await supabase
    .from('iatf_lot_animals')
    .upsert(records, { onConflict: 'lot_id,animal_id', ignoreDuplicates: true })
    .select();

  if (error) {
    console.error('addAnimalsToLot error:', error);
    return { success: false, count: 0, error: error.message };
  }

  invalidateCache('lot_animals');
  invalidateCache('lots');
  invalidateCache('animals');
  invalidateCache('metrics');
  return { success: true, count: data?.length ?? records.length };
}

export async function removeAnimalFromLot(lotAnimalId: string): Promise<boolean> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const record = await offlineDb.lot_animals.get(lotAnimalId);
      if (record) {
        await offlineDb.lot_animals.delete(lotAnimalId);
        const lot = await offlineDb.lots.get(record.lot_id);
        if (lot && (lot.females_count as number) > 0) {
          await offlineDb.lots.update(record.lot_id, {
            females_count: Math.max(0, ((lot.females_count as number) || 1) - 1),
            updated_at: new Date().toISOString(),
          });
        }
        await syncEngine.enqueueMutation('delete', 'iatf_lot_animals', lotAnimalId, record.farm_id, {
          id: lotAnimalId,
        });
      }
      invalidateCache('lot_animals');
      invalidateCache('lots');
      invalidateCache('metrics');
      return true;
    } catch (e) {
      console.error('removeAnimalFromLot offline error:', e);
      return false;
    }
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('iatf_lot_animals')
    .delete()
    .eq('id', lotAnimalId);

  if (error) {
    console.error('removeAnimalFromLot error:', error);
    return false;
  }

  invalidateCache('lot_animals');
  invalidateCache('lots');
  invalidateCache('metrics');
  return true;
}

export async function getAvailableAnimalsForLot(lotId: string, search?: string, farmId?: string): Promise<Animal[]> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const lot = await offlineDb.lots.get(lotId);
      const resolvedFarmId = farmId || lot?.farm_id;
      const existingInLot = await offlineDb.lot_animals.where('lot_id').equals(lotId).toArray();
      const existingIds = new Set(existingInLot.map((la) => la.animal_id));

      let allAnimals = await offlineDb.animals.toArray();
      if (resolvedFarmId && resolvedFarmId !== 'all') {
        allAnimals = allAnimals.filter((a) => a.farm_id === resolvedFarmId);
      }
      allAnimals = allAnimals.filter((a) => a.status !== 'inactive' && !existingIds.has(a.id));

      if (search && search.trim()) {
        const query = search.trim().toLowerCase();
        allAnimals = allAnimals.filter((a) => {
          const tag = ((a.tag_number as string) || a.ear_tag || '').toLowerCase();
          return tag.includes(query);
        });
      }

      return allAnimals.map((a) => ({
        id: a.id,
        organization_id: (a.organization_id as string) || '',
        farm_id: a.farm_id,
        property_id: (a.property_id as string) || null,
        tag_number: ((a.tag_number as string) || a.ear_tag) as string,
        rfid_number: (a.rfid_number as string) || null,
        breed_id: (a.breed_id as string) || null,
        category_id: (a.category_id as string) || null,
        reproductive_status: (a.reproductive_status as string) || 'vazia',
        birth_date: (a.birth_date as string) || null,
        sex: (a.sex as string) || 'F',
        status: (a.status as string) || 'active',
        breeds: a.breed ? { name: String(a.breed) } : null,
        animal_categories: a.category ? { name: String(a.category) } : null,
        properties: null,
        farms: null,
      })) as unknown as Animal[];
    } catch (e) {
      console.warn('getAvailableAnimalsForLot offline error:', e);
      return [];
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const supabase = createClient();

  // If farmId wasn't passed directly, fetch it from iatf_lots
  let resolvedFarmId = farmId;
  if (!resolvedFarmId) {
    const { data: lotData } = await supabase
      .from('iatf_lots')
      .select('farm_id')
      .eq('id', lotId)
      .maybeSingle();
    if (lotData?.farm_id) {
      resolvedFarmId = lotData.farm_id;
    }
  }

  // 1. Obter IDs já presentes neste lote
  const { data: existing } = await supabase
    .from('iatf_lot_animals')
    .select('animal_id')
    .eq('lot_id', lotId);

  const existingIds = new Set((existing ?? []).map((e) => e.animal_id));

  // 2. Buscar animais ativos da mesma fazenda
  let query = supabase
    .from('animals')
    .select('*, breeds(name), animal_categories(name), properties(name), farms(name)')
    .eq('organization_id', orgId)
    .eq('status', 'active');

  if (resolvedFarmId && resolvedFarmId !== 'all') {
    query = query.eq('farm_id', resolvedFarmId);
  }

  if (search && search.trim()) {
    query = query.ilike('tag_number', `%${search.trim()}%`);
  }

  const { data, error } = await query.order('tag_number').limit(100);
  if (error) {
    console.error('getAvailableAnimalsForLot error:', error);
    return [];
  }

  const available = (data ?? []).filter((a) => !existingIds.has(a.id));
  return available as unknown as Animal[];
}

export function getNextSuggestedLotCode(existingLots: LotStat[]): string {
  if (!existingLots || existingLots.length === 0) return 'Lote-01';

  let maxNum = 0;
  for (const lot of existingLots) {
    if (!lot.code) continue;
    const match = lot.code.match(/(?:Lote|LOTE)[^0-9]*(\d+)/i) || lot.code.match(/(\d+)/);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  const nextNum = maxNum + 1;
  const padded = nextNum < 10 ? `0${nextNum}` : String(nextNum);
  return `Lote-${padded}`;
}

export async function createAndAddAnimalToLot(
  lotId: string,
  animal: {
    farm_id?: string;
    property_id?: string;
    tag_number: string;
    rfid_number?: string;
    breed_id?: string;
    category_id?: string;
    reproductive_status?: string;
    birth_date?: string;
  }
): Promise<{ success: boolean; error?: string; alreadyExisted?: boolean; animalId?: string }> {
  const cleanTag = animal.tag_number.trim();
  const isOffline = isSystemOffline();

  if (isOffline) {
    try {
      const localLot = await offlineDb.lots.get(lotId);
      const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
      const targetOrgId = (localLot?.organization_id as string) || storedOrgId || '';
      const targetFarmId = animal.farm_id || localLot?.farm_id;
      const targetPropertyId = animal.property_id || (localLot?.property_id as string) || null;

      if (!targetFarmId) {
        return { success: false, error: 'Fazenda do lote não identificada na base local.' };
      }

      // 1. Verificar duplicidade de brinco local
      const existingAnimal = await offlineDb.animals
        .filter((a) => {
          const matchFarm = !targetFarmId || a.farm_id === targetFarmId;
          const matchTag = ((a.ear_tag && a.ear_tag.toLowerCase() === cleanTag.toLowerCase()) ||
                           (a.tag_number && String(a.tag_number).toLowerCase() === cleanTag.toLowerCase()));
          return matchFarm && Boolean(matchTag);
        })
        .first();

      let animalId = existingAnimal?.id;
      if (animalId) {
        const alreadyInLot = await offlineDb.lot_animals
          .where('lot_id')
          .equals(lotId)
          .and((la) => la.animal_id === animalId)
          .first();

        if (alreadyInLot) {
          return {
            success: false,
            error: `A matriz com brinco "${cleanTag}" já está cadastrada e vinculada a este lote.`,
          };
        }

        // Se já existe no rebanho nesta fazenda, vincula diretamente ao lote sem travar o operador
        const linkRes = await addAnimalsToLot(lotId, [animalId]);
        if (!linkRes.success) {
          return { success: false, error: linkRes.error || 'Erro ao vincular matriz existente ao lote.' };
        }

        return {
          success: true,
          alreadyExisted: true,
          animalId,
        };
      }

      // 2. Gerar IDs locais
      animalId = crypto.randomUUID();
      const lotAnimalId = crypto.randomUUID();

      let breedName: string | null = null;
      if (animal.breed_id) {
        const localBreed = await offlineDb.breeds.get(animal.breed_id);
        breedName = localBreed?.name || DEFAULT_BREEDS.find((b) => b.id === animal.breed_id)?.name || null;
      }
      let categoryName: string | null = null;
      if (animal.category_id) {
        const localCat = await offlineDb.categories.get(animal.category_id);
        categoryName = localCat?.name || DEFAULT_CATEGORIES.find((c) => c.id === animal.category_id)?.name || null;
      }

      await syncEngine.recordOfflineCreateAndAddAnimalToLot({
        lotId,
        animalId,
        lotAnimalId,
        organization_id: targetOrgId,
        farm_id: targetFarmId,
        property_id: targetPropertyId,
        tag_number: cleanTag,
        rfid_number: animal.rfid_number ? animal.rfid_number.trim() : null,
        breed_id: animal.breed_id || null,
        category_id: animal.category_id || null,
        reproductive_status: animal.reproductive_status || 'vazia',
        birth_date: animal.birth_date || null,
        breed_name: breedName,
        category_name: categoryName,
      });

      invalidateCache('lot_animals');
      invalidateCache('lots');
      invalidateCache('animals');
      invalidateCache('metrics');
      return { success: true, alreadyExisted: false, animalId };
    } catch (err: unknown) {
      console.error('createAndAddAnimalToLot offline error:', err);
      return {
        success: false,
        error: 'Erro offline ao cadastrar e vincular matriz: ' + (err instanceof Error ? err.message : String(err)),
      };
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return { success: false, error: 'Organização não identificada.' };

  const supabase = createClient();

  // 1. Obter os dados do lote (farm_id, organization_id, property_id) para garantir integridade
  const { data: lotData } = await supabase
    .from('iatf_lots')
    .select('farm_id, organization_id, property_id')
    .eq('id', lotId)
    .maybeSingle();

  const targetOrgId = lotData?.organization_id || orgId;
  const targetFarmId = animal.farm_id || lotData?.farm_id;
  const targetPropertyId = animal.property_id || lotData?.property_id || null;

  if (!targetFarmId) {
    return { success: false, error: 'Fazenda do lote não identificada.' };
  }

  // 2. Verificar se o animal com este brinco já existe nesta fazenda/organização
  let existingQuery = supabase
    .from('animals')
    .select('id, farm_id, tag_number')
    .eq('organization_id', targetOrgId)
    .ilike('tag_number', cleanTag);

  if (targetFarmId) {
    existingQuery = existingQuery.eq('farm_id', targetFarmId);
  }

  const { data: existingRows, error: searchErr } = await existingQuery.limit(1);
  if (searchErr) {
    console.warn('createAndAddAnimalToLot search warning:', searchErr.message);
  }

  let animalId = existingRows?.[0]?.id;

  // 3. Se o animal já existe nesta fazenda, informar que já está cadastrado
  if (animalId) {
    const { data: alreadyInLot } = await supabase
      .from('iatf_lot_animals')
      .select('id')
      .eq('lot_id', lotId)
      .eq('animal_id', animalId)
      .maybeSingle();

    if (alreadyInLot) {
      return {
        success: false,
        error: `A matriz com brinco "${cleanTag}" já está cadastrada e vinculada a este lote.`,
      };
    }

    // Se já existe no rebanho nesta fazenda, vincula diretamente ao lote sem travar o operador
    const linkRes = await addAnimalsToLot(lotId, [animalId]);
    if (!linkRes.success) {
      return { success: false, error: linkRes.error || 'Erro ao vincular matriz existente ao lote.' };
    }

    return {
      success: true,
      alreadyExisted: true,
      animalId,
    };
  }

  // 4. Se o animal não existe ainda, cadastrar na tabela 'animals'
  if (!animalId) {
    const { data: newAnimal, error: createErr } = await supabase
      .from('animals')
      .insert({
        organization_id: targetOrgId,
        farm_id: targetFarmId,
        property_id: targetPropertyId,
        tag_number: cleanTag,
        rfid_number: animal.rfid_number ? animal.rfid_number.trim() : null,
        breed_id: animal.breed_id || null,
        category_id: animal.category_id || null,
        reproductive_status: animal.reproductive_status || 'vazia',
        birth_date: animal.birth_date || null,
        sex: 'F',
        status: 'active',
      })
      .select('id')
      .maybeSingle();

    if (createErr) {
      if (createErr.code === '23505' || createErr.message?.includes('unique constraint') || createErr.message?.includes('duplicate key')) {
        return {
          success: false,
          error: `Já existe uma matriz cadastrada com o brinco "${cleanTag}" nesta fazenda.`,
        };
      }
      console.error('createAndAddAnimalToLot insert error:', createErr.message, createErr.details, createErr.hint, createErr.code);
      return { success: false, error: createErr.message || 'Erro ao cadastrar matriz.' };
    }
    animalId = newAnimal?.id;
  }

  if (!animalId) {
    return { success: false, error: 'Não foi possível obter ou criar o registro da matriz.' };
  }

  // 5. Vincular ao lote em iatf_lot_animals
  const { error: linkErr } = await supabase
    .from('iatf_lot_animals')
    .upsert(
      { lot_id: lotId, animal_id: animalId, pregnancy_status: 'pendente' },
      { onConflict: 'lot_id,animal_id' }
    );

  if (linkErr) {
    console.error('createAndAddAnimalToLot link error:', linkErr.message, linkErr.details);
    return { success: false, error: linkErr.message };
  }

  // Também grava no offlineDb para que esteja imediatamente acessível se o operador ficar offline
  offlineDb.animals.put({
    id: animalId,
    farm_id: targetFarmId,
    ear_tag: cleanTag,
    tag_number: cleanTag,
    name: cleanTag,
    status: 'active',
    reproductive_status: animal.reproductive_status || 'vazia',
    category: animal.category_id || undefined,
    breed: animal.breed_id || undefined,
    property_id: targetPropertyId || undefined,
    organization_id: targetOrgId,
    updated_at: new Date().toISOString(),
  }).catch(() => {});

  invalidateCache('lot_animals');
  invalidateCache('lots');
  invalidateCache('animals');
  invalidateCache('metrics');
  return { success: true, alreadyExisted: false, animalId };
}

// ============================================================
// MANAGEMENT EVENTS (AGENDA)
// ============================================================

export interface ManagementEvent {
  id: string;
  lot_id: string | null;
  farm_id?: string | null;
  title?: string | null;
  event_type?: 'lote' | 'avulso' | string;
  step_code: string;
  step_name: string | null;
  planned_date: string;
  execution_date: string | null;
  start_time: string | null;
  end_time: string | null;
  animals_worked_count: number;
  losses_count: number;
  responsible_name: string | null;
  status: string;
  notes: string | null;
  iatf_lots?: {
    code: string;
    name?: string | null;
    farm_id?: string;
    farms?: { id: string; name: string } | null;
    properties?: { name: string } | null;
  } | null;
  farms?: { id: string; name: string } | null;
}

export async function getManagementEvents(forceRefresh = false, farmId?: string): Promise<ManagementEvent[]> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      let events = await offlineDb.management_events.toArray();
      if (farmId && farmId !== 'all') {
        events = events.filter((e) => e.farm_id === farmId);
      }
      events.sort((a, b) => (a.planned_date || '').localeCompare(b.planned_date || ''));

      const lotsMap = new Map();
      const allLots = await offlineDb.lots.toArray();
      allLots.forEach((l) => lotsMap.set(l.id, l));

      return events.map((e) => {
        const lot = e.lot_id ? lotsMap.get(e.lot_id) : null;
        return {
          id: e.id,
          lot_id: e.lot_id || null,
          step_code: e.step_code || '',
          step_name: e.step_name,
          planned_date: e.planned_date,
          execution_date: (e.execution_date as string) || null,
          responsible_name: (e.responsible_name as string) || null,
          status: e.status,
          event_type: e.event_type || 'lote',
          animals_worked_count: (e.animals_worked_count as number) || null,
          losses_count: (e.losses_count as number) || 0,
          created_at: (e.created_at as string) || new Date().toISOString(),
          updated_at: (e.updated_at as string) || new Date().toISOString(),
          iatf_lots: lot ? {
            code: lot.code,
            name: lot.name || lot.code,
            farm_id: lot.farm_id,
            properties: lot.property_name ? { name: lot.property_name } : null,
            farms: lot.farm_name ? { id: lot.farm_id, name: lot.farm_name } : null,
          } : null,
        } as unknown as ManagementEvent;
      });
    } catch (err) {
      console.warn('Erro ao carregar eventos offline:', err);
      return [];
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const cacheKey = `events_${orgId}_${farmId || 'all'}`;
  if (!forceRefresh) {
    const cached = getCached<ManagementEvent[]>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  let query = supabase
    .from('management_events')
    .select(`
      *,
      farms (id, name),
      iatf_lots (
        code,
        name,
        farm_id,
        properties (name),
        farms (id, name)
      )
    `)
    .eq('organization_id', orgId);

  if (farmId && farmId !== 'all') {
    query = query.eq('farm_id', farmId);
  }

  const { data, error } = await query.order('planned_date', { ascending: true });

  if (error) {
    console.error('getManagementEvents error:', error.message || error);
    try {
      let events = await offlineDb.management_events.toArray();
      if (farmId && farmId !== 'all') {
        events = events.filter((e) => e.farm_id === farmId);
      }
      events.sort((a, b) => (a.planned_date || '').localeCompare(b.planned_date || ''));
      return events as unknown as ManagementEvent[];
    } catch {}
    return getCached<ManagementEvent[]>(cacheKey) ?? [];
  }
  const result = (data ?? []) as unknown as ManagementEvent[];
  setCached(cacheKey, result);

  if (data && data.length > 0) {
    offlineDb.management_events.bulkPut(
      (data as Array<{
        id: string;
        organization_id?: string;
        farm_id?: string;
        lot_id?: string | null;
        step_code?: string;
        step_name?: string;
        planned_date: string;
        execution_date?: string | null;
        responsible_name?: string | null;
        status?: string;
        event_type?: string;
        animals_worked_count?: number | null;
        losses_count?: number | null;
        created_at?: string;
        updated_at?: string;
      }>).map((e) => ({
        id: e.id,
        organization_id: e.organization_id || orgId,
        farm_id: e.farm_id,
        lot_id: e.lot_id,
        step_code: e.step_code,
        step_name: e.step_name || e.step_code || '',
        planned_date: e.planned_date,
        execution_date: e.execution_date,
        responsible_name: e.responsible_name,
        status: e.status || 'pendente',
        event_type: e.event_type || 'lote',
        animals_worked_count: e.animals_worked_count || undefined,
        losses_count: e.losses_count || undefined,
        created_at: e.created_at,
        updated_at: e.updated_at || new Date().toISOString(),
      }))
    ).catch(() => {});
  }

  return result;
}

export async function completeManagementEvent(
  eventId: string,
  animalsWorked: number,
  lossesCount: number = 0
): Promise<boolean> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const ev = await offlineDb.management_events.get(eventId);
      const executionDate = getTodayDateString();
      if (ev) {
        await offlineDb.management_events.update(eventId, {
          status: 'concluido',
          execution_date: executionDate,
          animals_worked_count: animalsWorked,
          losses_count: lossesCount,
          updated_at: new Date().toISOString(),
        });
        await syncEngine.enqueueMutation('update', 'management_events', eventId, ev.farm_id, {
          status: 'concluido',
          execution_date: executionDate,
          animals_worked_count: animalsWorked,
          losses_count: lossesCount,
          updated_at: new Date().toISOString(),
        });
      }
      invalidateCache('events');
      invalidateCache('lots');
      invalidateCache('metrics');
      return true;
    } catch (e) {
      console.error('completeManagementEvent offline error:', e);
      return false;
    }
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('management_events')
    .update({
      status: 'concluido',
      execution_date: getTodayDateString(),
      animals_worked_count: animalsWorked,
      losses_count: lossesCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId);

  if (error) {
    console.error('completeManagementEvent error:', error);
    return false;
  }

  offlineDb.management_events.update(eventId, {
    status: 'concluido',
    execution_date: getTodayDateString(),
    animals_worked_count: animalsWorked,
    losses_count: lossesCount,
    updated_at: new Date().toISOString(),
  }).catch(() => {});

  invalidateCache('events');
  invalidateCache('lots');
  invalidateCache('metrics');
  return true;
}

export async function insertManagementEvent(event: {
  farm_id: string;
  lot_id?: string | null;
  title?: string | null;
  event_type?: 'lote' | 'avulso';
  step_code: string;
  step_name?: string | null;
  planned_date: string;
  start_time?: string | null;
  end_time?: string | null;
  responsible_name?: string | null;
  notes?: string | null;
  status?: string;
}): Promise<boolean> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return false;

  const newId = crypto.randomUUID();
  const eventRecord: import('./offline/offlineDb').OfflineManagementEvent = {
    id: newId,
    organization_id: orgId,
    farm_id: event.farm_id,
    lot_id: event.lot_id || null,
    step_code: event.step_code,
    step_name: event.step_name || event.title || event.step_code,
    planned_date: event.planned_date,
    responsible_name: event.responsible_name || 'Equipe de Campo',
    status: event.status || 'pendente',
    event_type: event.event_type || (event.lot_id ? 'lote' : 'avulso'),
    animals_worked_count: 0,
    losses_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (isOffline) {
    try {
      await offlineDb.management_events.put(eventRecord);
      await syncEngine.enqueueMutation('insert', 'management_events', newId, event.farm_id, {
        ...eventRecord,
        title: event.title || null,
        start_time: event.start_time || null,
        end_time: event.end_time || null,
        notes: event.notes || null,
      }, orgId);
      invalidateCache('events');
      return true;
    } catch (e) {
      console.error('insertManagementEvent offline error:', e);
      return false;
    }
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('management_events')
    .insert({
      id: newId,
      organization_id: orgId,
      farm_id: event.farm_id,
      lot_id: event.lot_id || null,
      title: event.title || null,
      event_type: event.event_type || (event.lot_id ? 'lote' : 'avulso'),
      step_code: event.step_code,
      step_name: event.step_name || event.title || event.step_code,
      planned_date: event.planned_date,
      start_time: event.start_time || null,
      end_time: event.end_time || null,
      responsible_name: event.responsible_name || 'Equipe de Campo',
      notes: event.notes || null,
      status: event.status || 'pendente',
      animals_worked_count: 0,
      losses_count: 0,
    });

  if (error) {
    console.error('insertManagementEvent error:', error);
    return false;
  }

  await offlineDb.management_events.put(eventRecord).catch(() => {});
  invalidateCache('events');
  return true;
}

export async function deleteManagementEvent(eventId: string): Promise<boolean> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const existing = await offlineDb.management_events.get(eventId);
      await offlineDb.management_events.delete(eventId);
      await syncEngine.enqueueMutation('delete', 'management_events', eventId, existing?.farm_id, { id: eventId });
      invalidateCache('events');
      return true;
    } catch (e) {
      console.error('deleteManagementEvent offline error:', e);
      return false;
    }
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('management_events')
    .delete()
    .eq('id', eventId)
    .select();

  if (error) {
    console.error('deleteManagementEvent error:', error);
    return false;
  }

  await offlineDb.management_events.delete(eventId).catch(() => {});
  invalidateCache('events');
  return !!(data && data.length > 0);
}

export async function updateManagementEventDate(
  eventId: string,
  newPlannedDate: string,
  startTime?: string | null,
  endTime?: string | null
): Promise<boolean> {
  const isOffline = isSystemOffline();
  const updateData: Record<string, unknown> = {
    planned_date: newPlannedDate,
    updated_at: new Date().toISOString(),
  };
  if (startTime !== undefined) updateData.start_time = startTime;
  if (endTime !== undefined) updateData.end_time = endTime;

  if (isOffline) {
    try {
      const existing = await offlineDb.management_events.get(eventId);
      if (existing) {
        await offlineDb.management_events.update(eventId, {
          planned_date: newPlannedDate,
          updated_at: new Date().toISOString(),
        });
      }
      await syncEngine.enqueueMutation('update', 'management_events', eventId, existing?.farm_id, {
        id: eventId,
        ...updateData,
      });
      invalidateCache('events');
      return true;
    } catch (e) {
      console.error('updateManagementEventDate offline error:', e);
      return false;
    }
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('management_events')
    .update(updateData)
    .eq('id', eventId);

  if (error) {
    console.error('updateManagementEventDate error:', error);
    return false;
  }

  await offlineDb.management_events.update(eventId, {
    planned_date: newPlannedDate,
    updated_at: new Date().toISOString(),
  }).catch(() => {});

  invalidateCache('events');
  return true;
}

// ============================================================
// SEMEN BATCHES
// ============================================================

export interface SemenBatch {
  id: string;
  batch_number: string;
  supplier_central: string | null;
  initial_quantity: number;
  used_quantity: number;
  lost_quantity: number;
  bulls: { name: string; code: string | null } | null;
}

export async function getSemenBatches(forceRefresh = false): Promise<SemenBatch[]> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const offlineBatches = await offlineDb.semen_batches.toArray();
      if (offlineBatches.length > 0) {
        return offlineBatches.map((b) => ({
          id: b.id,
          batch_number: b.batch_number,
          supplier_central: b.supplier_central || null,
          initial_quantity: (b.initial_quantity as number) || 0,
          used_quantity: (b.used_quantity as number) || 0,
          lost_quantity: (b.lost_quantity as number) || 0,
          bulls: (b.bulls as { name: string; code: string | null }) || null,
        }));
      }
    } catch (e) {
      console.warn('Falha ao carregar sêmen offline:', e);
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) {
    try {
      const offlineBatches = await offlineDb.semen_batches.toArray();
      if (offlineBatches.length > 0) {
        return offlineBatches.map((b) => ({
          id: b.id,
          batch_number: b.batch_number,
          supplier_central: b.supplier_central || null,
          initial_quantity: (b.initial_quantity as number) || 0,
          used_quantity: (b.used_quantity as number) || 0,
          lost_quantity: (b.lost_quantity as number) || 0,
          bulls: (b.bulls as { name: string; code: string | null }) || null,
        }));
      }
    } catch {
      // ignore
    }
    return [];
  }

  const cacheKey = `semen_${orgId}`;
  if (!forceRefresh) {
    const cached = getCached<SemenBatch[]>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('semen_batches')
    .select('*, bulls(name, code)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getSemenBatches error:', error);
    try {
      const offlineBatches = await offlineDb.semen_batches.toArray();
      if (offlineBatches.length > 0) {
        return offlineBatches.map((b) => ({
          id: b.id,
          batch_number: b.batch_number,
          supplier_central: b.supplier_central || null,
          initial_quantity: (b.initial_quantity as number) || 0,
          used_quantity: (b.used_quantity as number) || 0,
          lost_quantity: (b.lost_quantity as number) || 0,
          bulls: (b.bulls as { name: string; code: string | null }) || null,
        }));
      }
    } catch {
      // ignore
    }
    return getCached<SemenBatch[]>(cacheKey) ?? [];
  }
  const result = (data ?? []) as unknown as SemenBatch[];
  setCached(cacheKey, result);

  if (result.length > 0) {
    try {
      await offlineDb.semen_batches.bulkPut(
        result.map((b) => ({
          id: b.id,
          organization_id: orgId,
          batch_number: b.batch_number,
          supplier_central: b.supplier_central,
          initial_quantity: b.initial_quantity,
          used_quantity: b.used_quantity,
          lost_quantity: b.lost_quantity,
          bulls: b.bulls,
          updated_at: new Date().toISOString(),
        } as import('./offline/offlineDb').OfflineSemenBatch))
      );
    } catch (e) {
      console.warn('Erro ao salvar sêmen no IndexedDB:', e);
    }
  }

  return result;
}

export async function insertSemenBatch(batch: {
  bull_id: string;
  batch_number: string;
  supplier_central?: string;
  initial_quantity: number;
}): Promise<boolean> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return false;

  const newId = crypto.randomUUID();

  if (isOffline) {
    try {
      const bull = await offlineDb.bulls.get(batch.bull_id);
      await offlineDb.semen_batches.put({
        id: newId,
        organization_id: orgId,
        bull_id: batch.bull_id,
        batch_number: batch.batch_number.trim(),
        supplier_central: batch.supplier_central?.trim() || null,
        initial_quantity: Number(batch.initial_quantity) || 0,
        used_quantity: 0,
        lost_quantity: 0,
        bulls: bull ? { name: bull.name, code: (bull.code as string) || null } : null,
        updated_at: new Date().toISOString(),
      });
      await syncEngine.enqueueMutation('insert', 'semen_batches', newId, undefined, {
        id: newId,
        organization_id: orgId,
        bull_id: batch.bull_id,
        batch_number: batch.batch_number.trim(),
        supplier_central: batch.supplier_central?.trim() || null,
        initial_quantity: Number(batch.initial_quantity) || 0,
        used_quantity: 0,
        lost_quantity: 0,
      }, orgId);
      invalidateCache('semen');
      return true;
    } catch (e) {
      console.error('insertSemenBatch offline error:', e);
      return false;
    }
  }

  const supabase = createClient();
  const { error } = await supabase.from('semen_batches').insert({
    id: newId,
    ...batch,
    organization_id: orgId,
  });
  if (error) {
    console.error('insertSemenBatch error:', error);
    return false;
  }

  try {
    const bull = await offlineDb.bulls.get(batch.bull_id);
    await offlineDb.semen_batches.put({
      id: newId,
      organization_id: orgId,
      bull_id: batch.bull_id,
      batch_number: batch.batch_number.trim(),
      supplier_central: batch.supplier_central?.trim() || null,
      initial_quantity: Number(batch.initial_quantity) || 0,
      used_quantity: 0,
      lost_quantity: 0,
      bulls: bull ? { name: bull.name, code: (bull.code as string) || null } : null,
      updated_at: new Date().toISOString(),
    });
  } catch {}

  invalidateCache('semen');
  return true;
}

// ============================================================
// ANIMALS
// ============================================================

export interface Animal {
  id: string;
  tag_number: string;
  rfid_number: string | null;
  reproductive_status: string;
  status: string;
  farm_id?: string;
  property_id?: string | null;
  breed_id?: string | null;
  category_id?: string | null;
  birth_date?: string | null;
  sex?: string;
  breeds: { name: string } | null;
  animal_categories: { name: string } | null;
  properties: { name: string } | null;
  farms: { name: string } | null;
}

export async function getAnimals(
  limit = 1000,
  forceRefresh = false,
  farmId?: string,
  includeInactive = true
): Promise<Animal[]> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      let localAnimals = await offlineDb.animals.toArray();
      if (farmId && farmId !== 'all') {
        localAnimals = localAnimals.filter((a) => a.farm_id === farmId);
      }
      if (!includeInactive) {
        localAnimals = localAnimals.filter((a) => a.status !== 'inactive');
      }
      return localAnimals.slice(0, limit).map((a) => ({
        id: a.id,
        organization_id: (a.organization_id as string) || '',
        farm_id: a.farm_id,
        property_id: (a.property_id as string) || null,
        tag_number: ((a.tag_number as string) || a.ear_tag) as string,
        rfid_number: (a.rfid_number as string) || null,
        breed_id: (a.breed_id as string) || null,
        category_id: (a.category_id as string) || null,
        reproductive_status: (a.reproductive_status as string) || 'vazia',
        birth_date: (a.birth_date as string) || null,
        sex: (a.sex as string) || 'F',
        status: (a.status as string) || 'active',
        breeds: a.breed ? { name: String(a.breed) } : null,
        animal_categories: a.category ? { name: String(a.category) } : null,
        properties: null,
        farms: null,
      })) as unknown as Animal[];
    } catch (e) {
      console.warn('getAnimals offline error:', e);
      return [];
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const cacheKey = `animals_${orgId}_${farmId || 'all'}_${limit}_${includeInactive}`;
  if (!forceRefresh) {
    const cached = getCached<Animal[]>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  let query = supabase
    .from('animals')
    .select('*, breeds(name), animal_categories(name), properties(name), farms(name)')
    .eq('organization_id', orgId);

  if (!includeInactive) {
    query = query.eq('status', 'active');
  }

  if (farmId && farmId !== 'all') {
    query = query.eq('farm_id', farmId);
  }

  const { data, error } = await query
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('getAnimals error:', error);
    try {
      let localAnimals = await offlineDb.animals.toArray();
      if (farmId && farmId !== 'all') {
        localAnimals = localAnimals.filter((a) => a.farm_id === farmId);
      }
      return localAnimals.slice(0, limit).map((a) => ({
        id: a.id,
        organization_id: (a.organization_id as string) || '',
        farm_id: a.farm_id,
        property_id: (a.property_id as string) || null,
        tag_number: ((a.tag_number as string) || a.ear_tag) as string,
        rfid_number: (a.rfid_number as string) || null,
        breed_id: (a.breed_id as string) || null,
        category_id: (a.category_id as string) || null,
        reproductive_status: (a.reproductive_status as string) || 'vazia',
        birth_date: (a.birth_date as string) || null,
        sex: (a.sex as string) || 'F',
        status: (a.status as string) || 'active',
        breeds: a.breed ? { name: String(a.breed) } : null,
        animal_categories: a.category ? { name: String(a.category) } : null,
        properties: null,
        farms: null,
      })) as unknown as Animal[];
    } catch {}
    return getCached<Animal[]>(cacheKey) ?? [];
  }
  const result = (data ?? []) as unknown as Animal[];
  setCached(cacheKey, result);

  if (data && data.length > 0) {
    offlineDb.animals.bulkPut(
      (data as Array<{
        id: string;
        farm_id: string;
        tag_number: string;
        status?: string;
        reproductive_status?: string;
        animal_categories?: { name: string } | null;
        breeds?: { name: string } | null;
        breed_id?: string | null;
        category_id?: string | null;
        property_id?: string | null;
        organization_id?: string;
        updated_at?: string;
      }>).map((a) => ({
        id: a.id,
        farm_id: a.farm_id,
        ear_tag: a.tag_number,
        tag_number: a.tag_number,
        name: a.tag_number,
        status: a.status || 'active',
        reproductive_status: a.reproductive_status || 'vazia',
        category: a.animal_categories?.name || a.category_id || undefined,
        breed: a.breeds?.name || a.breed_id || undefined,
        breed_id: a.breed_id || undefined,
        category_id: a.category_id || undefined,
        property_id: a.property_id || undefined,
        organization_id: a.organization_id || orgId,
        updated_at: a.updated_at || new Date().toISOString(),
      }))
    ).catch(() => {});
  }

  return result;
}

export interface PaginatedAnimalsResult {
  data: Animal[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getAnimalsPaginated(params: {
  page?: number;
  pageSize?: number;
  farmId?: string;
  query?: string;
  sortOrder?: 'asc' | 'desc';
  sortBy?: 'created_at' | 'tag_number';
  forceRefresh?: boolean;
} = {}): Promise<PaginatedAnimalsResult> {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(1, params.pageSize || 25);
  const farmId = params.farmId;
  const qStr = params.query?.trim() || '';
  const sortOrder = params.sortOrder || 'asc';
  const sortBy = params.sortBy || 'created_at';
  const forceRefresh = params.forceRefresh || false;

  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      let localAnimals = await offlineDb.animals.toArray();
      if (farmId && farmId !== 'all') {
        localAnimals = localAnimals.filter((a) => a.farm_id === farmId);
      }
      localAnimals = localAnimals.filter((a) => a.status !== 'inactive');
      if (qStr) {
        const lowerQ = qStr.toLowerCase();
        localAnimals = localAnimals.filter(
          (a) =>
            ((a.tag_number && String(a.tag_number).toLowerCase().includes(lowerQ)) ||
             (a.ear_tag && a.ear_tag.toLowerCase().includes(lowerQ)))
        );
      }
      localAnimals.sort((a, b) => {
        if (sortBy === 'tag_number') {
          const valA = ((a.tag_number || a.ear_tag || '') as string).localeCompare(
            (b.tag_number || b.ear_tag || '') as string,
            undefined,
            { numeric: true }
          );
          return sortOrder === 'asc' ? valA : -valA;
        }
        const timeA = new Date((a as { created_at?: string }).created_at || 0).getTime();
        const timeB = new Date((b as { created_at?: string }).created_at || 0).getTime();
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      });

      const totalCount = localAnimals.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      const from = (page - 1) * pageSize;
      const sliced = localAnimals.slice(from, from + pageSize).map((a) => ({
        id: a.id,
        organization_id: (a.organization_id as string) || '',
        farm_id: a.farm_id,
        property_id: (a.property_id as string) || null,
        tag_number: ((a.tag_number as string) || a.ear_tag) as string,
        rfid_number: (a.rfid_number as string) || null,
        breed_id: (a.breed_id as string) || null,
        category_id: (a.category_id as string) || null,
        reproductive_status: (a.reproductive_status as string) || 'vazia',
        birth_date: (a.birth_date as string) || null,
        sex: (a.sex as string) || 'F',
        status: (a.status as string) || 'active',
        breeds: a.breed ? { name: String(a.breed) } : null,
        animal_categories: a.category ? { name: String(a.category) } : null,
        properties: null,
        farms: null,
      })) as unknown as Animal[];

      return {
        data: sliced,
        totalCount,
        page,
        pageSize,
        totalPages,
      };
    } catch (e) {
      console.warn('getAnimalsPaginated offline error:', e);
      return { data: [], totalCount: 0, page, pageSize, totalPages: 1 };
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) {
    return { data: [], totalCount: 0, page, pageSize, totalPages: 1 };
  }

  const cacheKey = `animals_pg_${orgId}_${farmId || 'all'}_${qStr}_${page}_${pageSize}_${sortBy}_${sortOrder}`;
  if (!forceRefresh) {
    const cached = getCached<PaginatedAnimalsResult>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  let queryBuilder = supabase
    .from('animals')
    .select('*, breeds(name), animal_categories(name), properties(name), farms(name)', { count: 'exact' })
    .eq('organization_id', orgId)
    .eq('status', 'active');

  if (farmId && farmId !== 'all') {
    queryBuilder = queryBuilder.eq('farm_id', farmId);
  }

  if (qStr) {
    queryBuilder = queryBuilder.ilike('tag_number', `%${qStr}%`);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await queryBuilder
    .order(sortBy, { ascending: sortOrder === 'asc' })
    .range(from, to);

  if (error) {
    console.error('getAnimalsPaginated error:', error);
    try {
      let localAnimals = await offlineDb.animals.toArray();
      if (farmId && farmId !== 'all') {
        localAnimals = localAnimals.filter((a) => a.farm_id === farmId);
      }
      if (qStr) {
        const lowerQ = qStr.toLowerCase();
        localAnimals = localAnimals.filter(
          (a) =>
            ((a.tag_number && String(a.tag_number).toLowerCase().includes(lowerQ)) ||
             (a.ear_tag && a.ear_tag.toLowerCase().includes(lowerQ)))
        );
      }
      const totalCount = localAnimals.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      const fallbackSliced = localAnimals.slice(from, from + pageSize).map((a) => ({
        id: a.id,
        organization_id: (a.organization_id as string) || '',
        farm_id: a.farm_id,
        property_id: (a.property_id as string) || null,
        tag_number: ((a.tag_number as string) || a.ear_tag) as string,
        rfid_number: (a.rfid_number as string) || null,
        breed_id: (a.breed_id as string) || null,
        category_id: (a.category_id as string) || null,
        reproductive_status: (a.reproductive_status as string) || 'vazia',
        birth_date: (a.birth_date as string) || null,
        sex: (a.sex as string) || 'F',
        status: (a.status as string) || 'active',
        breeds: a.breed ? { name: String(a.breed) } : null,
        animal_categories: a.category ? { name: String(a.category) } : null,
        properties: null,
        farms: null,
      })) as unknown as Animal[];
      return { data: fallbackSliced, totalCount, page, pageSize, totalPages };
    } catch {}
    return { data: [], totalCount: 0, page, pageSize, totalPages: 1 };
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const resultData = (data ?? []) as unknown as Animal[];

  const result: PaginatedAnimalsResult = {
    data: resultData,
    totalCount,
    page,
    pageSize,
    totalPages,
  };

  setCached(cacheKey, result);

  if (data && data.length > 0) {
    offlineDb.animals.bulkPut(
      (data as Array<{
        id: string;
        farm_id: string;
        tag_number: string;
        status?: string;
        reproductive_status?: string;
        animal_categories?: { name: string } | null;
        breeds?: { name: string } | null;
        breed_id?: string | null;
        category_id?: string | null;
        property_id?: string | null;
        organization_id?: string;
        updated_at?: string;
      }>).map((a) => ({
        id: a.id,
        farm_id: a.farm_id,
        ear_tag: a.tag_number,
        tag_number: a.tag_number,
        name: a.tag_number,
        status: a.status || 'active',
        reproductive_status: a.reproductive_status || 'vazia',
        category: a.animal_categories?.name || a.category_id || undefined,
        breed: a.breeds?.name || a.breed_id || undefined,
        breed_id: a.breed_id || undefined,
        category_id: a.category_id || undefined,
        property_id: a.property_id || undefined,
        organization_id: a.organization_id || orgId,
        updated_at: a.updated_at || new Date().toISOString(),
      }))
    ).catch(() => {});
  }

  return result;
}

export async function searchAnimals(query: string, farmId?: string): Promise<Animal[]> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const q = query.trim().toLowerCase();
      let localAnimals = await offlineDb.animals.toArray();
      if (farmId && farmId !== 'all') {
        localAnimals = localAnimals.filter((a) => a.farm_id === farmId);
      }
      localAnimals = localAnimals.filter(
        (a) =>
          a.status !== 'inactive' &&
          ((a.tag_number && String(a.tag_number).toLowerCase().includes(q)) ||
            (a.ear_tag && a.ear_tag.toLowerCase().includes(q)))
      );
      return localAnimals.slice(0, 20).map((a) => ({
        id: a.id,
        organization_id: (a.organization_id as string) || '',
        farm_id: a.farm_id,
        property_id: (a.property_id as string) || null,
        tag_number: ((a.tag_number as string) || a.ear_tag) as string,
        rfid_number: (a.rfid_number as string) || null,
        breed_id: (a.breed_id as string) || null,
        category_id: (a.category_id as string) || null,
        reproductive_status: (a.reproductive_status as string) || 'vazia',
        birth_date: (a.birth_date as string) || null,
        sex: (a.sex as string) || 'F',
        status: (a.status as string) || 'active',
        breeds: a.breed ? { name: String(a.breed) } : null,
        animal_categories: a.category ? { name: String(a.category) } : null,
        properties: null,
        farms: null,
      })) as unknown as Animal[];
    } catch (e) {
      console.warn('searchAnimals offline error:', e);
      return [];
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const supabase = createClient();
  let q = supabase
    .from('animals')
    .select('*, breeds(name), animal_categories(name), properties(name), farms(name)')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .ilike('tag_number', `%${query}%`);

  if (farmId && farmId !== 'all') {
    q = q.eq('farm_id', farmId);
  }

  const { data, error } = await q.limit(100);

  if (error) {
    console.error('searchAnimals error:', error);
    try {
      const qStr = query.trim().toLowerCase();
      let localAnimals = await offlineDb.animals.toArray();
      if (farmId && farmId !== 'all') {
        localAnimals = localAnimals.filter((a) => a.farm_id === farmId);
      }
      localAnimals = localAnimals.filter(
        (a) =>
          a.status !== 'inactive' &&
          ((a.tag_number && String(a.tag_number).toLowerCase().includes(qStr)) ||
            (a.ear_tag && a.ear_tag.toLowerCase().includes(qStr)))
      );
      return localAnimals.slice(0, 100).map((a) => ({
        id: a.id,
        organization_id: (a.organization_id as string) || '',
        farm_id: a.farm_id,
        property_id: (a.property_id as string) || null,
        tag_number: ((a.tag_number as string) || a.ear_tag) as string,
        rfid_number: (a.rfid_number as string) || null,
        breed_id: (a.breed_id as string) || null,
        category_id: (a.category_id as string) || null,
        reproductive_status: (a.reproductive_status as string) || 'vazia',
        birth_date: (a.birth_date as string) || null,
        sex: (a.sex as string) || 'F',
        status: (a.status as string) || 'active',
        breeds: a.breed ? { name: String(a.breed) } : null,
        animal_categories: a.category ? { name: String(a.category) } : null,
        properties: null,
        farms: null,
      })) as unknown as Animal[];
    } catch {}
    return [];
  }
  return (data ?? []) as unknown as Animal[];
}

export async function createAnimal(animal: {
  farm_id: string;
  property_id?: string;
  tag_number: string;
  rfid_number?: string;
  breed_id?: string;
  category_id?: string;
  reproductive_status?: string;
  birth_date?: string;
}): Promise<{ success: boolean; error?: string }> {
  const cleanTag = animal.tag_number.trim();
  const isOffline = isSystemOffline();

  if (isOffline) {
    try {
      const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
      const orgId = (await getCurrentOrgId()) || storedOrgId || '';

      // 1. Verificar duplicidade de brinco local
      const existing = await offlineDb.animals
        .filter((a) => {
          const matchFarm = !animal.farm_id || a.farm_id === animal.farm_id;
          const matchTag = ((a.ear_tag && a.ear_tag.toLowerCase() === cleanTag.toLowerCase()) ||
                           (a.tag_number && String(a.tag_number).toLowerCase() === cleanTag.toLowerCase()));
          return matchFarm && Boolean(matchTag);
        })
        .first();

      if (existing) {
        return {
          success: false,
          error: `Já existe uma matriz cadastrada com o brinco "${cleanTag}" nesta fazenda (local).`,
        };
      }

      const animalId = crypto.randomUUID();
      await syncEngine.recordOfflineAnimal({
        id: animalId,
        organization_id: orgId,
        farm_id: animal.farm_id,
        property_id: animal.property_id || null,
        tag_number: cleanTag,
        rfid_number: animal.rfid_number ? animal.rfid_number.trim() : null,
        breed_id: animal.breed_id || null,
        category_id: animal.category_id || null,
        reproductive_status: animal.reproductive_status || 'vazia',
        birth_date: animal.birth_date || null,
        sex: 'F',
        status: 'active',
      });

      invalidateCache('animals');
      invalidateCache('metrics');
      return { success: true };
    } catch (err: unknown) {
      console.error('createAnimal offline error:', err);
      return {
        success: false,
        error: 'Erro offline ao cadastrar matriz: ' + (err instanceof Error ? err.message : String(err)),
      };
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return { success: false, error: 'Organização não identificada.' };

  const supabase = createClient();
  const { data: newAnimal, error } = await supabase.from('animals').insert({
    organization_id: orgId,
    farm_id: animal.farm_id,
    property_id: animal.property_id || null,
    tag_number: cleanTag,
    rfid_number: animal.rfid_number ? animal.rfid_number.trim() : null,
    breed_id: animal.breed_id || null,
    category_id: animal.category_id || null,
    reproductive_status: animal.reproductive_status || 'vazia',
    birth_date: animal.birth_date || null,
    sex: 'F',
    status: 'active',
  }).select('id').maybeSingle();

  if (error) {
    console.error('createAnimal error:', error.message, error.details, error.code);
    if (error.code === '23505' || error.message?.includes('unique constraint') || error.message?.includes('duplicate key')) {
      return {
        success: false,
        error: `Já existe uma matriz cadastrada com o brinco "${cleanTag}" nesta fazenda.`,
      };
    }
    return { success: false, error: error.message };
  }

  if (newAnimal?.id) {
    offlineDb.animals.put({
      id: newAnimal.id,
      farm_id: animal.farm_id,
      ear_tag: cleanTag,
      tag_number: cleanTag,
      name: cleanTag,
      status: 'active',
      reproductive_status: animal.reproductive_status || 'vazia',
      category: animal.category_id || undefined,
      breed: animal.breed_id || undefined,
      property_id: animal.property_id || undefined,
      organization_id: orgId,
      updated_at: new Date().toISOString(),
    }).catch(() => {});
  }

  invalidateCache('animals');
  invalidateCache('metrics');
  return { success: true };
}

export async function updateAnimal(
  id: string,
  updates: {
    farm_id?: string;
    property_id?: string | null;
    tag_number?: string;
    rfid_number?: string | null;
    breed_id?: string | null;
    category_id?: string | null;
    reproductive_status?: string;
    birth_date?: string | null;
    status?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const isOffline = isSystemOffline();
  const cleanTag = updates.tag_number !== undefined ? updates.tag_number.trim() : undefined;
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;

  if (isOffline) {
    try {
      const existing = await offlineDb.animals.get(id);
      if (existing) {
        await offlineDb.animals.update(id, {
          ...(updates.farm_id ? { farm_id: updates.farm_id } : {}),
          ...(cleanTag ? { ear_tag: cleanTag, tag_number: cleanTag, name: cleanTag } : {}),
          ...(updates.rfid_number !== undefined ? { rfid_number: updates.rfid_number } : {}),
          ...(updates.reproductive_status ? { reproductive_status: updates.reproductive_status } : {}),
          ...(updates.status ? { status: updates.status } : {}),
          ...(updates.breed_id !== undefined ? { breed_id: updates.breed_id || undefined } : {}),
          ...(updates.category_id !== undefined ? { category_id: updates.category_id || undefined } : {}),
          ...(updates.property_id !== undefined ? { property_id: updates.property_id || undefined } : {}),
          updated_at: new Date().toISOString(),
        });
      }
      await syncEngine.enqueueMutation('update', 'animals', id, updates.farm_id || existing?.farm_id, {
        id,
        ...(cleanTag ? { tag_number: cleanTag } : {}),
        ...(updates.rfid_number !== undefined ? { rfid_number: updates.rfid_number } : {}),
        ...(updates.farm_id ? { farm_id: updates.farm_id } : {}),
        ...(updates.property_id !== undefined ? { property_id: updates.property_id } : {}),
        ...(updates.breed_id !== undefined ? { breed_id: updates.breed_id } : {}),
        ...(updates.category_id !== undefined ? { category_id: updates.category_id } : {}),
        ...(updates.reproductive_status ? { reproductive_status: updates.reproductive_status } : {}),
        ...(updates.birth_date !== undefined ? { birth_date: updates.birth_date } : {}),
        ...(updates.status ? { status: updates.status } : {}),
        updated_at: new Date().toISOString(),
      }, orgId || undefined);

      invalidateCache('animals');
      invalidateCache('metrics');
      invalidateCache('lots');
      return { success: true };
    } catch (e) {
      console.error('updateAnimal offline error:', e);
      return { success: false, error: 'Erro offline ao atualizar matriz.' };
    }
  }

  const supabase = createClient();
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (cleanTag !== undefined) updatePayload.tag_number = cleanTag;
  if (updates.rfid_number !== undefined) updatePayload.rfid_number = updates.rfid_number ? updates.rfid_number.trim() : null;
  if (updates.farm_id !== undefined) updatePayload.farm_id = updates.farm_id;
  if (updates.property_id !== undefined) updatePayload.property_id = updates.property_id || null;
  if (updates.breed_id !== undefined) updatePayload.breed_id = updates.breed_id || null;
  if (updates.category_id !== undefined) updatePayload.category_id = updates.category_id || null;
  if (updates.reproductive_status !== undefined) updatePayload.reproductive_status = updates.reproductive_status;
  if (updates.birth_date !== undefined) updatePayload.birth_date = updates.birth_date || null;
  if (updates.status !== undefined) updatePayload.status = updates.status;

  const { error } = await supabase
    .from('animals')
    .update(updatePayload)
    .eq('id', id);

  if (error) {
    console.error('updateAnimal error:', error);
    if (error.code === '23505' || error.message?.includes('unique constraint') || error.message?.includes('duplicate key')) {
      return {
        success: false,
        error: `Já existe uma matriz cadastrada com o brinco "${cleanTag}" nesta fazenda.`,
      };
    }
    return { success: false, error: error.message };
  }

  // Atualizar Dexie offline local
  try {
    const existing = await offlineDb.animals.get(id);
    if (existing) {
      await offlineDb.animals.update(id, {
        ...(updates.farm_id ? { farm_id: updates.farm_id } : {}),
        ...(cleanTag ? { ear_tag: cleanTag, tag_number: cleanTag, name: cleanTag } : {}),
        ...(updates.status ? { status: updates.status } : {}),
        ...(updates.reproductive_status ? { reproductive_status: updates.reproductive_status } : {}),
        updated_at: new Date().toISOString(),
      });
    }
  } catch {}

  invalidateCache('animals');
  invalidateCache('metrics');
  invalidateCache('lots');
  return { success: true };
}

export async function deleteAnimal(
  id: string,
  force = false
): Promise<{
  success: boolean;
  error?: string;
  hasRelations?: boolean;
  lotCount?: number;
  mgmtCount?: number;
}> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;

  if (isOffline) {
    try {
      await offlineDb.animals.delete(id);
      await offlineDb.lot_animals.where('animal_id').equals(id).delete().catch(() => {});
      await syncEngine.enqueueMutation('delete', 'animals', id, undefined, { id }, orgId || undefined);
      invalidateCache('animals');
      invalidateCache('metrics');
      invalidateCache('lots');
      return { success: true };
    } catch (e) {
      console.error('deleteAnimal offline error:', e);
      return { success: false, error: 'Erro offline ao excluir matriz.' };
    }
  }

  const supabase = createClient();

  // 1. Verificar registros vinculados (lotes IATF, manejos reprodutivos, estoque genético)
  const [lotCheck, mgmtCheck, donorCheck] = await Promise.all([
    supabase.from('iatf_lot_animals').select('id', { count: 'exact', head: true }).eq('animal_id', id),
    supabase.from('animal_managements').select('id', { count: 'exact', head: true }).eq('animal_id', id),
    supabase.from('genetic_materials').select('id', { count: 'exact', head: true }).eq('donor_id', id),
  ]);

  const lotCount = lotCheck.count || 0;
  const mgmtCount = mgmtCheck.count || 0;
  const donorCount = donorCheck.count || 0;
  const totalRefs = lotCount + mgmtCount + donorCount;

  if (totalRefs > 0 && !force) {
    return {
      success: false,
      hasRelations: true,
      lotCount,
      mgmtCount,
      error: `Esta matriz possui ${totalRefs} vínculo(s) no sistema (${lotCount} lote(s) de IATF e ${mgmtCount} manejo(s) individual(is)). Para manter a rastreabilidade zootécnica, você pode inativar a matriz ou confirmar a exclusão com remoção do histórico.`,
    };
  }

  // 2. Se force = true ou totalRefs === 0, executa a exclusão em cascata
  if (totalRefs > 0) {
    await supabase.from('animal_managements').delete().eq('animal_id', id);
    await supabase.from('iatf_lot_animals').delete().eq('animal_id', id);
  }

  const { error } = await supabase
    .from('animals')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('deleteAnimal error:', error);
    return { success: false, error: error.message };
  }

  // 3. Atualizar Dexie local
  try {
    await offlineDb.animals.delete(id);
    await offlineDb.lot_animals.where('animal_id').equals(id).delete();
  } catch {}

  // 4. Invalidar caches
  invalidateCache('animals');
  invalidateCache('metrics');
  invalidateCache('lots');
  invalidateCache('animal_managements');

  return { success: true };
}

export async function getAnimalById(animalId: string): Promise<Animal | null> {
  const buildOfflineAnimal = async (): Promise<Animal | null> => {
    try {
      const a = await offlineDb.animals.get(animalId);
      if (!a) return null;
      const [farm, prop, breed, cat] = await Promise.all([
        a.farm_id ? offlineDb.farms.get(a.farm_id) : Promise.resolve(undefined),
        a.property_id ? offlineDb.properties.get(a.property_id) : Promise.resolve(undefined),
        a.breed_id ? offlineDb.breeds.get(a.breed_id) : Promise.resolve(undefined),
        a.category_id ? offlineDb.categories.get(a.category_id) : Promise.resolve(undefined),
      ]);
      const raw = a as Record<string, unknown>;
      return {
        id: a.id,
        farm_id: a.farm_id,
        property_id: (a.property_id as string | null) || null,
        tag_number: String(a.tag_number || a.ear_tag || ''),
        rfid_number: (raw.rfid_number as string | null) || null,
        breed_id: (a.breed_id as string | null) || null,
        category_id: (a.category_id as string | null) || null,
        birth_date: (raw.birth_date as string | null) || null,
        sex: (raw.sex as string) || 'F',
        status: a.status || 'active',
        reproductive_status: String(a.reproductive_status || 'vazia'),
        breeds: breed ? { name: breed.name } : a.breed ? { name: String(a.breed) } : null,
        animal_categories: cat ? { name: cat.name } : a.category ? { name: String(a.category) } : null,
        properties: prop ? { name: prop.name } : null,
        farms: farm ? { name: farm.name } : null,
      };
    } catch {
      return null;
    }
  };

  if (isSystemOffline()) {
    return buildOfflineAnimal();
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('animals')
    .select(`
      id, farm_id, property_id, tag_number, rfid_number, breed_id, category_id,
      birth_date, sex, status, reproductive_status,
      breeds (name),
      animal_categories (name),
      properties (name),
      farms (name)
    `)
    .eq('id', animalId)
    .maybeSingle();

  if (error || !data) {
    if (isNetworkError(error)) {
      syncEngine.markOffline();
    }
    return buildOfflineAnimal();
  }

  return data as unknown as Animal;
}

export async function getAnimalHistory(animalId: string) {
  const buildOfflineHistory = async () => {
    try {
      const [lotAnimals, managements, lots, protocols, seasons, properties, bulls] = await Promise.all([
        offlineDb.lot_animals.where('animal_id').equals(animalId).toArray(),
        offlineDb.animal_managements.where('animal_id').equals(animalId).toArray(),
        offlineDb.lots.toArray(),
        offlineDb.protocols.toArray(),
        offlineDb.seasons.toArray(),
        offlineDb.properties.toArray(),
        offlineDb.bulls.toArray(),
      ]);

      const lotMap = new Map(lots.map((l) => [l.id, l]));
      const protoMap = new Map(protocols.map((p) => [p.id, p]));
      const seasonMap = new Map(seasons.map((s) => [s.id, s]));
      const propMap = new Map(properties.map((p) => [p.id, p]));
      const bullMap = new Map(bulls.map((b) => [b.id, b]));

      const lotData = lotAnimals.map((la) => {
        const lot = lotMap.get(la.lot_id);
        const season = lot?.season_id ? seasonMap.get(lot.season_id) : undefined;
        const proto = lot?.protocol_id ? protoMap.get(lot.protocol_id) : undefined;
        const prop = lot?.property_id ? propMap.get(lot.property_id as string) : undefined;
        const bull = la.bull_id ? bullMap.get(la.bull_id as string) : undefined;

        return {
          id: la.id,
          ecc_ia: la.ecc_ia ?? null,
          ecc_dg: la.ecc_dg ?? null,
          inseminator_name: la.inseminator_name ?? null,
          pregnancy_status: la.pregnancy_status || 'pendente',
          expected_parturition_date: la.expected_parturition_date ?? null,
          created_at: la.created_at || la.updated_at || new Date().toISOString(),
          source: 'lot',
          iatf_lots: lot
            ? {
                code: lot.code,
                start_date: lot.start_date,
                ia_planned_date: lot.ia_planned_date,
                status: lot.status,
                reproductive_seasons: season ? { name: season.name } : null,
                protocols: proto ? { name: proto.name } : null,
                properties: prop ? { name: prop.name } : null,
              }
            : null,
          bulls: bull ? { name: bull.name } : la.bulls || null,
        };
      });

      const mgmtData = managements.map((m) => {
        const raw = m as Record<string, unknown>;
        const lot = m.lot_id ? lotMap.get(m.lot_id) : undefined;
        const season = raw.season_id ? seasonMap.get(raw.season_id as string) : undefined;
        const proto = raw.protocol_id ? protoMap.get(raw.protocol_id as string) : undefined;
        const bull = raw.bull_id ? bullMap.get(raw.bull_id as string) : undefined;
        const cycleNumber = (raw.cycle_number as number) || 1;

        return {
          id: m.id,
          ecc_ia: raw.ecc_ia ?? null,
          ecc_dg: raw.ecc_dg ?? null,
          inseminator_name: raw.inseminator_name || m.inseminator || null,
          pregnancy_status: raw.pregnancy_status || m.diagnosis_result || 'pendente',
          expected_parturition_date: raw.expected_parturition_date ?? null,
          created_at: m.created_at || m.updated_at || new Date().toISOString(),
          cycle_number: cycleNumber,
          source: 'individual',
          d0_executed_at: raw.d0_executed_at || (m.step_code === 'D0' ? m.date : null),
          d9_executed_at: raw.d9_executed_at || (m.step_code === 'D9' ? m.date : null),
          ia_executed_at: raw.ia_executed_at || (m.step_code === 'IA' ? m.date : null),
          dg_executed_at: raw.dg_executed_at || (m.step_code === 'DG' ? m.date : null),
          iatf_lots: lot
            ? {
                code: lot.code,
                start_date: raw.start_date || m.date,
                ia_planned_date: raw.ia_date || lot.ia_planned_date,
                status: raw.status || 'em_andamento',
                reproductive_seasons: season ? { name: season.name } : null,
                protocols: proto ? { name: proto.name } : null,
              }
            : {
                code: `Manejo Indiv. (${cycleNumber}ª IATF)`,
                start_date: raw.start_date || m.date,
                ia_planned_date: raw.ia_date || null,
                status: raw.status || 'em_andamento',
                reproductive_seasons: season ? { name: season.name } : null,
                protocols: proto ? { name: proto.name } : null,
              },
          bulls: bull ? { name: bull.name } : m.bull_name ? { name: m.bull_name } : null,
        };
      });

      return [...mgmtData, ...lotData].sort((a, b) => {
        const dateA = new Date(String(a.created_at || 0)).getTime();
        const dateB = new Date(String(b.created_at || 0)).getTime();
        return dateB - dateA;
      });
    } catch (e) {
      console.warn('getAnimalHistory offline fallback error:', e);
      return [];
    }
  };

  if (isSystemOffline()) {
    return buildOfflineHistory();
  }

  const supabase = createClient();
  const [lotRes, mgmtRes] = await Promise.all([
    supabase
      .from('iatf_lot_animals')
      .select(`
        id, ecc_ia, ecc_dg, inseminator_name, pregnancy_status, expected_parturition_date, created_at,
        iatf_lots (code, start_date, ia_planned_date, status,
          reproductive_seasons (name),
          protocols (name),
          properties (name)
        ),
        bulls (name)
      `)
      .eq('animal_id', animalId)
      .order('created_at', { ascending: false }),
    supabase
      .from('animal_managements')
      .select(`
        id, ecc_ia, ecc_dg, inseminator_name, pregnancy_status, expected_parturition_date, created_at,
        cycle_number, start_date, ia_date, dg_date, status,
        d0_executed_at, d9_executed_at, ia_executed_at, dg_executed_at,
        reproductive_seasons (name),
        protocols (name),
        iatf_lots (code),
        bulls (name)
      `)
      .eq('animal_id', animalId)
      .order('created_at', { ascending: false }),
  ]);

  if (lotRes.error || mgmtRes.error) {
    if (isNetworkError(lotRes.error) || isNetworkError(mgmtRes.error)) {
      syncEngine.markOffline();
      return buildOfflineHistory();
    }
    if (lotRes.error) console.error('getAnimalHistory lot error:', lotRes.error);
    if (mgmtRes.error) console.error('getAnimalHistory mgmt error:', mgmtRes.error);
  }

  const lotData = (lotRes.data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    source: 'lot',
  }));

  const mgmtData = (mgmtRes.data ?? []).map((m: Record<string, unknown>) => ({
    id: m.id,
    ecc_ia: m.ecc_ia,
    ecc_dg: m.ecc_dg,
    inseminator_name: m.inseminator_name,
    pregnancy_status: m.pregnancy_status,
    expected_parturition_date: m.expected_parturition_date,
    created_at: m.created_at,
    cycle_number: m.cycle_number,
    source: 'individual',
    d0_executed_at: m.d0_executed_at,
    d9_executed_at: m.d9_executed_at,
    ia_executed_at: m.ia_executed_at,
    dg_executed_at: m.dg_executed_at,
    iatf_lots: (m.iatf_lots as Record<string, unknown> | null)?.code
      ? {
          code: (m.iatf_lots as Record<string, unknown>).code,
          start_date: m.start_date,
          ia_planned_date: m.ia_date,
          status: m.status,
          reproductive_seasons: m.reproductive_seasons,
          protocols: m.protocols,
        }
      : {
          code: `Manejo Indiv. (${m.cycle_number}ª IATF)`,
          start_date: m.start_date,
          ia_planned_date: m.ia_date,
          status: m.status,
          reproductive_seasons: m.reproductive_seasons,
          protocols: m.protocols,
        },
    bulls: m.bulls,
  }));

  const combined = [...mgmtData, ...lotData].sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
    const dateA = new Date(String(a.created_at || 0)).getTime();
    const dateB = new Date(String(b.created_at || 0)).getTime();
    return dateB - dateA;
  });

  return combined;
}

// ============================================================
// DASHBOARD METRICS
// ============================================================

export interface OrgMetrics {
  organization_id: string;
  active_lots: number;
  total_animals: number;
  total_inseminations: number;
  total_pregnancies: number;
  total_empty: number;
  total_diagnoses: number;
  total_device_losses: number;
  overall_pregnancy_rate: number;
}

export async function getOrgMetrics(forceRefresh = false): Promise<OrgMetrics | null> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return null;

  const cacheKey = `metrics_${orgId}`;
  if (!forceRefresh) {
    const cached = getCached<OrgMetrics>(cacheKey);
    if (cached) return cached;
  }

  if (isSystemOffline()) {
    return getCached<OrgMetrics>(cacheKey);
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('organization_metrics')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) {
    if (isNetworkError(error)) {
      syncEngine.markOffline();
    } else {
      console.error('getOrgMetrics error:', error);
    }
    return getCached<OrgMetrics>(cacheKey);
  }
  const result = data as OrgMetrics;
  if (result) setCached(cacheKey, result);
  return result;
}

// ============================================================
// PROTOCOLS
// ============================================================

export interface Protocol {
  id: string;
  name: string;
  description: string | null;
  number_of_managements: number;
  status: string;
  protocol_steps: {
    id: string;
    step_order: number;
    code: string;
    name: string;
    day_offset: number;
    dosage_instruction: string | null;
  }[];
}

export async function getProtocols(forceRefresh = false, includeArchived = false): Promise<Protocol[]> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const offlineProtos = await offlineDb.protocols.toArray();
      return offlineProtos
        .filter((p) => includeArchived || p.status !== 'archived')
        .map((p) => ({
          id: p.id,
          name: p.name,
          description: (p.description as string) || null,
          number_of_managements: (p.number_of_managements as number) || 3,
          status: (p.status as string) || 'active',
          protocol_steps: (p.protocol_steps as Protocol['protocol_steps']) || [],
        }));
    } catch (e) {
      console.warn('Falha ao carregar protocolos offline:', e);
      return [];
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) {
    try {
      const offlineProtos = await offlineDb.protocols.toArray();
      if (offlineProtos.length > 0) {
        return offlineProtos
          .filter((p) => includeArchived || p.status !== 'archived')
          .map((p) => ({
            id: p.id,
            name: p.name,
            description: (p.description as string) || null,
            number_of_managements: (p.number_of_managements as number) || 3,
            status: (p.status as string) || 'active',
            protocol_steps: (p.protocol_steps as Protocol['protocol_steps']) || [],
          }));
      }
    } catch {
      // ignore
    }
    return [];
  }

  const cacheKey = `protocols_${orgId}_${includeArchived ? 'all' : 'active'}`;
  if (!forceRefresh) {
    const cached = getCached<Protocol[]>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  let query = supabase
    .from('protocols')
    .select('*, protocol_steps(*)')
    .eq('organization_id', orgId);

  if (!includeArchived) {
    query = query.eq('status', 'active');
  }

  const { data, error } = await query.order('name');

  if (error) {
    console.error('getProtocols error:', error);
    try {
      const offlineProtos = await offlineDb.protocols.toArray();
      if (offlineProtos.length > 0) {
        return offlineProtos
          .filter((p) => includeArchived || p.status !== 'archived')
          .map((p) => ({
            id: p.id,
            name: p.name,
            description: (p.description as string) || null,
            number_of_managements: (p.number_of_managements as number) || 3,
            status: (p.status as string) || 'active',
            protocol_steps: (p.protocol_steps as Protocol['protocol_steps']) || [],
          }));
      }
    } catch {
      // ignore
    }
    return getCached<Protocol[]>(cacheKey) ?? [];
  }
  const result = (data ?? []) as unknown as Protocol[];
  setCached(cacheKey, result);

  if (result.length > 0) {
    try {
      await offlineDb.protocols.bulkPut(
        result.map((p) => ({
          id: p.id,
          organization_id: orgId,
          name: p.name,
          description: p.description || undefined,
          number_of_managements: p.number_of_managements,
          status: p.status,
          protocol_steps: p.protocol_steps,
          updated_at: new Date().toISOString(),
        } as unknown as import('./offline/offlineDb').OfflineProtocol))
      );
    } catch (e) {
      console.warn('Erro ao salvar protocolos no IndexedDB:', e);
    }
  }

  return result;
}

export async function createProtocol(protocol: {
  name: string;
  description?: string;
  number_of_managements: number;
  steps: {
    code: string;
    name: string;
    day_offset: number;
    dosage_instruction?: string;
  }[];
}): Promise<boolean> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return false;

  const newId = crypto.randomUUID();
  const stepsWithIds = protocol.steps.map((step, idx) => ({
    id: crypto.randomUUID(),
    protocol_id: newId,
    step_order: idx + 1,
    code: step.code.trim(),
    name: step.name.trim(),
    day_offset: Number(step.day_offset) || 0,
    dosage_instruction: step.dosage_instruction?.trim() || null,
  }));

  if (isOffline) {
    try {
      await offlineDb.protocols.put({
        id: newId,
        organization_id: orgId,
        name: protocol.name.trim(),
        description: protocol.description?.trim() || undefined,
        number_of_managements: protocol.number_of_managements,
        status: 'active',
        protocol_steps: stepsWithIds,
        updated_at: new Date().toISOString(),
      } as unknown as import('./offline/offlineDb').OfflineProtocol);

      await syncEngine.enqueueMutation('insert', 'protocols', newId, undefined, {
        id: newId,
        organization_id: orgId,
        name: protocol.name.trim(),
        description: protocol.description?.trim() || null,
        number_of_managements: protocol.number_of_managements,
        status: 'active',
      }, orgId);

      for (const st of stepsWithIds) {
        await syncEngine.enqueueMutation('insert', 'protocol_steps', st.id, undefined, st, orgId);
      }

      invalidateCache('protocols');
      return true;
    } catch (e) {
      console.error('createProtocol offline error:', e);
      return false;
    }
  }

  const supabase = createClient();
  const { data: created, error: protoErr } = await supabase
    .from('protocols')
    .insert({
      id: newId,
      organization_id: orgId,
      name: protocol.name.trim(),
      description: protocol.description?.trim() || null,
      number_of_managements: protocol.number_of_managements,
      status: 'active',
    })
    .select('id')
    .single();

  if (protoErr || !created) {
    console.error('createProtocol error:', protoErr);
    return false;
  }

  const { error: stepsErr } = await supabase
    .from('protocol_steps')
    .insert(stepsWithIds);

  if (stepsErr) {
    console.error('createProtocol steps error:', stepsErr);
    return false;
  }

  try {
    await offlineDb.protocols.put({
      id: newId,
      organization_id: orgId,
      name: protocol.name.trim(),
      description: protocol.description?.trim() || undefined,
      number_of_managements: protocol.number_of_managements,
      status: 'active',
      protocol_steps: stepsWithIds,
      updated_at: new Date().toISOString(),
    } as unknown as import('./offline/offlineDb').OfflineProtocol);
  } catch {}

  invalidateCache('protocols');
  return true;
}

export async function updateProtocol(
  id: string,
  protocol: {
    name: string;
    description?: string | null;
    number_of_managements: number;
    status?: string;
    steps?: {
      code: string;
      name: string;
      day_offset: number;
      dosage_instruction?: string | null;
    }[];
  }
): Promise<boolean> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return false;

  if (isOffline) {
    try {
      const existing = await offlineDb.protocols.get(id);
      const stepsToSave = protocol.steps ? protocol.steps.map((step, idx) => ({
        id: crypto.randomUUID(),
        protocol_id: id,
        step_order: idx + 1,
        code: step.code.trim(),
        name: step.name.trim(),
        day_offset: Number(step.day_offset) || 0,
        dosage_instruction: step.dosage_instruction?.trim() || null,
      })) : (existing?.protocol_steps || []);

      await offlineDb.protocols.put({
        ...existing,
        id,
        organization_id: orgId,
        name: protocol.name.trim(),
        description: protocol.description?.trim() || undefined,
        number_of_managements: protocol.number_of_managements,
        status: protocol.status || existing?.status || 'active',
        protocol_steps: stepsToSave,
        updated_at: new Date().toISOString(),
      } as unknown as import('./offline/offlineDb').OfflineProtocol);

      await syncEngine.enqueueMutation('update', 'protocols', id, undefined, {
        id,
        name: protocol.name.trim(),
        description: protocol.description?.trim() || null,
        number_of_managements: protocol.number_of_managements,
        status: protocol.status || 'active',
        updated_at: new Date().toISOString(),
      }, orgId);

      invalidateCache('protocols');
      return true;
    } catch (e) {
      console.error('updateProtocol offline error:', e);
      return false;
    }
  }

  const supabase = createClient();

  // 1. Atualizar dados do cabeçalho do protocolo
  const { error: protoErr } = await supabase
    .from('protocols')
    .update({
      name: protocol.name.trim(),
      description: protocol.description?.trim() || null,
      number_of_managements: protocol.number_of_managements,
      status: protocol.status || 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId);

  if (protoErr) {
    console.error('updateProtocol error:', protoErr);
    return false;
  }

  // 2. Se etapas foram fornecidas, sincronizar as etapas
  if (protocol.steps && protocol.steps.length > 0) {
    await supabase.from('protocol_steps').delete().eq('protocol_id', id);

    const stepsToInsert = protocol.steps.map((step, idx) => ({
      protocol_id: id,
      step_order: idx + 1,
      code: step.code.trim(),
      name: step.name.trim(),
      day_offset: Number(step.day_offset) || 0,
      dosage_instruction: step.dosage_instruction?.trim() || null,
    }));

    await supabase.from('protocol_steps').insert(stepsToInsert);
  }

  try {
    const existing = await offlineDb.protocols.get(id);
    if (existing) {
      await offlineDb.protocols.update(id, {
        name: protocol.name.trim(),
        description: protocol.description?.trim() || undefined,
        number_of_managements: protocol.number_of_managements,
        updated_at: new Date().toISOString(),
      });
    }
  } catch {}

  invalidateCache('protocols');
  return true;
}

export async function deleteProtocol(id: string): Promise<{ success: boolean; error?: string }> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return { success: false, error: 'Sessão inválida' };

  if (isOffline) {
    try {
      await offlineDb.protocols.delete(id);
      await syncEngine.enqueueMutation('delete', 'protocols', id, undefined, { id }, orgId);
      invalidateCache('protocols');
      return { success: true };
    } catch (e) {
      console.error('deleteProtocol offline error:', e);
      return { success: false, error: 'Erro offline ao excluir protocolo.' };
    }
  }

  const supabase = createClient();

  // 1. Verificar se existem lotes de IATF vinculados a este protocolo
  const { count: lotsCount } = await supabase
    .from('iatf_lots')
    .select('id', { count: 'exact', head: true })
    .eq('protocol_id', id);

  if (lotsCount && lotsCount > 0) {
    return {
      success: false,
      error: `Não é possível excluir este protocolo pois existem ${lotsCount} lote(s) de IATF vinculados a ele. Você pode arquivá-lo para preservar os históricos operacionais.`,
    };
  }

  await supabase.from('protocol_steps').delete().eq('protocol_id', id);

  const { error } = await supabase
    .from('protocols')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    console.error('deleteProtocol error:', error);
    return { success: false, error: 'Erro ao excluir protocolo no banco de dados.' };
  }

  try {
    await offlineDb.protocols.delete(id);
  } catch {}

  invalidateCache('protocols');
  return { success: true };
}

export async function toggleProtocolStatus(id: string, newStatus: 'active' | 'archived'): Promise<boolean> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return false;

  if (isOffline) {
    try {
      const existing = await offlineDb.protocols.get(id);
      if (existing) {
        await offlineDb.protocols.update(id, {
          status: newStatus,
          updated_at: new Date().toISOString(),
        });
      }
      await syncEngine.enqueueMutation('update', 'protocols', id, undefined, {
        id,
        status: newStatus,
        updated_at: new Date().toISOString(),
      }, orgId);
      invalidateCache('protocols');
      return true;
    } catch (e) {
      console.error('toggleProtocolStatus offline error:', e);
      return false;
    }
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('protocols')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    console.error('toggleProtocolStatus error:', error);
    return false;
  }

  try {
    await offlineDb.protocols.update(id, {
      status: newStatus,
      updated_at: new Date().toISOString(),
    });
  } catch {}

  invalidateCache('protocols');
  return true;
}

// ============================================================
// BULLS & CENTRAIS (GENETIC CENTERS)
// ============================================================

export interface Bull {
  id: string;
  name: string;
  code: string | null;
  registration_number?: string | null;
  breed_id?: string | null;
  owner_central: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
  breeds?: { id: string; name: string } | null;
}

export async function getBulls(forceRefresh = false): Promise<Bull[]> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const offlineBulls = await offlineDb.bulls.toArray();
      return offlineBulls.map((b) => ({
        id: b.id,
        name: b.name,
        code: (b.code as string) || null,
        registration_number: (b.registration_number as string) || null,
        owner_central: (b.central as string) || null,
        status: (b.status as string) || 'active',
        created_at: (b.created_at as string) || undefined,
        updated_at: (b.updated_at as string) || undefined,
        breeds: (b.breeds as { id: string; name: string }) || null,
      }));
    } catch (e) {
      console.warn('Falha ao carregar touros offline:', e);
      return [];
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) {
    try {
      const offlineBulls = await offlineDb.bulls.toArray();
      if (offlineBulls.length > 0) {
        return offlineBulls.map((b) => ({
          id: b.id,
          name: b.name,
          code: (b.code as string) || null,
          registration_number: (b.registration_number as string) || null,
          owner_central: (b.central as string) || null,
          status: (b.status as string) || 'active',
          created_at: (b.created_at as string) || undefined,
          updated_at: (b.updated_at as string) || undefined,
          breeds: (b.breeds as { id: string; name: string }) || null,
        }));
      }
    } catch {
      // ignore
    }
    return [];
  }

  const cacheKey = `bulls_${orgId}`;
  if (!forceRefresh) {
    const cached = getCached<Bull[]>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('bulls')
    .select('*, breeds(id, name)')
    .eq('organization_id', orgId)
    .order('name');

  if (error) {
    console.error('getBulls error:', error);
    try {
      const offlineBulls = await offlineDb.bulls.toArray();
      if (offlineBulls.length > 0) {
        return offlineBulls.map((b) => ({
          id: b.id,
          name: b.name,
          code: (b.code as string) || null,
          registration_number: (b.registration_number as string) || null,
          owner_central: (b.central as string) || null,
          status: (b.status as string) || 'active',
          created_at: (b.created_at as string) || undefined,
          updated_at: (b.updated_at as string) || undefined,
          breeds: (b.breeds as { id: string; name: string }) || null,
        }));
      }
    } catch {
      // ignore
    }
    return getCached<Bull[]>(cacheKey) ?? [];
  }
  const result = (data ?? []) as Bull[];
  setCached(cacheKey, result);

  if (result.length > 0) {
    try {
      await offlineDb.bulls.bulkPut(
        result.map((b) => ({
          id: b.id,
          organization_id: orgId,
          name: b.name,
          code: b.code || undefined,
          central: b.owner_central || undefined,
          registration_number: b.registration_number || undefined,
          status: b.status,
          breeds: b.breeds,
          updated_at: new Date().toISOString(),
        } as unknown as import('./offline/offlineDb').OfflineBull))
      );
    } catch (e) {
      console.warn('Erro ao salvar touros no IndexedDB:', e);
    }
  }

  return result;
}

export async function createBull(bull: {
  name: string;
  code?: string;
  owner_central?: string;
  registration_number?: string;
  breed_id?: string;
  status?: string;
}): Promise<{ success: boolean; data?: Bull; error?: string }> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return { success: false, error: 'Organização não identificada.' };

  const newId = crypto.randomUUID();
  let breedObj: { id: string; name: string } | null = null;
  if (bull.breed_id) {
    try {
      const b = await offlineDb.breeds.get(bull.breed_id);
      if (b) breedObj = { id: b.id, name: b.name };
    } catch {}
  }

  const bullRecord: Bull = {
    id: newId,
    name: bull.name.trim(),
    code: bull.code?.trim() || null,
    owner_central: bull.owner_central?.trim() || null,
    registration_number: bull.registration_number?.trim() || null,
    breed_id: bull.breed_id || null,
    status: bull.status || 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    breeds: breedObj,
  };

  if (isOffline) {
    try {
      await offlineDb.bulls.put({
        id: newId,
        organization_id: orgId,
        name: bull.name.trim(),
        code: bull.code?.trim() || undefined,
        central: bull.owner_central?.trim() || undefined,
        registration_number: bull.registration_number?.trim() || undefined,
        status: bull.status || 'active',
        breeds: breedObj || undefined,
        updated_at: new Date().toISOString(),
      } as unknown as import('./offline/offlineDb').OfflineBull);

      await syncEngine.enqueueMutation('insert', 'bulls', newId, undefined, {
        id: newId,
        organization_id: orgId,
        name: bull.name.trim(),
        code: bull.code?.trim() || null,
        owner_central: bull.owner_central?.trim() || null,
        registration_number: bull.registration_number?.trim() || null,
        breed_id: bull.breed_id || null,
        status: bull.status || 'active',
      }, orgId);

      invalidateCache('bulls');
      return { success: true, data: bullRecord };
    } catch (e) {
      console.error('createBull offline error:', e);
      return { success: false, error: 'Erro offline ao cadastrar touro.' };
    }
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('bulls')
    .insert({
      id: newId,
      ...bull,
      organization_id: orgId,
      status: bull.status || 'active',
    })
    .select('*, breeds(id, name)')
    .single();

  if (error) {
    console.error('createBull error:', error);
    return { success: false, error: error.message };
  }

  try {
    await offlineDb.bulls.put({
      id: newId,
      organization_id: orgId,
      name: bull.name.trim(),
      code: bull.code?.trim() || undefined,
      central: bull.owner_central?.trim() || undefined,
      registration_number: bull.registration_number?.trim() || undefined,
      status: bull.status || 'active',
      breeds: (data as Bull)?.breeds || undefined,
      updated_at: new Date().toISOString(),
    } as unknown as import('./offline/offlineDb').OfflineBull);
  } catch {}

  invalidateCache('bulls');
  return { success: true, data: data as Bull };
}

export async function updateBull(
  id: string,
  bull: {
    name?: string;
    code?: string | null;
    owner_central?: string | null;
    registration_number?: string | null;
    breed_id?: string | null;
    status?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;

  if (isOffline) {
    try {
      const existing = await offlineDb.bulls.get(id);
      if (existing) {
        await offlineDb.bulls.update(id, {
          name: bull.name !== undefined ? bull.name.trim() : existing.name,
          code: bull.code !== undefined ? (bull.code?.trim() || undefined) : existing.code,
          central: bull.owner_central !== undefined ? (bull.owner_central?.trim() || undefined) : existing.central,
          registration_number: bull.registration_number !== undefined ? (bull.registration_number?.trim() || undefined) : existing.registration_number,
          status: bull.status || existing.status,
          updated_at: new Date().toISOString(),
        });
      }
      await syncEngine.enqueueMutation('update', 'bulls', id, undefined, {
        id,
        ...bull,
        updated_at: new Date().toISOString(),
      }, orgId || undefined);
      invalidateCache('bulls');
      return { success: true };
    } catch (e) {
      console.error('updateBull offline error:', e);
      return { success: false, error: 'Erro offline ao atualizar touro.' };
    }
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('bulls')
    .update({
      ...bull,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('updateBull error:', error);
    return { success: false, error: error.message };
  }

  try {
    const existing = await offlineDb.bulls.get(id);
    if (existing) {
      await offlineDb.bulls.update(id, {
        name: bull.name !== undefined ? bull.name.trim() : existing.name,
        code: bull.code !== undefined ? (bull.code?.trim() || undefined) : existing.code,
        central: bull.owner_central !== undefined ? (bull.owner_central?.trim() || undefined) : existing.central,
        registration_number: bull.registration_number !== undefined ? (bull.registration_number?.trim() || undefined) : existing.registration_number,
        status: bull.status || existing.status,
        updated_at: new Date().toISOString(),
      });
    }
  } catch {}

  invalidateCache('bulls');
  return { success: true };
}

export async function deleteBull(id: string): Promise<{ success: boolean; error?: string }> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;

  if (isOffline) {
    try {
      await offlineDb.bulls.delete(id);
      await syncEngine.enqueueMutation('delete', 'bulls', id, undefined, { id }, orgId || undefined);
      invalidateCache('bulls');
      return { success: true };
    } catch (e) {
      console.error('deleteBull offline error:', e);
      return { success: false, error: 'Erro offline ao excluir touro.' };
    }
  }

  const supabase = createClient();

  // Verificar se o touro possui registros vinculados antes de deletar
  const [batchesCheck, lotCheck, geneticCheck] = await Promise.all([
    supabase.from('semen_batches').select('id', { count: 'exact', head: true }).eq('bull_id', id),
    supabase.from('iatf_lot_animals').select('id', { count: 'exact', head: true }).eq('bull_id', id),
    supabase.from('genetic_materials').select('id', { count: 'exact', head: true }).eq('sire_id', id),
  ]);

  const totalRefs = (batchesCheck.count || 0) + (lotCheck.count || 0) + (geneticCheck.count || 0);

  if (totalRefs > 0) {
    return {
      success: false,
      error: `Este touro possui ${totalRefs} registro(s) vinculado(s) no sistema (estoque de sêmen ou lotes IATF). Para manter a rastreabilidade zootécnica, inative o touro em vez de excluir.`,
    };
  }

  const { error } = await supabase
    .from('bulls')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('deleteBull error:', error);
    return { success: false, error: error.message };
  }

  try {
    await offlineDb.bulls.delete(id);
  } catch {}

  invalidateCache('bulls');
  return { success: true };
}

// ------------------------------------------------------------
// CENTRAIS DE INSEMINAÇÃO / GENÉTICA
// ------------------------------------------------------------

export interface GeneticCenter {
  id: string;
  organization_id?: string;
  name: string;
  short_name?: string | null;
  document_number?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

function getOfflineGeneticCentersFromStorage(): GeneticCenter[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('iatf_offline_genetic_centers');
    return raw ? (JSON.parse(raw) as GeneticCenter[]) : [];
  } catch {
    return [];
  }
}

function saveOfflineGeneticCentersToStorage(centers: GeneticCenter[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('iatf_offline_genetic_centers', JSON.stringify(centers));
  } catch {
    // ignore storage errors
  }
}

export async function getGeneticCenters(forceRefresh = false, onlyActive = false): Promise<GeneticCenter[]> {
  const orgId = await getCurrentOrgId();
  const cacheKey = `genetic_centers_${orgId || 'all'}_${onlyActive ? 'active' : 'all'}`;

  if (!forceRefresh) {
    const cached = getCached<GeneticCenter[]>(cacheKey);
    if (cached) return cached;
  }

  const filterOfflineCenters = (): GeneticCenter[] => {
    const list = getOfflineGeneticCentersFromStorage();
    return list
      .filter((c) => (!orgId || !c.organization_id || c.organization_id === orgId) && (!onlyActive || c.active))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  };

  if (isSystemOffline()) {
    return filterOfflineCenters();
  }

  const supabase = createClient();
  let query = supabase.from('genetic_centers').select('*').order('name');

  if (orgId) {
    query = query.eq('organization_id', orgId);
  }
  if (onlyActive) {
    query = query.eq('active', true);
  }

  const { data, error } = await query;
  if (error) {
    if (isNetworkError(error)) {
      syncEngine.markOffline();
      return filterOfflineCenters();
    }
    console.error('getGeneticCenters error:', error);
    return getCached<GeneticCenter[]>(cacheKey) ?? filterOfflineCenters();
  }

  const result = (data ?? []) as GeneticCenter[];
  setCached(cacheKey, result);
  if (!onlyActive) {
    saveOfflineGeneticCentersToStorage(result);
  }
  return result;
}

export async function createGeneticCenter(center: {
  name: string;
  short_name?: string | null;
  document_number?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  active?: boolean;
}): Promise<{ success: boolean; data?: GeneticCenter; error?: string }> {
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return { success: false, error: 'Organização não identificada.' };

  const saveCenterOffline = async (): Promise<{ success: boolean; data?: GeneticCenter; error?: string }> => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'center_' + Date.now();
    const nowIso = new Date().toISOString();
    const newCenter: GeneticCenter = {
      id,
      organization_id: orgId,
      name: center.name.trim(),
      short_name: center.short_name?.trim() || null,
      document_number: center.document_number?.trim() || null,
      contact_phone: center.contact_phone?.trim() || null,
      contact_email: center.contact_email?.trim() || null,
      active: center.active !== undefined ? center.active : true,
      created_at: nowIso,
      updated_at: nowIso,
    };
    const existing = getOfflineGeneticCentersFromStorage();
    saveOfflineGeneticCentersToStorage([...existing, newCenter]);
    await syncEngine.enqueueMutation('insert', 'genetic_centers', id, undefined, { ...newCenter }, orgId);
    invalidateCache('genetic_centers');
    return { success: true, data: newCenter };
  };

  if (isSystemOffline()) {
    return saveCenterOffline();
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('genetic_centers')
    .insert({
      organization_id: orgId,
      name: center.name.trim(),
      short_name: center.short_name?.trim() || null,
      document_number: center.document_number?.trim() || null,
      contact_phone: center.contact_phone?.trim() || null,
      contact_email: center.contact_email?.trim() || null,
      active: center.active !== undefined ? center.active : true,
    })
    .select()
    .single();

  if (error) {
    if (isNetworkError(error)) {
      syncEngine.markOffline();
      return saveCenterOffline();
    }
    console.error('createGeneticCenter error:', error);
    return { success: false, error: error.message };
  }

  const existing = getOfflineGeneticCentersFromStorage();
  saveOfflineGeneticCentersToStorage([...existing.filter((c) => c.id !== data.id), data as GeneticCenter]);
  invalidateCache('genetic_centers');
  return { success: true, data: data as GeneticCenter };
}

export async function updateGeneticCenter(
  id: string,
  center: {
    name?: string;
    short_name?: string | null;
    document_number?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    active?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  const updateOffline = async (): Promise<{ success: boolean; error?: string }> => {
    const nowIso = new Date().toISOString();
    const list = getOfflineGeneticCentersFromStorage();
    const updated = list.map((c) => (c.id === id ? { ...c, ...center, updated_at: nowIso } : c));
    saveOfflineGeneticCentersToStorage(updated);
    await syncEngine.enqueueMutation('update', 'genetic_centers', id, undefined, {
      id,
      ...center,
      updated_at: nowIso,
    });
    invalidateCache('genetic_centers');
    return { success: true };
  };

  if (isSystemOffline()) {
    return updateOffline();
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('genetic_centers')
    .update({
      ...center,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    if (isNetworkError(error)) {
      syncEngine.markOffline();
      return updateOffline();
    }
    console.error('updateGeneticCenter error:', error);
    return { success: false, error: error.message };
  }

  const list = getOfflineGeneticCentersFromStorage();
  saveOfflineGeneticCentersToStorage(list.map((c) => (c.id === id ? { ...c, ...center } : c)));
  invalidateCache('genetic_centers');
  return { success: true };
}

export async function deleteGeneticCenter(id: string): Promise<{ success: boolean; error?: string }> {
  const deleteOffline = async (): Promise<{ success: boolean; error?: string }> => {
    const list = getOfflineGeneticCentersFromStorage();
    saveOfflineGeneticCentersToStorage(list.filter((c) => c.id !== id));
    await syncEngine.enqueueMutation('delete', 'genetic_centers', id);
    invalidateCache('genetic_centers');
    return { success: true };
  };

  if (isSystemOffline()) {
    return deleteOffline();
  }

  const supabase = createClient();

  // Verificar se a central possui lotes de sêmen/embrião vinculados
  const { count, error: countErr } = await supabase
    .from('genetic_material_batches')
    .select('id', { count: 'exact', head: true })
    .eq('center_id', id);

  if (isNetworkError(countErr)) {
    syncEngine.markOffline();
    return deleteOffline();
  }

  if (count && count > 0) {
    return {
      success: false,
      error: `Esta central possui ${count} partida(s) de sêmen/embrião vinculada(s). Para segurança do estoque, inative a central em vez de excluir.`,
    };
  }

  const { error } = await supabase
    .from('genetic_centers')
    .delete()
    .eq('id', id);

  if (error) {
    if (isNetworkError(error)) {
      syncEngine.markOffline();
      return deleteOffline();
    }
    console.error('deleteGeneticCenter error:', error);
    return { success: false, error: error.message };
  }

  const list = getOfflineGeneticCentersFromStorage();
  saveOfflineGeneticCentersToStorage(list.filter((c) => c.id !== id));
  invalidateCache('genetic_centers');
  return { success: true };
}

// ============================================================
// CREATE LOT
// ============================================================

async function createLotOffline(
  lot: {
    property_id: string;
    protocol_id: string;
    code: string;
    start_date: string;
    responsible_name: string;
    season_id?: string;
    notes?: string;
  },
  orgId: string
): Promise<string | null> {
  try {
    // 1. Obter fazenda e propriedade da base local
    let farmId: string | undefined = undefined;
    let propertyName: string | null = null;
    if (lot.property_id) {
      const prop = await offlineDb.properties.get(lot.property_id);
      farmId = prop?.farm_id;
      propertyName = prop?.name || null;
    }
    if (!farmId) {
      const farm = await offlineDb.farms.toCollection().first();
      farmId = farm?.id;
    }

    // 2. Obter estação de monta local
    let targetSeasonId = lot.season_id;
    if (targetSeasonId) {
      const s = await offlineDb.seasons.get(targetSeasonId);
      if (!s) targetSeasonId = undefined;
    }
    if (!targetSeasonId) {
      const activeSeason = await offlineDb.seasons
        .filter((s) => (!farmId || s.farm_id === farmId) && s.status === 'active')
        .first();
      if (activeSeason) {
        targetSeasonId = activeSeason.id;
      } else {
        const anySeason = await offlineDb.seasons.toCollection().first();
        targetSeasonId = anySeason?.id;
      }
    }

    if (!targetSeasonId) {
      const currentYear = new Date().getFullYear();
      targetSeasonId = crypto.randomUUID();
      const seasonName = `Estação ${currentYear}/${currentYear + 1}`;
      await offlineDb.seasons.put({
        id: targetSeasonId,
        farm_id: farmId,
        organization_id: orgId,
        name: seasonName,
        start_date: `${currentYear}-10-01`,
        end_date: `${currentYear + 1}-03-31`,
        status: 'active',
        updated_at: new Date().toISOString(),
      });
      await syncEngine.enqueueMutation('insert', 'reproductive_seasons', targetSeasonId, farmId, {
        id: targetSeasonId,
        organization_id: orgId,
        farm_id: farmId,
        name: seasonName,
        start_date: `${currentYear}-10-01`,
        end_date: `${currentYear + 1}-03-31`,
        status: 'active',
      }, orgId);
    }

    // 3. Obter protocolo e passos para cálculo de IA e DG
    let protocolName: string | null = null;
    let steps: { code: string; name?: string; day_offset: number }[] = [];
    if (lot.protocol_id) {
      const proto = await offlineDb.protocols.get(lot.protocol_id);
      protocolName = proto?.name || null;
      if (proto && Array.isArray((proto as Record<string, unknown>).protocol_steps)) {
        steps = (proto as Record<string, unknown>).protocol_steps as { code: string; name?: string; day_offset: number }[];
      } else if (proto && Array.isArray(proto.steps)) {
        steps = proto.steps as { code: string; name?: string; day_offset: number }[];
      }
    }

    const addDays = (n: number) => addDaysToDateString(lot.start_date, n);
    const iaStep = steps.find((s) => s.code === 'IA');
    const dgStep = steps.find((s) => s.code === 'DG');
    const iaDate = iaStep ? addDays(iaStep.day_offset) : addDays(11);
    const dgDate = dgStep ? addDays(dgStep.day_offset) : addDays(41);

    // 4. Gravar lote no IndexedDB
    const lotId = crypto.randomUUID();
    const farmRecord = farmId ? await offlineDb.farms.get(farmId) : null;
    const farmName = farmRecord?.name || null;

    const newLotRecord: import('./offline/offlineDb').OfflineLot = {
      id: lotId,
      organization_id: orgId,
      season_id: targetSeasonId,
      farm_id: farmId || '',
      property_id: lot.property_id,
      protocol_id: lot.protocol_id,
      code: lot.code.trim(),
      name: lot.code.trim(),
      start_date: lot.start_date,
      ia_planned_date: iaDate,
      dg_planned_date: dgDate,
      responsible_name: lot.responsible_name,
      status: 'planejado',
      property_name: propertyName,
      protocol_name: protocolName,
      farm_name: farmName,
      females_count: 0,
      inseminated_count: 0,
      pregnant_count: 0,
      empty_count: 0,
      pregnancy_rate: 0,
      pending_dg: 0,
      notes: lot.notes ? lot.notes.trim() : null,
      updated_at: new Date().toISOString(),
    };

    await offlineDb.lots.put(newLotRecord);

    // 5. Enfileirar mutação do lote para sincronização
    await syncEngine.enqueueMutation('insert', 'iatf_lots', lotId, farmId, {
      id: lotId,
      organization_id: orgId,
      season_id: targetSeasonId,
      farm_id: farmId,
      property_id: lot.property_id,
      protocol_id: lot.protocol_id,
      code: lot.code.trim(),
      start_date: lot.start_date,
      ia_planned_date: iaDate,
      dg_planned_date: dgDate,
      responsible_name: lot.responsible_name,
      status: 'planejado',
      notes: lot.notes ? lot.notes.trim() : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, orgId);

    // 6. Gerar e enfileirar eventos de manejo do lote
    const stepsToGenerate = steps.length > 0 ? steps : [
      { code: 'D0', name: 'D0 - Implante & Benzoato', day_offset: 0 },
      { code: 'D9', name: 'D9 - Retirada & Indutores', day_offset: 9 },
      { code: 'IA', name: 'IA - Inseminação Artificial', day_offset: 11 },
      { code: 'DG', name: 'DG - Diagnóstico de Gestação', day_offset: 41 },
    ];

    for (const step of stepsToGenerate) {
      const eventId = crypto.randomUUID();
      const plannedDate = addDays(step.day_offset);

      await offlineDb.management_events.put({
        id: eventId,
        organization_id: orgId,
        farm_id: farmId,
        lot_id: lotId,
        step_code: step.code,
        step_name: step.name ?? step.code,
        planned_date: plannedDate,
        responsible_name: lot.responsible_name,
        status: 'pendente',
        event_type: 'lote',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await syncEngine.enqueueMutation('insert', 'management_events', eventId, farmId, {
        id: eventId,
        organization_id: orgId,
        farm_id: farmId,
        lot_id: lotId,
        step_code: step.code,
        step_name: step.name ?? step.code,
        planned_date: plannedDate,
        responsible_name: lot.responsible_name,
        status: 'pendente',
        event_type: 'lote',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, orgId);
    }

    invalidateCache('lots');
    invalidateCache('events');
    invalidateCache('metrics');
    return lotId;
  } catch (e) {
    console.error('createLotOffline error:', e);
    return null;
  }
}

export async function createLot(lot: {
  property_id: string;
  protocol_id: string;
  code: string;
  start_date: string;
  responsible_name: string;
  season_id?: string;
  notes?: string;
}): Promise<string | null> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const resolvedOrg = (await getCurrentOrgId().catch(() => null))
    || storedOrgId
    || (await offlineDb.farms.toCollection().first())?.organization_id
    || (await offlineDb.lots.toCollection().first())?.organization_id
    || 'local-org';
  const orgId = String(resolvedOrg);

  if (isOffline) {
    return createLotOffline(lot, orgId);
  }

  try {
    const supabase = createClient();

    // Resolve target season: use provided season_id or find active season
    let targetSeasonId = lot.season_id;
    if (!targetSeasonId) {
      const { data: season } = await supabase
        .from('reproductive_seasons')
        .select('id')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      targetSeasonId = season?.id;
    }

    if (!targetSeasonId) {
      const { data: anySeason } = await supabase
        .from('reproductive_seasons')
        .select('id')
        .eq('organization_id', orgId)
        .limit(1)
        .maybeSingle();

      targetSeasonId = anySeason?.id;
    }

    if (!targetSeasonId) {
      const currentYear = new Date().getFullYear();
      const defaultName = `Estação ${currentYear}/${currentYear + 1}`;
      const { data: createdSeason } = await supabase
        .from('reproductive_seasons')
        .insert({
          organization_id: orgId,
          name: defaultName,
          start_date: `${currentYear}-10-01`,
          end_date: `${currentYear + 1}-03-31`,
          status: 'active',
        })
        .select('id')
        .single();

      targetSeasonId = createdSeason?.id;
    }

    // Fetch protocol steps to calculate dates
    const { data: proto } = await supabase
      .from('protocols')
      .select('protocol_steps(*)')
      .eq('id', lot.protocol_id)
      .single() as { data: { protocol_steps: { code: string; name?: string; day_offset: number }[] } | null };

    const steps = proto?.protocol_steps ?? [];
    const addDays = (n: number) => addDaysToDateString(lot.start_date, n);

    const iaStep = steps.find((s) => s.code === 'IA');
    const dgStep = steps.find((s) => s.code === 'DG');

    // Get farm_id from property
    const { data: prop } = await supabase
      .from('properties')
      .select('farm_id')
      .eq('id', lot.property_id)
      .single();

    const { data: inserted, error } = await supabase
      .from('iatf_lots')
      .insert({
        organization_id: orgId,
        season_id: targetSeasonId,
        farm_id: prop?.farm_id,
        property_id: lot.property_id,
        protocol_id: lot.protocol_id,
        code: lot.code,
        start_date: lot.start_date,
        ia_planned_date: iaStep ? addDays(iaStep.day_offset) : null,
        dg_planned_date: dgStep ? addDays(dgStep.day_offset) : null,
        responsible_name: lot.responsible_name,
        status: 'planejado',
        notes: lot.notes ? lot.notes.trim() : null,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('createLot Supabase error, falling back to offline:', error);
      syncEngine.markOffline();
      return createLotOffline(lot, orgId);
    }

    // Auto-generate management events
    for (const step of steps) {
      await supabase.from('management_events').insert({
        organization_id: orgId,
        farm_id: prop?.farm_id,
        lot_id: inserted.id,
        step_code: step.code,
        step_name: step.name ?? step.code,
        planned_date: addDays(step.day_offset),
        responsible_name: lot.responsible_name,
        status: 'pendente',
        event_type: 'lote',
      });
    }

    // Salva também no IndexedDB imediatamente para disponibilidade offline
    try {
      const protoObj = await offlineDb.protocols.get(lot.protocol_id);
      const propObj = await offlineDb.properties.get(lot.property_id);
      const farmObj = prop?.farm_id ? await offlineDb.farms.get(prop.farm_id) : null;

      await offlineDb.lots.put({
        id: inserted.id,
        organization_id: orgId,
        season_id: targetSeasonId,
        farm_id: prop?.farm_id || '',
        property_id: lot.property_id,
        protocol_id: lot.protocol_id,
        code: lot.code.trim(),
        name: lot.code.trim(),
        start_date: lot.start_date,
        ia_planned_date: iaStep ? addDays(iaStep.day_offset) : undefined,
        dg_planned_date: dgStep ? addDays(dgStep.day_offset) : undefined,
        responsible_name: lot.responsible_name,
        status: 'planejado',
        property_name: propObj?.name || null,
        protocol_name: protoObj?.name || null,
        farm_name: farmObj?.name || null,
        females_count: 0,
        inseminated_count: 0,
        pregnant_count: 0,
        notes: lot.notes ? lot.notes.trim() : undefined,
        empty_count: 0,
        pregnancy_rate: 0,
        pending_dg: 0,
        updated_at: new Date().toISOString(),
      });

      for (const step of steps) {
        await offlineDb.management_events.put({
          id: crypto.randomUUID(),
          organization_id: orgId,
          farm_id: prop?.farm_id,
          lot_id: inserted.id,
          step_code: step.code,
          step_name: step.name ?? step.code,
          planned_date: addDays(step.day_offset),
          responsible_name: lot.responsible_name,
          status: 'pendente',
          event_type: 'lote',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn('Aviso ao cachear novo lote no IndexedDB:', err);
    }

    invalidateCache('lots');
    invalidateCache('events');
    invalidateCache('metrics');
    return inserted.id;
  } catch (err) {
    console.warn('createLot exception, falling back to offline:', err);
    syncEngine.markOffline();
    return createLotOffline(lot, orgId);
  }
}

// ============================================================
// CREATE RESYNC LOT (RESSINCRONIZAÇÃO DE VAZIAS - 2ª IATF)
// ============================================================

export async function createResyncLot(params: {
  parentLotId: string;
  code: string;
  property_id: string;
  protocol_id: string;
  start_date: string;
  responsible_name: string;
  season_id?: string;
  notes?: string;
  animalIds: string[];
}): Promise<{ success: boolean; lotId?: string; count?: number; error?: string }> {
  try {
    if (!params.animalIds.length) {
      return { success: false, error: 'Nenhuma matriz vazia informada para ressincronizar.' };
    }

    const lotId = await createLot({
      code: params.code.trim(),
      property_id: params.property_id,
      protocol_id: params.protocol_id,
      start_date: params.start_date,
      responsible_name: params.responsible_name,
      season_id: params.season_id,
      notes: params.notes || `Ressincronização (2ª IATF) gerada a partir do lote anterior.`,
    });

    if (!lotId) {
      return { success: false, error: 'Não foi possível gerar o novo lote da 2ª IATF.' };
    }

    const addRes = await addAnimalsToLot(lotId, params.animalIds);
    if (!addRes.success) {
      return {
        success: false,
        lotId,
        error: addRes.error || 'Lote criado, mas ocorreu um erro ao vincular as matrizes.',
      };
    }

    return {
      success: true,
      lotId,
      count: addRes.count,
    };
  } catch (err) {
    console.error('createResyncLot error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================
// UPDATE LOT CODE
// ============================================================

export async function updateLotCode(
  lotId: string,
  newCode: string
): Promise<{ success: boolean; error?: string }> {
  const cleanCode = newCode.trim();
  if (!cleanCode) {
    return { success: false, error: 'O nome do lote não pode ser vazio.' };
  }

  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const lot = await offlineDb.lots.get(lotId);
      if (lot) {
        await offlineDb.lots.update(lotId, {
          code: cleanCode,
          name: cleanCode,
          updated_at: new Date().toISOString(),
        });
        await syncEngine.enqueueMutation('update', 'iatf_lots', lotId, lot.farm_id, {
          code: cleanCode,
          updated_at: new Date().toISOString(),
        });
      }
      invalidateCache('lots');
      invalidateCache('events');
      invalidateCache('metrics');
      return { success: true };
    } catch (e: unknown) {
      console.error('updateLotCode offline error:', e);
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('iatf_lots')
    .update({
      code: cleanCode,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lotId);

  if (error) {
    console.error('updateLotCode error:', error);
    return { success: false, error: error.message };
  }

  offlineDb.lots.update(lotId, {
    code: cleanCode,
    name: cleanCode,
    updated_at: new Date().toISOString(),
  }).catch(() => {});

  invalidateCache('lots');
  invalidateCache('events');
  invalidateCache('metrics');
  return { success: true };
}

export async function updateLotNotes(
  lotId: string,
  newNotes: string
): Promise<{ success: boolean; error?: string }> {
  const cleanNotes = newNotes.trim() || null;

  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const lot = await offlineDb.lots.get(lotId);
      if (lot) {
        await offlineDb.lots.update(lotId, {
          notes: cleanNotes,
          updated_at: new Date().toISOString(),
        });
        await syncEngine.enqueueMutation('update', 'iatf_lots', lotId, lot.farm_id, {
          notes: cleanNotes,
          updated_at: new Date().toISOString(),
        });
      }
      invalidateCache('lots');
      return { success: true };
    } catch (e: unknown) {
      console.error('updateLotNotes offline error:', e);
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('iatf_lots')
    .update({
      notes: cleanNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lotId);

  if (error) {
    console.error('updateLotNotes error:', error);
    return { success: false, error: error.message };
  }

  offlineDb.lots.update(lotId, {
    notes: cleanNotes,
    updated_at: new Date().toISOString(),
  }).catch(() => {});

  invalidateCache('lots');
  return { success: true };
}

// ============================================================
// UPDATE LOT PROTOCOL & RECALCULATE DATES / EVENTS
// ============================================================

export async function updateLotProtocol(params: {
  lotId: string;
  protocolId: string;
  startDate?: string;
  responsibleName?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { lotId, protocolId } = params;
  if (!lotId || !protocolId) {
    return { success: false, error: 'Lote e protocolo são obrigatórios.' };
  }

  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const resolvedOrg = (await getCurrentOrgId().catch(() => null))
    || storedOrgId
    || (await offlineDb.farms.toCollection().first())?.organization_id
    || (await offlineDb.lots.toCollection().first())?.organization_id
    || 'local-org';
  const orgId = String(resolvedOrg);

  if (isOffline) {
    try {
      const lot = await offlineDb.lots.get(lotId);
      if (!lot) return { success: false, error: 'Lote não encontrado no banco local.' };

      // Verificar se há eventos concluídos
      const completed = await offlineDb.management_events
        .where('lot_id')
        .equals(lotId)
        .filter((e) => e.status === 'concluido')
        .toArray();

      if (completed.length > 0) {
        return {
          success: false,
          error: 'Este lote já possui manejos concluídos no curral. Por integridade do histórico sanitário e zootécnico, o protocolo não pode ser alterado.',
        };
      }

      // Buscar protocolo e passos
      const proto = await offlineDb.protocols.get(protocolId);
      if (!proto) return { success: false, error: 'Protocolo não encontrado.' };

      let steps: { code: string; name?: string; day_offset: number }[] = [];
      if (Array.isArray((proto as Record<string, unknown>).protocol_steps)) {
        steps = (proto as Record<string, unknown>).protocol_steps as { code: string; name?: string; day_offset: number }[];
      } else if (Array.isArray(proto.steps)) {
        steps = proto.steps as { code: string; name?: string; day_offset: number }[];
      }

      const startDate = params.startDate?.trim() || (lot.start_date as string) || getTodayDateString();
      const addDays = (n: number) => addDaysToDateString(startDate, n);

      const iaStep = steps.find((s) => s.code === 'IA');
      const dgStep = steps.find((s) => s.code === 'DG');
      const iaDate = iaStep ? addDays(iaStep.day_offset) : addDays(11);
      const dgDate = dgStep ? addDays(dgStep.day_offset) : addDays(41);
      const responsible = params.responsibleName?.trim() || (lot.responsible_name as string) || null;

      // 1. Atualizar registro do lote no IndexedDB
      await offlineDb.lots.update(lotId, {
        protocol_id: protocolId,
        protocol_name: proto.name,
        start_date: startDate,
        ia_planned_date: iaDate,
        dg_planned_date: dgDate,
        responsible_name: responsible,
        updated_at: new Date().toISOString(),
      });

      // 2. Remover eventos pendentes antigos do IndexedDB e enfileirar deleção
      const oldPending = await offlineDb.management_events
        .where('lot_id')
        .equals(lotId)
        .filter((e) => e.status === 'pendente')
        .toArray();

      for (const ev of oldPending) {
        await offlineDb.management_events.delete(ev.id);
        await syncEngine.enqueueMutation('delete', 'management_events', ev.id, lot.farm_id, { id: ev.id }, orgId);
      }

      // 3. Inserir novos eventos de manejo
      const stepsToGenerate = steps.length > 0 ? steps : [
        { code: 'D0', name: 'D0 - Implante & Benzoato', day_offset: 0 },
        { code: 'D9', name: 'D9 - Retirada & Indutores', day_offset: 9 },
        { code: 'IA', name: 'IA - Inseminação Artificial', day_offset: 11 },
        { code: 'DG', name: 'DG - Diagnóstico de Gestação', day_offset: 41 },
      ];

      for (const step of stepsToGenerate) {
        const eventId = crypto.randomUUID();
        const plannedDate = addDays(step.day_offset);

        await offlineDb.management_events.put({
          id: eventId,
          organization_id: orgId,
          farm_id: lot.farm_id,
          lot_id: lotId,
          step_code: step.code,
          step_name: step.name ?? step.code,
          planned_date: plannedDate,
          responsible_name: responsible,
          status: 'pendente',
          event_type: 'lote',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        await syncEngine.enqueueMutation('insert', 'management_events', eventId, lot.farm_id, {
          id: eventId,
          organization_id: orgId,
          farm_id: lot.farm_id,
          lot_id: lotId,
          step_code: step.code,
          step_name: step.name ?? step.code,
          planned_date: plannedDate,
          responsible_name: responsible,
          status: 'pendente',
          event_type: 'lote',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, orgId);
      }

      // Enfileirar mutação de atualização do lote
      await syncEngine.enqueueMutation('update', 'iatf_lots', lotId, lot.farm_id, {
        protocol_id: protocolId,
        start_date: startDate,
        ia_planned_date: iaDate,
        dg_planned_date: dgDate,
        responsible_name: responsible,
        updated_at: new Date().toISOString(),
      }, orgId);

      invalidateCache('lots');
      invalidateCache('events');
      invalidateCache('metrics');
      return { success: true };
    } catch (e: unknown) {
      console.error('updateLotProtocol offline error:', e);
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // ONLINE SUPABASE
  try {
    const supabase = createClient();

    // 1. Verificar se há eventos concluídos para este lote
    const { data: completedEvents, error: compErr } = await supabase
      .from('management_events')
      .select('id, step_code')
      .eq('lot_id', lotId)
      .eq('status', 'concluido');

    if (!compErr && completedEvents && completedEvents.length > 0) {
      return {
        success: false,
        error: 'Este lote já possui manejos concluídos no curral. Não é permitido alterar o protocolo para não corromper o histórico sanitário.',
      };
    }

    // 2. Buscar lote atual para obter dados como start_date, farm_id
    const { data: currentLot, error: lotFetchErr } = await supabase
      .from('iatf_lots')
      .select('id, farm_id, start_date, responsible_name')
      .eq('id', lotId)
      .single();

    if (lotFetchErr || !currentLot) {
      return { success: false, error: 'Lote não encontrado no banco de dados.' };
    }

    // 3. Buscar novo protocolo e seus passos
    const { data: proto, error: protoErr } = await supabase
      .from('protocols')
      .select('name, protocol_steps(*)')
      .eq('id', protocolId)
      .single() as { data: { name: string; protocol_steps: { code: string; name?: string; day_offset: number }[] } | null; error: unknown };

    if (protoErr || !proto) {
      return { success: false, error: 'Protocolo hormonal não encontrado.' };
    }

    const steps = proto.protocol_steps ?? [];
    const startDate = params.startDate?.trim() || currentLot.start_date || getTodayDateString();
    const addDays = (n: number) => addDaysToDateString(startDate, n);

    const iaStep = steps.find((s) => s.code === 'IA');
    const dgStep = steps.find((s) => s.code === 'DG');
    const iaDate = iaStep ? addDays(iaStep.day_offset) : addDays(11);
    const dgDate = dgStep ? addDays(dgStep.day_offset) : addDays(41);
    const responsible = params.responsibleName?.trim() || currentLot.responsible_name;

    // 4. Atualizar iatf_lots
    const { error: updateLotErr } = await supabase
      .from('iatf_lots')
      .update({
        protocol_id: protocolId,
        start_date: startDate,
        ia_planned_date: iaDate,
        dg_planned_date: dgDate,
        responsible_name: responsible,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lotId);

    if (updateLotErr) {
      console.error('updateLotProtocol error updating iatf_lots:', updateLotErr);
      return { success: false, error: updateLotErr.message };
    }

    // 5. Deletar eventos pendentes antigos da agenda
    await supabase
      .from('management_events')
      .delete()
      .eq('lot_id', lotId)
      .eq('status', 'pendente');

    // 6. Inserir novos eventos de manejo para cada etapa do protocolo
    const stepsToGenerate = steps.length > 0 ? steps : [
      { code: 'D0', name: 'D0 - Implante & Benzoato', day_offset: 0 },
      { code: 'D9', name: 'D9 - Retirada & Indutores', day_offset: 9 },
      { code: 'IA', name: 'IA - Inseminação Artificial', day_offset: 11 },
      { code: 'DG', name: 'DG - Diagnóstico de Gestação', day_offset: 41 },
    ];

    for (const step of stepsToGenerate) {
      await supabase.from('management_events').insert({
        organization_id: orgId,
        farm_id: currentLot.farm_id,
        lot_id: lotId,
        step_code: step.code,
        step_name: step.name || step.code,
        planned_date: addDays(step.day_offset),
        responsible_name: responsible,
        status: 'pendente',
        event_type: 'lote',
      });
    }

    // 7. Sincronizar com base local Dexie/IndexedDB imediatamente
    try {
      await offlineDb.lots.update(lotId, {
        protocol_id: protocolId,
        protocol_name: proto.name,
        start_date: startDate,
        ia_planned_date: iaDate,
        dg_planned_date: dgDate,
        responsible_name: responsible,
        updated_at: new Date().toISOString(),
      });

      const oldPending = await offlineDb.management_events
        .where('lot_id')
        .equals(lotId)
        .filter((e) => e.status === 'pendente')
        .toArray();
      for (const ev of oldPending) {
        await offlineDb.management_events.delete(ev.id);
      }

      for (const step of stepsToGenerate) {
        await offlineDb.management_events.put({
          id: crypto.randomUUID(),
          organization_id: orgId,
          farm_id: currentLot.farm_id,
          lot_id: lotId,
          step_code: step.code,
          step_name: step.name || step.code,
          planned_date: addDays(step.day_offset),
          responsible_name: responsible,
          status: 'pendente',
          event_type: 'lote',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('Erro ao atualizar base offline após updateLotProtocol:', e);
    }

    invalidateCache('lots');
    invalidateCache('events');
    invalidateCache('metrics');
    return { success: true };
  } catch (err: unknown) {
    console.error('updateLotProtocol exception:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ============================================================
// DELETE LOT
// ============================================================

export async function deleteLot(
  lotId: string
): Promise<{ success: boolean; error?: string }> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const lot = await offlineDb.lots.get(lotId);
      if (lot) {
        await offlineDb.lot_animals.where('lot_id').equals(lotId).delete();
        await offlineDb.management_events.where('lot_id').equals(lotId).delete();
        await offlineDb.lots.delete(lotId);
        await syncEngine.enqueueMutation('delete', 'iatf_lots', lotId, lot.farm_id, {
          id: lotId,
        });
      }
      invalidateCache('lots');
      invalidateCache('lot_animals');
      invalidateCache('events');
      invalidateCache('metrics');
      return { success: true };
    } catch (e: unknown) {
      console.error('deleteLot offline error:', e);
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const supabase = createClient();

  try {
    // 1. Remover perdas de insumos associadas ao lote (se houver)
    try {
      await supabase.from('input_losses').delete().eq('lot_id', lotId);
    } catch {
      // Ignora se tabela ou coluna não existir
    }

    // 2. Remover eventos de manejo vinculados ao lote
    const { error: eventsErr } = await supabase
      .from('management_events')
      .delete()
      .eq('lot_id', lotId);

    if (eventsErr) {
      console.error('deleteLot: erro ao remover eventos:', eventsErr);
      return { success: false, error: 'Falha ao remover eventos da agenda: ' + eventsErr.message };
    }

    // 3. Desvincular matrizes do lote (iatf_lot_animals)
    const { error: animalsErr } = await supabase
      .from('iatf_lot_animals')
      .delete()
      .eq('lot_id', lotId);

    if (animalsErr) {
      console.error('deleteLot: erro ao desvincular matrizes:', animalsErr);
      return { success: false, error: 'Falha ao desvincular matrizes: ' + animalsErr.message };
    }

    // 4. Remover o lote
    const { error: lotErr } = await supabase
      .from('iatf_lots')
      .delete()
      .eq('id', lotId);

    if (lotErr) {
      console.error('deleteLot: erro ao remover lote:', lotErr);
      return { success: false, error: 'Falha ao excluir lote: ' + lotErr.message };
    }

    // Também remove do banco offline local
    offlineDb.lot_animals.where('lot_id').equals(lotId).delete().catch(() => {});
    offlineDb.management_events.where('lot_id').equals(lotId).delete().catch(() => {});
    offlineDb.lots.delete(lotId).catch(() => {});

    // 5. Invalidar caches
    invalidateCache('lots');
    invalidateCache('lot_animals');
    invalidateCache('events');
    invalidateCache('metrics');

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao excluir o lote.';
    console.error('deleteLot unexpected error:', err);
    return { success: false, error: message };
  }
}

// ============================================================
// FARMS & PROPERTIES
// ============================================================

export interface Farm {
  id: string;
  name: string;
  owner_name: string | null;
  technical_responsible: string | null;
  city: string | null;
  state: string | null;
  status?: 'active' | 'frozen';
  properties?: Property[];
}

export async function getFarms(forceRefresh = false, includeFrozen = false): Promise<Farm[]> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const offlineFarms = await offlineDb.farms.toArray();
      return offlineFarms
        .filter((f) => includeFrozen || (f as { status?: string }).status !== 'frozen')
        .map((f) => ({
          id: f.id,
          name: f.name,
          owner_name: (f.owner_name as string) || null,
          technical_responsible: (f.technical_responsible as string) || null,
          city: (f.city as string) || null,
          state: (f.state as string) || null,
          status: ((f as { status?: string }).status as 'active' | 'frozen') || 'active',
          properties: [],
        }));
    } catch (e) {
      console.warn('Falha ao carregar fazendas offline:', e);
      return cachedFarms ?? [];
    }
  }

  const now = Date.now();
  if (!forceRefresh && cachedFarms && !includeFrozen && now - cachedFarmsTimestamp < CACHE_TTL_MS) {
    return cachedFarms;
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) {
    try {
      const offlineFarms = await offlineDb.farms.toArray();
      if (offlineFarms.length > 0) {
        return offlineFarms
          .filter((f) => includeFrozen || (f as { status?: string }).status !== 'frozen')
          .map((f) => ({
            id: f.id,
            name: f.name,
            owner_name: (f.owner_name as string) || null,
            technical_responsible: (f.technical_responsible as string) || null,
            city: (f.city as string) || null,
            state: (f.state as string) || null,
            status: ((f as { status?: string }).status as 'active' | 'frozen') || 'active',
            properties: [],
          }));
      }
    } catch {
      // ignore
    }
    return cachedFarms ?? [];
  }

  const supabase = createClient();
  let query = supabase
    .from('farms')
    .select('*, properties(*)')
    .eq('organization_id', orgId);

  if (!includeFrozen) {
    query = query.neq('status', 'frozen');
  }

  const { data, error } = await query.order('name');

  if (error) {
    console.error('getFarms error:', error);
    try {
      const offlineFarms = await offlineDb.farms.toArray();
      if (offlineFarms.length > 0) {
        return offlineFarms
          .filter((f) => includeFrozen || (f as { status?: string }).status !== 'frozen')
          .map((f) => ({
            id: f.id,
            name: f.name,
            owner_name: (f.owner_name as string) || null,
            technical_responsible: (f.technical_responsible as string) || null,
            city: (f.city as string) || null,
            state: (f.state as string) || null,
            status: ((f as { status?: string }).status as 'active' | 'frozen') || 'active',
            properties: [],
          }));
      }
    } catch {
      // ignore
    }
    return cachedFarms ?? [];
  }

  const farmsList = (data ?? []) as Farm[];
  if (!includeFrozen) {
    cachedFarms = farmsList;
    cachedFarmsTimestamp = now;
  }

  if (farmsList.length > 0) {
    try {
      await offlineDb.farms.bulkPut(
        farmsList.map((f) => ({
          id: f.id,
          organization_id: orgId,
          name: f.name,
          owner_name: f.owner_name,
          technical_responsible: f.technical_responsible,
          city: f.city,
          state: f.state,
          status: f.status,
          properties: f.properties || [],
          updated_at: new Date().toISOString(),
        } as import('./offline/offlineDb').OfflineFarm))
      );
    } catch (e) {
      console.warn('Erro ao salvar fazendas no IndexedDB:', e);
    }
  }

  return farmsList;
}

export async function freezeFarm(farmId: string): Promise<boolean> {
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return false;

  const freezeOffline = async (): Promise<boolean> => {
    try {
      await offlineDb.farms.update(farmId, { status: 'frozen', updated_at: new Date().toISOString() });
      await syncEngine.enqueueMutation('update', 'farms', farmId, farmId, {
        id: farmId,
        status: 'frozen',
        updated_at: new Date().toISOString(),
      }, orgId);
      cachedFarms = null;
      return true;
    } catch {
      return false;
    }
  };

  if (isSystemOffline()) {
    return freezeOffline();
  }

  const supabase = createClient();
  const { error } = await supabase.rpc('freeze_farm', { p_farm_id: farmId, p_org_id: orgId });
  if (error) {
    if (isNetworkError(error)) {
      syncEngine.markOffline();
      return freezeOffline();
    }
    console.error('freezeFarm rpc error, attempting direct update:', error);
    const { error: err2 } = await supabase
      .from('farms')
      .update({ status: 'frozen' })
      .eq('id', farmId)
      .eq('organization_id', orgId);
    if (err2) {
      if (isNetworkError(err2)) {
        syncEngine.markOffline();
        return freezeOffline();
      }
      console.error('freezeFarm direct update error:', err2);
      return false;
    }
  }
  try {
    await offlineDb.farms.update(farmId, { status: 'frozen', updated_at: new Date().toISOString() });
  } catch {}
  cachedFarms = null;
  return true;
}

export async function unfreezeFarm(farmId: string): Promise<boolean> {
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return false;

  const unfreezeOffline = async (): Promise<boolean> => {
    try {
      await offlineDb.farms.update(farmId, { status: 'active', updated_at: new Date().toISOString() });
      await syncEngine.enqueueMutation('update', 'farms', farmId, farmId, {
        id: farmId,
        status: 'active',
        updated_at: new Date().toISOString(),
      }, orgId);
      cachedFarms = null;
      return true;
    } catch {
      return false;
    }
  };

  if (isSystemOffline()) {
    return unfreezeOffline();
  }

  const supabase = createClient();
  const { error } = await supabase.rpc('unfreeze_farm', { p_farm_id: farmId, p_org_id: orgId });
  if (error) {
    if (isNetworkError(error)) {
      syncEngine.markOffline();
      return unfreezeOffline();
    }
    console.error('unfreezeFarm rpc error, attempting direct update:', error);
    const { error: err2 } = await supabase
      .from('farms')
      .update({ status: 'active' })
      .eq('id', farmId)
      .eq('organization_id', orgId);
    if (err2) {
      if (isNetworkError(err2)) {
        syncEngine.markOffline();
        return unfreezeOffline();
      }
      console.error('unfreezeFarm direct update error:', err2);
      return false;
    }
  }
  try {
    await offlineDb.farms.update(farmId, { status: 'active', updated_at: new Date().toISOString() });
  } catch {}
  cachedFarms = null;
  return true;
}

export async function createFarm(farm: {
  name: string;
  owner_name?: string;
  technical_responsible?: string;
  city?: string;
  state?: string;
}): Promise<string | null> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return null;

  const newId = crypto.randomUUID();
  const farmRecord: import('./offline/offlineDb').OfflineFarm = {
    id: newId,
    organization_id: orgId,
    name: farm.name.trim(),
    owner_name: farm.owner_name?.trim() || null,
    technical_responsible: farm.technical_responsible?.trim() || null,
    city: farm.city?.trim() || null,
    state: farm.state?.trim() ? farm.state.trim().toUpperCase() : null,
    status: 'active',
    properties: [],
    updated_at: new Date().toISOString(),
  };

  if (isOffline) {
    try {
      await offlineDb.farms.put(farmRecord);
      await syncEngine.enqueueMutation('insert', 'farms', newId, newId, {
        id: newId,
        organization_id: orgId,
        name: farm.name.trim(),
        owner_name: farm.owner_name?.trim() || null,
        technical_responsible: farm.technical_responsible?.trim() || null,
        city: farm.city?.trim() || null,
        state: farm.state?.trim() ? farm.state.trim().toUpperCase() : null,
        status: 'active',
      }, orgId);
      clearFarmsCache();
      return newId;
    } catch (e) {
      console.error('createFarm offline error:', e);
      return null;
    }
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('farms')
    .insert({
      id: newId,
      ...farm,
      organization_id: orgId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('createFarm error:', error);
    return null;
  }

  try {
    await offlineDb.farms.put(farmRecord);
  } catch {}

  clearFarmsCache();
  return data?.id ?? newId;
}

export async function updateFarm(
  id: string,
  farm: {
    name: string;
    owner_name?: string | null;
    technical_responsible?: string | null;
    city?: string | null;
    state?: string | null;
  }
): Promise<boolean> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return false;

  const farmUpdates = {
    name: farm.name.trim(),
    owner_name: farm.owner_name?.trim() || null,
    technical_responsible: farm.technical_responsible?.trim() || null,
    city: farm.city?.trim() || null,
    state: farm.state?.trim() ? farm.state.trim().toUpperCase() : null,
    updated_at: new Date().toISOString(),
  };

  if (isOffline) {
    try {
      const existing = await offlineDb.farms.get(id);
      if (existing) {
        await offlineDb.farms.update(id, farmUpdates);
      }
      await syncEngine.enqueueMutation('update', 'farms', id, id, {
        id,
        ...farmUpdates,
      }, orgId);
      clearFarmsCache();
      return true;
    } catch (e) {
      console.error('updateFarm offline error:', e);
      return false;
    }
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('farms')
    .update(farmUpdates)
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    console.error('updateFarm error:', error);
    return false;
  }

  try {
    const existing = await offlineDb.farms.get(id);
    if (existing) {
      await offlineDb.farms.update(id, farmUpdates);
    }
  } catch (err) {
    console.warn('Offline farm update warning:', err);
  }

  clearFarmsCache();
  return true;
}

export async function deleteFarm(id: string): Promise<{ success: boolean; error?: string }> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return { success: false, error: 'Sessão inválida' };

  if (isOffline) {
    try {
      await offlineDb.farms.delete(id);
      await syncEngine.enqueueMutation('delete', 'farms', id, id, { id }, orgId);
      clearFarmsCache();
      return { success: true };
    } catch (e) {
      console.error('deleteFarm offline error:', e);
      return { success: false, error: 'Erro offline ao excluir fazenda.' };
    }
  }

  const supabase = createClient();

  // 1. Verificar se existem lotes vinculados à fazenda
  const { count: lotsCount } = await supabase
    .from('iatf_lots')
    .select('id', { count: 'exact', head: true })
    .eq('farm_id', id);

  if (lotsCount && lotsCount > 0) {
    return {
      success: false,
      error: `Não é possível excluir esta fazenda pois existem ${lotsCount} lote(s) de IATF vinculados a ela. Você pode congelá-la para desativar sem perder os dados.`,
    };
  }

  // 2. Verificar se existem animais vinculados à fazenda
  const { count: animalsCount } = await supabase
    .from('animals')
    .select('id', { count: 'exact', head: true })
    .eq('farm_id', id);

  if (animalsCount && animalsCount > 0) {
    return {
      success: false,
      error: `Não é possível excluir esta fazenda pois existem ${animalsCount} animal(is) vinculados a ela. Você pode congelá-la para desativar com segurança.`,
    };
  }

  // 3. Excluir a fazenda
  const { error } = await supabase
    .from('farms')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    console.error('deleteFarm error:', error);
    return { success: false, error: 'Erro ao excluir a fazenda no banco de dados.' };
  }

  try {
    await offlineDb.farms.delete(id);
  } catch (e) {
    console.warn('Offline farm delete warning:', e);
  }

  clearFarmsCache();
  return { success: true };
}

export interface Property {
  id: string;
  name: string;
  code: string | null;
  farm_id: string;
}

export async function getProperties(forceRefresh = false, farmId?: string): Promise<Property[]> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      let local = await offlineDb.properties.toArray();
      if (farmId && farmId !== 'all') {
        local = local.filter((p) => p.farm_id === farmId);
      }
      return local.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code || null,
        farm_id: p.farm_id,
      }));
    } catch (e) {
      console.warn('Erro ao carregar propriedades offline:', e);
      return [];
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const cacheKey = `properties_${orgId}_${farmId || 'all'}`;
  if (!forceRefresh) {
    const cached = getCached<Property[]>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  let query = supabase
    .from('properties')
    .select('*')
    .eq('organization_id', orgId);

  if (farmId && farmId !== 'all') {
    query = query.eq('farm_id', farmId);
  }

  const { data, error } = await query.order('name');

  if (error) {
    console.error('getProperties error:', error);
    try {
      let local = await offlineDb.properties.toArray();
      if (farmId && farmId !== 'all') {
        local = local.filter((p) => p.farm_id === farmId);
      }
      return local.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code || null,
        farm_id: p.farm_id,
      }));
    } catch {}
    return getCached<Property[]>(cacheKey) ?? [];
  }
  const result = (data ?? []) as Property[];
  setCached(cacheKey, result);

  if (data && data.length > 0) {
    offlineDb.properties.bulkPut(
      data.map((p) => ({
        id: p.id,
        farm_id: p.farm_id,
        name: p.name,
        code: p.code || null,
        organization_id: p.organization_id || orgId,
        updated_at: new Date().toISOString(),
      }))
    ).catch(() => {});
  }

  return result;
}

export async function createProperty(prop: {
  farm_id: string;
  name: string;
  code?: string;
}): Promise<boolean> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
      const orgId = (await getCurrentOrgId()) || storedOrgId || '';
      const newId = crypto.randomUUID();
      await offlineDb.properties.put({
        id: newId,
        farm_id: prop.farm_id,
        name: prop.name.trim(),
        code: prop.code?.trim() || null,
        organization_id: orgId,
        updated_at: new Date().toISOString(),
      });
      await syncEngine.enqueueMutation('insert', 'properties', newId, prop.farm_id, {
        id: newId,
        farm_id: prop.farm_id,
        name: prop.name.trim(),
        code: prop.code?.trim() || null,
        organization_id: orgId,
      }, orgId);
      invalidateCache('properties');
      clearFarmsCache();
      return true;
    } catch (e) {
      console.error('createProperty offline error:', e);
      return false;
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return false;

  const supabase = createClient();
  const { error } = await supabase.from('properties').insert({
    ...prop,
    organization_id: orgId,
  });
  if (error) {
    console.error('createProperty error:', error);
    return false;
  }

  invalidateCache('properties');
  clearFarmsCache();
  return true;
}

export async function updateProperty(
  id: string,
  prop: {
    name: string;
    code?: string | null;
  }
): Promise<boolean> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return false;

  const propUpdates = {
    name: prop.name.trim(),
    code: prop.code?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (isOffline) {
    try {
      const existing = await offlineDb.properties.get(id);
      if (existing) {
        await offlineDb.properties.update(id, propUpdates);
      }
      await syncEngine.enqueueMutation('update', 'properties', id, existing?.farm_id, {
        id,
        ...propUpdates,
      }, orgId);
      invalidateCache('properties');
      clearFarmsCache();
      return true;
    } catch (e) {
      console.error('updateProperty offline error:', e);
      return false;
    }
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('properties')
    .update(propUpdates)
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    console.error('updateProperty error:', error);
    return false;
  }

  try {
    const existing = await offlineDb.properties.get(id);
    if (existing) {
      await offlineDb.properties.update(id, propUpdates);
    }
  } catch {}

  invalidateCache('properties');
  clearFarmsCache();
  return true;
}

export async function deleteProperty(id: string): Promise<{ success: boolean; error?: string }> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return { success: false, error: 'Sessão inválida' };

  if (isOffline) {
    try {
      const existing = await offlineDb.properties.get(id);
      await offlineDb.properties.delete(id);
      await syncEngine.enqueueMutation('delete', 'properties', id, existing?.farm_id, { id }, orgId);
      invalidateCache('properties');
      clearFarmsCache();
      return { success: true };
    } catch (e) {
      console.error('deleteProperty offline error:', e);
      return { success: false, error: 'Erro offline ao excluir retiro.' };
    }
  }

  const supabase = createClient();

  // Verificar se há animais vinculados a este retiro
  const { count: animalsCount } = await supabase
    .from('animals')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', id);

  if (animalsCount && animalsCount > 0) {
    return {
      success: false,
      error: `Não é possível excluir este retiro pois existem ${animalsCount} animal(is) alocados nele.`,
    };
  }

  const { error } = await supabase
    .from('properties')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    console.error('deleteProperty error:', error);
    return { success: false, error: 'Erro ao excluir retiro no banco de dados.' };
  }

  try {
    await offlineDb.properties.delete(id);
  } catch {}

  invalidateCache('properties');
  clearFarmsCache();
  return { success: true };
}

// ============================================================
// BREEDS & CATEGORIES
// ============================================================

export interface Breed {
  id: string;
  name: string;
}

export async function getBreeds(forceRefresh = false): Promise<Breed[]> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const local = await offlineDb.breeds.toArray();
      if (local && local.length > 0) {
        return local.map((b) => ({ id: b.id, name: b.name }));
      }
    } catch (e) {
      console.warn('Erro ao carregar raças offline do banco local:', e);
    }
    return DEFAULT_BREEDS;
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) {
    try {
      const local = await offlineDb.breeds.toArray();
      if (local && local.length > 0) return local.map((b) => ({ id: b.id, name: b.name }));
    } catch {}
    return DEFAULT_BREEDS;
  }

  const cacheKey = `breeds_${orgId}`;
  if (!forceRefresh) {
    const cached = getCached<Breed[]>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('breeds')
    .select('*')
    .eq('organization_id', orgId)
    .order('name');

  if (error) {
    console.error('getBreeds error:', error);
    try {
      const local = await offlineDb.breeds.toArray();
      if (local && local.length > 0) return local.map((b) => ({ id: b.id, name: b.name }));
    } catch {}
    return getCached<Breed[]>(cacheKey) ?? DEFAULT_BREEDS;
  }

  const result = (data && data.length > 0 ? data : DEFAULT_BREEDS) as Breed[];
  setCached(cacheKey, result);

  if (data && data.length > 0) {
    offlineDb.breeds.bulkPut(
      data.map((b) => ({
        id: b.id,
        name: b.name,
        organization_id: b.organization_id || orgId,
        updated_at: new Date().toISOString(),
      }))
    ).catch(() => {});
  }

  return result;
}

export async function createBreed(name: string): Promise<boolean> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
      const orgId = (await getCurrentOrgId()) || storedOrgId || '';
      const newId = crypto.randomUUID();
      await offlineDb.breeds.put({
        id: newId,
        name: name.trim(),
        organization_id: orgId,
        updated_at: new Date().toISOString(),
      });
      await syncEngine.enqueueMutation('insert', 'breeds', newId, undefined, {
        id: newId,
        name: name.trim(),
        organization_id: orgId,
      }, orgId);
      invalidateCache('breeds');
      return true;
    } catch (e) {
      console.error('createBreed offline error:', e);
      return false;
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return false;

  const supabase = createClient();
  const { error } = await supabase.from('breeds').insert({
    name,
    organization_id: orgId,
  });
  if (error) {
    console.error('createBreed error:', error);
    return false;
  }

  invalidateCache('breeds');
  return true;
}

export interface AnimalCategory {
  id: string;
  name: string;
}

export async function getAnimalCategories(forceRefresh = false): Promise<AnimalCategory[]> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const local = await offlineDb.categories.toArray();
      if (local && local.length > 0) {
        return local.map((c) => ({ id: c.id, name: c.name }));
      }
    } catch (e) {
      console.warn('Erro ao carregar categorias offline do banco local:', e);
    }
    return DEFAULT_CATEGORIES;
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) {
    try {
      const local = await offlineDb.categories.toArray();
      if (local && local.length > 0) return local.map((c) => ({ id: c.id, name: c.name }));
    } catch {}
    return DEFAULT_CATEGORIES;
  }

  const cacheKey = `categories_${orgId}`;
  if (!forceRefresh) {
    const cached = getCached<AnimalCategory[]>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('animal_categories')
    .select('*')
    .eq('organization_id', orgId)
    .order('name');

  if (error) {
    console.error('getAnimalCategories error:', error);
    try {
      const local = await offlineDb.categories.toArray();
      if (local && local.length > 0) return local.map((c) => ({ id: c.id, name: c.name }));
    } catch {}
    return getCached<AnimalCategory[]>(cacheKey) ?? DEFAULT_CATEGORIES;
  }

  const result = (data && data.length > 0 ? data : DEFAULT_CATEGORIES) as AnimalCategory[];
  setCached(cacheKey, result);

  if (data && data.length > 0) {
    offlineDb.categories.bulkPut(
      data.map((c) => ({
        id: c.id,
        name: c.name,
        organization_id: c.organization_id || orgId,
        updated_at: new Date().toISOString(),
      }))
    ).catch(() => {});
  }

  return result;
}

export async function createAnimalCategory(name: string): Promise<boolean> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
      const orgId = (await getCurrentOrgId()) || storedOrgId || '';
      const newId = crypto.randomUUID();
      await offlineDb.categories.put({
        id: newId,
        name: name.trim(),
        organization_id: orgId,
        updated_at: new Date().toISOString(),
      });
      await syncEngine.enqueueMutation('insert', 'animal_categories', newId, undefined, {
        id: newId,
        name: name.trim(),
        organization_id: orgId,
      }, orgId);
      invalidateCache('categories');
      return true;
    } catch (e) {
      console.error('createAnimalCategory offline error:', e);
      return false;
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return false;

  const supabase = createClient();
  const { error } = await supabase.from('animal_categories').insert({
    name,
    organization_id: orgId,
  });
  if (error) {
    console.error('createAnimalCategory error:', error);
    return false;
  }

  invalidateCache('categories');
  return true;
}

// ============================================================
// REPRODUCTIVE SEASONS (ESTAÇÕES DE MONTA)
// ============================================================

export interface ReproductiveSeason {
  id: string;
  organization_id?: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'closed';
  created_at?: string;
}

export async function getReproductiveSeasons(forceRefresh = false): Promise<ReproductiveSeason[]> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const offlineSeasons = await offlineDb.seasons.toArray();
      return offlineSeasons.map((s) => ({
        id: s.id,
        name: s.name,
        start_date: (s.start_date as string) || '',
        end_date: (s.end_date as string) || '',
        status: s.status || 'closed',
        created_at: (s.created_at as string) || undefined,
      }));
    } catch (e) {
      console.warn('Falha ao ler estações offline:', e);
      return [];
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) {
    try {
      const offlineSeasons = await offlineDb.seasons.toArray();
      if (offlineSeasons.length > 0) {
        return offlineSeasons.map((s) => ({
          id: s.id,
          name: s.name,
          start_date: (s.start_date as string) || '',
          end_date: (s.end_date as string) || '',
          status: s.status || 'closed',
          created_at: (s.created_at as string) || undefined,
        }));
      }
    } catch {
      // ignore
    }
    return [];
  }

  const cacheKey = `seasons_${orgId}`;
  if (!forceRefresh) {
    const cached = getCached<ReproductiveSeason[]>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('reproductive_seasons')
    .select('*')
    .eq('organization_id', orgId)
    .order('start_date', { ascending: false });

  if (error) {
    console.error('getReproductiveSeasons error:', error);
    try {
      const offlineSeasons = await offlineDb.seasons.toArray();
      if (offlineSeasons.length > 0) {
        return offlineSeasons.map((s) => ({
          id: s.id,
          name: s.name,
          start_date: (s.start_date as string) || '',
          end_date: (s.end_date as string) || '',
          status: s.status || 'closed',
          created_at: (s.created_at as string) || undefined,
        }));
      }
    } catch {
      // ignore
    }
    return getCached<ReproductiveSeason[]>(cacheKey) ?? [];
  }

  const result = (data ?? []) as ReproductiveSeason[];
  setCached(cacheKey, result);

  if (result.length > 0) {
    try {
      await offlineDb.seasons.bulkPut(
        result.map((s) => ({
          id: s.id,
          organization_id: orgId,
          name: s.name,
          start_date: s.start_date,
          end_date: s.end_date,
          status: s.status,
          created_at: s.created_at,
          updated_at: new Date().toISOString(),
        } as import('./offline/offlineDb').OfflineSeason))
      );
    } catch (e) {
      console.warn('Erro ao salvar estações no IndexedDB:', e);
    }
  }

  return result;
}

export async function createReproductiveSeason(season: {
  name: string;
  start_date: string;
  end_date: string;
  status?: 'active' | 'closed';
}): Promise<ReproductiveSeason | null> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return null;

  const newId = crypto.randomUUID();
  const status = season.status || 'closed';

  const seasonRecord: ReproductiveSeason = {
    id: newId,
    organization_id: orgId,
    name: season.name.trim(),
    start_date: season.start_date,
    end_date: season.end_date,
    status,
    created_at: new Date().toISOString(),
  };

  if (isOffline) {
    try {
      if (status === 'active') {
        const all = await offlineDb.seasons.toArray();
        for (const s of all) {
          if (s.status === 'active') {
            await offlineDb.seasons.update(s.id, { status: 'closed', updated_at: new Date().toISOString() });
          }
        }
      }

      await offlineDb.seasons.put({
        ...seasonRecord,
        updated_at: new Date().toISOString(),
      } as import('./offline/offlineDb').OfflineSeason);

      await syncEngine.enqueueMutation('insert', 'reproductive_seasons', newId, undefined, {
        id: newId,
        organization_id: orgId,
        name: season.name.trim(),
        start_date: season.start_date,
        end_date: season.end_date,
        status,
      }, orgId);

      invalidateCache('seasons');
      invalidateCache('lots');
      invalidateCache('metrics');
      return seasonRecord;
    } catch (e) {
      console.error('createReproductiveSeason offline error:', e);
      return null;
    }
  }

  const supabase = createClient();

  // If new season is set to active, mark other seasons of this org as closed
  if (status === 'active') {
    await supabase
      .from('reproductive_seasons')
      .update({ status: 'closed' })
      .eq('organization_id', orgId);
  }

  const { data, error } = await supabase
    .from('reproductive_seasons')
    .insert({
      id: newId,
      organization_id: orgId,
      name: season.name.trim(),
      start_date: season.start_date,
      end_date: season.end_date,
      status,
    })
    .select('*')
    .single();

  if (error) {
    console.error('createReproductiveSeason error:', error);
    return null;
  }

  try {
    if (status === 'active') {
      const all = await offlineDb.seasons.toArray();
      for (const s of all) {
        if (s.status === 'active') {
          await offlineDb.seasons.update(s.id, { status: 'closed' });
        }
      }
    }
    await offlineDb.seasons.put({
      ...seasonRecord,
      updated_at: new Date().toISOString(),
    } as import('./offline/offlineDb').OfflineSeason);
  } catch {}

  invalidateCache('seasons');
  invalidateCache('lots');
  invalidateCache('metrics');
  return data as ReproductiveSeason;
}

export async function updateReproductiveSeason(
  id: string,
  updates: {
    name?: string;
    start_date?: string;
    end_date?: string;
    status?: 'active' | 'closed';
  }
): Promise<boolean> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return false;

  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.start_date !== undefined) payload.start_date = updates.start_date;
  if (updates.end_date !== undefined) payload.end_date = updates.end_date;
  if (updates.status !== undefined) payload.status = updates.status;

  if (isOffline) {
    try {
      if (updates.status === 'active') {
        const all = await offlineDb.seasons.toArray();
        for (const s of all) {
          if (s.id !== id && s.status === 'active') {
            await offlineDb.seasons.update(s.id, { status: 'closed' });
          }
        }
      }
      await offlineDb.seasons.update(id, {
        ...payload,
        updated_at: new Date().toISOString(),
      });
      await syncEngine.enqueueMutation('update', 'reproductive_seasons', id, undefined, {
        id,
        ...payload,
        updated_at: new Date().toISOString(),
      }, orgId);

      invalidateCache('seasons');
      invalidateCache('lots');
      invalidateCache('metrics');
      return true;
    } catch (e) {
      console.error('updateReproductiveSeason offline error:', e);
      return false;
    }
  }

  const supabase = createClient();

  if (updates.status === 'active') {
    // If activating, close others
    await supabase
      .from('reproductive_seasons')
      .update({ status: 'closed' })
      .eq('organization_id', orgId)
      .neq('id', id);
  }

  const { error } = await supabase
    .from('reproductive_seasons')
    .update(payload)
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    console.error('updateReproductiveSeason error:', error);
    return false;
  }

  try {
    if (updates.status === 'active') {
      const all = await offlineDb.seasons.toArray();
      for (const s of all) {
        if (s.id !== id && s.status === 'active') {
          await offlineDb.seasons.update(s.id, { status: 'closed' });
        }
      }
    }
    await offlineDb.seasons.update(id, {
      ...payload,
      updated_at: new Date().toISOString(),
    });
  } catch {}

  invalidateCache('seasons');
  invalidateCache('lots');
  invalidateCache('metrics');
  return true;
}

export async function setActiveReproductiveSeason(id: string): Promise<boolean> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return false;

  const setOfflineActiveSeason = async (): Promise<boolean> => {
    try {
      const all = await offlineDb.seasons.toArray();
      for (const s of all) {
        await offlineDb.seasons.update(s.id, {
          status: s.id === id ? 'active' : 'closed',
          updated_at: new Date().toISOString(),
        });
      }
      await syncEngine.enqueueMutation('update', 'reproductive_seasons', id, undefined, {
        id,
        status: 'active',
        updated_at: new Date().toISOString(),
      }, orgId);
      invalidateCache('seasons');
      invalidateCache('lots');
      invalidateCache('metrics');
      return true;
    } catch (e) {
      console.error('setActiveReproductiveSeason offline error:', e);
      return false;
    }
  };

  if (isOffline) {
    return setOfflineActiveSeason();
  }

  const supabase = createClient();

  // Set all to closed
  await supabase
    .from('reproductive_seasons')
    .update({ status: 'closed' })
    .eq('organization_id', orgId);

  // Set target to active
  const { error } = await supabase
    .from('reproductive_seasons')
    .update({ status: 'active' })
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    if (isNetworkError(error)) {
      syncEngine.markOffline();
      return setOfflineActiveSeason();
    }
    console.error('setActiveReproductiveSeason error:', error);
    return false;
  }

  try {
    const all = await offlineDb.seasons.toArray();
    for (const s of all) {
      await offlineDb.seasons.update(s.id, {
        status: s.id === id ? 'active' : 'closed',
        updated_at: new Date().toISOString(),
      });
    }
  } catch {}

  invalidateCache('seasons');
  invalidateCache('lots');
  invalidateCache('metrics');
  return true;
}

export async function deleteReproductiveSeason(id: string): Promise<{ success: boolean; error?: string }> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return { success: false, error: 'Sessão inválida' };

  if (isOffline) {
    try {
      const lotsUsing = await offlineDb.lots.where('season_id').equals(id).count();
      if (lotsUsing > 0) {
        return {
          success: false,
          error: `Não é possível excluir esta estação pois existem ${lotsUsing} lote(s) vinculados a ela localmente.`,
        };
      }
      await offlineDb.seasons.delete(id);
      await syncEngine.enqueueMutation('delete', 'reproductive_seasons', id, undefined, { id }, orgId);
      invalidateCache('seasons');
      invalidateCache('lots');
      invalidateCache('metrics');
      return { success: true };
    } catch (e) {
      console.error('deleteReproductiveSeason offline error:', e);
      return { success: false, error: 'Erro offline ao excluir estação.' };
    }
  }

  const supabase = createClient();

  // Check if any lot is associated with this season
  const { count, error: countErr } = await supabase
    .from('iatf_lots')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', id);

  if (countErr) {
    console.error('deleteReproductiveSeason check lots error:', countErr);
  }

  if (count && count > 0) {
    return {
      success: false,
      error: `Não é possível excluir esta estação pois existem ${count} lote(s) vinculados a ela.`,
    };
  }

  const { error } = await supabase
    .from('reproductive_seasons')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    console.error('deleteReproductiveSeason error:', error);
    return { success: false, error: error.message };
  }

  try {
    await offlineDb.seasons.delete(id);
  } catch {}

  invalidateCache('seasons');
  invalidateCache('lots');
  invalidateCache('metrics');
  return { success: true };
}

// ============================================================
// VETERINARIANS (MÉDICOS VETERINÁRIOS / RT)
// ============================================================

export interface Veterinarian {
  id: string;
  organization_id?: string;
  name: string;
  crmv?: string | null;
  phone?: string | null;
  email?: string | null;
  is_default?: boolean;
  created_at?: string;
}

export async function getVeterinarians(forceRefresh = false): Promise<Veterinarian[]> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    try {
      const offlineVets = await offlineDb.veterinarians.toArray();
      if (offlineVets.length > 0) {
        return offlineVets.map((v) => ({
          id: v.id,
          organization_id: v.organization_id,
          name: v.name,
          crmv: v.crmv || null,
          phone: v.phone || null,
          email: v.email || null,
          is_default: !!v.is_default,
        }));
      }
    } catch {}
    return [
      {
        id: 'default-vet',
        name: 'MV. DR. SAMOEL DUARTE',
        crmv: 'CRMV-MT',
        is_default: true,
      },
    ];
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return [
    {
      id: 'default-vet',
      name: 'MV. DR. SAMOEL DUARTE',
      crmv: 'CRMV-MT',
      is_default: true,
    },
  ];

  const cacheKey = `vets_${orgId}`;
  if (!forceRefresh) {
    const cached = getCached<Veterinarian[]>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('veterinarians')
    .select('*')
    .eq('organization_id', orgId)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    console.error('getVeterinarians error:', error);
    try {
      const offlineVets = await offlineDb.veterinarians.toArray();
      if (offlineVets.length > 0) {
        return offlineVets.map((v) => ({
          id: v.id,
          organization_id: v.organization_id,
          name: v.name,
          crmv: v.crmv || null,
          phone: v.phone || null,
          email: v.email || null,
          is_default: !!v.is_default,
        }));
      }
    } catch {}
    return getCached<Veterinarian[]>(cacheKey) ?? [
      {
        id: 'default-vet',
        name: 'MV. DR. SAMOEL DUARTE',
        crmv: 'CRMV-MT',
        is_default: true,
      },
    ];
  }

  let result = (data ?? []) as Veterinarian[];
  if (result.length === 0) {
    // Auto-create default veterinarian if table is completely empty
    const { data: created } = await supabase
      .from('veterinarians')
      .insert({
        organization_id: orgId,
        name: 'MV. DR. SAMOEL DUARTE',
        crmv: 'CRMV-MT 1234',
        phone: '(65) 99999-0000',
        email: 'samoel@iatfmaster.com.br',
        is_default: true,
      })
      .select('*')
      .single();

    if (created) {
      result = [created as Veterinarian];
    }
  }

  try {
    await offlineDb.veterinarians.bulkPut(
      result.map((v) => ({
        id: v.id,
        organization_id: orgId,
        name: v.name,
        crmv: v.crmv || null,
        phone: v.phone || null,
        email: v.email || null,
        is_default: !!v.is_default,
        updated_at: new Date().toISOString(),
      }))
    );
  } catch {}

  setCached(cacheKey, result);
  return result;
}

export async function createVeterinarian(vet: {
  name: string;
  crmv?: string;
  phone?: string;
  email?: string;
  is_default?: boolean;
}): Promise<Veterinarian | null> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return null;

  const newId = crypto.randomUUID();
  const isDefault = !!vet.is_default;
  const vetRecord: Veterinarian = {
    id: newId,
    organization_id: orgId,
    name: vet.name.trim(),
    crmv: vet.crmv ? vet.crmv.trim() : null,
    phone: vet.phone ? vet.phone.trim() : null,
    email: vet.email ? vet.email.trim() : null,
    is_default: isDefault,
    created_at: new Date().toISOString(),
  };

  if (isOffline) {
    try {
      if (isDefault) {
        const all = await offlineDb.veterinarians.toArray();
        for (const v of all) {
          if (v.is_default) {
            await offlineDb.veterinarians.update(v.id, { is_default: false });
          }
        }
      }
      await offlineDb.veterinarians.put({
        ...vetRecord,
        updated_at: new Date().toISOString(),
      });
      await syncEngine.enqueueMutation('insert', 'veterinarians', newId, undefined, {
        id: newId,
        organization_id: orgId,
        name: vet.name.trim(),
        crmv: vet.crmv ? vet.crmv.trim() : null,
        phone: vet.phone ? vet.phone.trim() : null,
        email: vet.email ? vet.email.trim() : null,
        is_default: isDefault,
      }, orgId);
      invalidateCache('vets');
      return vetRecord;
    } catch (e) {
      console.error('createVeterinarian offline error:', e);
      return null;
    }
  }

  const supabase = createClient();

  if (isDefault) {
    await supabase
      .from('veterinarians')
      .update({ is_default: false })
      .eq('organization_id', orgId);
  }

  const { data, error } = await supabase
    .from('veterinarians')
    .insert({
      id: newId,
      organization_id: orgId,
      name: vet.name.trim(),
      crmv: vet.crmv ? vet.crmv.trim() : null,
      phone: vet.phone ? vet.phone.trim() : null,
      email: vet.email ? vet.email.trim() : null,
      is_default: isDefault,
    })
    .select('*')
    .single();

  if (error) {
    console.error('createVeterinarian error:', error);
    return null;
  }

  try {
    if (isDefault) {
      const all = await offlineDb.veterinarians.toArray();
      for (const v of all) {
        if (v.is_default) {
          await offlineDb.veterinarians.update(v.id, { is_default: false });
        }
      }
    }
    await offlineDb.veterinarians.put({
      ...vetRecord,
      updated_at: new Date().toISOString(),
    });
  } catch {}

  invalidateCache('vets');
  return data as Veterinarian;
}

export async function updateVeterinarian(
  id: string,
  updates: Partial<Veterinarian>
): Promise<boolean> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return false;

  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.crmv !== undefined) payload.crmv = updates.crmv ? updates.crmv.trim() : null;
  if (updates.phone !== undefined) payload.phone = updates.phone ? updates.phone.trim() : null;
  if (updates.email !== undefined) payload.email = updates.email ? updates.email.trim() : null;
  if (updates.is_default !== undefined) payload.is_default = updates.is_default;

  if (isOffline) {
    try {
      if (updates.is_default) {
        const all = await offlineDb.veterinarians.toArray();
        for (const v of all) {
          if (v.id !== id && v.is_default) {
            await offlineDb.veterinarians.update(v.id, { is_default: false });
          }
        }
      }
      await offlineDb.veterinarians.update(id, {
        ...payload,
        updated_at: new Date().toISOString(),
      });
      await syncEngine.enqueueMutation('update', 'veterinarians', id, undefined, {
        id,
        ...payload,
        updated_at: new Date().toISOString(),
      }, orgId);
      invalidateCache('vets');
      return true;
    } catch (e) {
      console.error('updateVeterinarian offline error:', e);
      return false;
    }
  }

  const supabase = createClient();

  if (updates.is_default) {
    await supabase
      .from('veterinarians')
      .update({ is_default: false })
      .eq('organization_id', orgId)
      .neq('id', id);
  }

  const { error } = await supabase
    .from('veterinarians')
    .update(payload)
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    console.error('updateVeterinarian error:', error);
    return false;
  }

  try {
    if (updates.is_default) {
      const all = await offlineDb.veterinarians.toArray();
      for (const v of all) {
        if (v.id !== id && v.is_default) {
          await offlineDb.veterinarians.update(v.id, { is_default: false });
        }
      }
    }
    await offlineDb.veterinarians.update(id, {
      ...payload,
      updated_at: new Date().toISOString(),
    });
  } catch {}

  invalidateCache('vets');
  return true;
}

export async function setDefaultVeterinarian(id: string): Promise<boolean> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return false;

  if (isOffline) {
    try {
      const all = await offlineDb.veterinarians.toArray();
      for (const v of all) {
        await offlineDb.veterinarians.update(v.id, {
          is_default: v.id === id,
          updated_at: new Date().toISOString(),
        });
      }
      await syncEngine.enqueueMutation('update', 'veterinarians', id, undefined, {
        id,
        is_default: true,
        updated_at: new Date().toISOString(),
      }, orgId);
      invalidateCache('vets');
      return true;
    } catch (e) {
      console.error('setDefaultVeterinarian offline error:', e);
      return false;
    }
  }

  const supabase = createClient();

  await supabase
    .from('veterinarians')
    .update({ is_default: false })
    .eq('organization_id', orgId);

  const { error } = await supabase
    .from('veterinarians')
    .update({ is_default: true })
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    console.error('setDefaultVeterinarian error:', error);
    return false;
  }

  try {
    const all = await offlineDb.veterinarians.toArray();
    for (const v of all) {
      await offlineDb.veterinarians.update(v.id, {
        is_default: v.id === id,
        updated_at: new Date().toISOString(),
      });
    }
  } catch {}

  invalidateCache('vets');
  return true;
}

export async function deleteVeterinarian(id: string): Promise<{ success: boolean; error?: string }> {
  const isOffline = isSystemOffline();
  const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
  const orgId = (await getCurrentOrgId()) || storedOrgId;
  if (!orgId) return { success: false, error: 'Sessão inválida' };

  if (isOffline) {
    try {
      await offlineDb.veterinarians.delete(id);
      await syncEngine.enqueueMutation('delete', 'veterinarians', id, undefined, { id }, orgId);
      invalidateCache('vets');
      return { success: true };
    } catch (e) {
      console.error('deleteVeterinarian offline error:', e);
      return { success: false, error: 'Erro offline ao excluir veterinário.' };
    }
  }

  const supabase = createClient();

  const { error } = await supabase
    .from('veterinarians')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    console.error('deleteVeterinarian error:', error);
    return { success: false, error: error.message };
  }

  try {
    await offlineDb.veterinarians.delete(id);
  } catch {}

  invalidateCache('vets');
  return { success: true };
}

// ============================================================
// ANIMAL MANAGEMENT (MANEJO INDIVIDUAL POR ANIMAL)
// ============================================================

export interface AnimalManagement {
  id: string;
  organization_id: string;
  farm_id: string;
  animal_id: string;
  season_id: string | null;
  protocol_id: string | null;
  lot_id: string | null;
  cycle_number: number;
  start_date: string;
  d7_date: string | null;
  d9_date: string | null;
  ia_date: string | null;
  dg_date: string | null;
  d0_executed_at: string | null;
  d0_responsible: string | null;
  d0_notes: string | null;
  d9_executed_at: string | null;
  d9_responsible: string | null;
  d9_device_loss: boolean;
  d9_notes: string | null;
  ia_executed_at: string | null;
  bull_id: string | null;
  semen_batch_id: string | null;
  inseminator_name: string | null;
  ecc_ia: number | null;
  ia_notes: string | null;
  dg_executed_at: string | null;
  pregnancy_status: 'pendente' | 'prenha' | 'vazia' | 'inconclusivo';
  ecc_dg: number | null;
  expected_parturition_date: string | null;
  dg_notes: string | null;
  status: 'em_andamento' | 'concluido' | 'cancelado';
  notes: string | null;
  created_at: string;
  updated_at: string;
  protocols?: { 
    name: string; 
    number_of_managements?: number;
    protocol_steps?: { code: string; name: string; day_offset: number; step_order: number; dosage_instruction?: string }[];
  } | null;
  bulls?: { name: string; code?: string | null } | null;
  semen_batches?: { batch_number: string } | null;
  reproductive_seasons?: { name: string } | null;
  iatf_lots?: { code: string } | null;
}

export async function getAnimalManagements(animalId: string, forceRefresh = false): Promise<AnimalManagement[]> {
  const cacheKey = `animal_managements_${animalId}`;
  if (!forceRefresh) {
    const cached = getCached<AnimalManagement[]>(cacheKey);
    if (cached) return cached;
  }

  const buildOfflineAnimalManagements = async (): Promise<AnimalManagement[]> => {
    try {
      const [mgmts, lotAnimals, protocols, bulls, batches, seasons, lots] = await Promise.all([
        offlineDb.animal_managements.where('animal_id').equals(animalId).toArray(),
        offlineDb.lot_animals.where('animal_id').equals(animalId).toArray(),
        offlineDb.protocols.toArray(),
        offlineDb.bulls.toArray(),
        offlineDb.semen_batches.toArray(),
        offlineDb.seasons.toArray(),
        offlineDb.lots.toArray(),
      ]);

      const protoMap = new Map(protocols.map((p) => [p.id, p]));
      const bullMap = new Map(bulls.map((b) => [b.id, b]));
      const batchMap = new Map(batches.map((b) => [b.id, b]));
      const seasonMap = new Map(seasons.map((s) => [s.id, s]));
      const lotMap = new Map(lots.map((l) => [l.id, l]));

      const mappedMgmts: AnimalManagement[] = mgmts.map((m, idx) => {
        const raw = m as Record<string, unknown>;
        const lot = m.lot_id ? lotMap.get(m.lot_id) : undefined;
        const protoId = (raw.protocol_id as string) || lot?.protocol_id || null;
        const proto = protoId ? protoMap.get(protoId) : undefined;
        const bullId = (raw.bull_id as string) || null;
        const bull = bullId ? bullMap.get(bullId) : undefined;
        const batchId = m.semen_batch_id || (raw.semen_batch_id as string) || null;
        const batch = batchId ? batchMap.get(batchId) : undefined;
        const seasonId = (raw.season_id as string) || lot?.season_id || null;
        const season = seasonId ? seasonMap.get(seasonId) : undefined;
        const startDate = String(raw.start_date || lot?.start_date || m.date || new Date().toISOString().split('T')[0]);
        const lotIaPlanned = (lot?.ia_planned_date as string | undefined) || undefined;
        const lotDgPlanned = (lot?.dg_planned_date as string | undefined) || undefined;
        const nowIso = new Date().toISOString();

        return {
          id: m.id,
          organization_id: (raw.organization_id as string) || '',
          farm_id: m.farm_id || lot?.farm_id || '',
          animal_id: m.animal_id,
          season_id: seasonId,
          protocol_id: protoId,
          lot_id: m.lot_id || null,
          cycle_number: (raw.cycle_number as number) || idx + 1,
          start_date: startDate,
          d7_date: (raw.d7_date as string) || null,
          d9_date: (raw.d9_date as string) || addDaysToDateString(startDate, 9),
          ia_date: (raw.ia_date as string) || lotIaPlanned || addDaysToDateString(startDate, 11),
          dg_date: (raw.dg_date as string) || lotDgPlanned || addDaysToDateString(startDate, 44),
          d0_executed_at: (raw.d0_executed_at as string) || (m.step_code === 'D0' ? m.date : startDate),
          d0_responsible: (raw.d0_responsible as string) || m.inseminator || null,
          d0_notes: (raw.d0_notes as string) || null,
          d9_executed_at: (raw.d9_executed_at as string) || (m.step_code === 'D9' || m.step_code === 'IA' || m.step_code === 'DG' ? ((raw.d9_executed_at as string) || m.date) : null),
          d9_responsible: (raw.d9_responsible as string) || null,
          d9_device_loss: Boolean(raw.d9_device_loss),
          d9_notes: (raw.d9_notes as string) || null,
          ia_executed_at: (raw.ia_executed_at as string) || (m.step_code === 'IA' ? m.date : null),
          bull_id: bullId,
          semen_batch_id: batchId,
          inseminator_name: (raw.inseminator_name as string) || m.inseminator || null,
          ecc_ia: (raw.ecc_ia as number) ?? null,
          ia_notes: (raw.ia_notes as string) || null,
          dg_executed_at: (raw.dg_executed_at as string) || (m.step_code === 'DG' ? m.date : null),
          pregnancy_status: ((raw.pregnancy_status as string) || m.diagnosis_result || 'pendente') as AnimalManagement['pregnancy_status'],
          ecc_dg: (raw.ecc_dg as number) ?? null,
          expected_parturition_date: (raw.expected_parturition_date as string) || null,
          dg_notes: (raw.dg_notes as string) || null,
          status: ((raw.status as string) || (m.step_code === 'DG' ? 'concluido' : 'em_andamento')) as AnimalManagement['status'],
          notes: m.notes || null,
          created_at: m.created_at || nowIso,
          updated_at: m.updated_at || m.created_at || nowIso,
          protocols: proto
            ? {
                name: proto.name,
                number_of_managements: (proto.number_of_managements as number) || 3,
                protocol_steps: (proto.protocol_steps as NonNullable<AnimalManagement['protocols']>['protocol_steps']) || [],
              }
            : null,
          bulls: bull ? { name: bull.name, code: bull.code || null } : m.bull_name ? { name: m.bull_name } : null,
          semen_batches: batch ? { batch_number: batch.batch_number } : null,
          reproductive_seasons: season ? { name: season.name } : null,
          iatf_lots: lot ? { code: lot.code } : null,
        };
      });

      const existingLotIds = new Set(mappedMgmts.map((m) => m.lot_id).filter(Boolean));
      for (const la of lotAnimals) {
        if (la.lot_id && !existingLotIds.has(la.lot_id)) {
          const lot = lotMap.get(la.lot_id);
          if (!lot) continue;
          const proto = lot.protocol_id ? protoMap.get(lot.protocol_id) : undefined;
          const bull = la.bull_id ? bullMap.get(la.bull_id as string) : undefined;
          const batch = la.semen_batch_id ? batchMap.get(la.semen_batch_id as string) : undefined;
          const season = lot.season_id ? seasonMap.get(lot.season_id) : undefined;
          const startDate = String(lot.start_date || new Date().toISOString().split('T')[0]);
          const lotIaPlanned = (lot.ia_planned_date as string | undefined) || undefined;
          const lotDgPlanned = (lot.dg_planned_date as string | undefined) || undefined;
          const isConcluded = lot.status === 'concluido' || (la.pregnancy_status && la.pregnancy_status !== 'pendente');
          const nowIso = new Date().toISOString();

          mappedMgmts.push({
            id: `lot_virtual_${la.id}`,
            organization_id: (lot.organization_id as string) || '',
            farm_id: lot.farm_id,
            animal_id: animalId,
            season_id: lot.season_id || null,
            protocol_id: lot.protocol_id || null,
            lot_id: lot.id,
            cycle_number: mappedMgmts.length + 1,
            start_date: startDate,
            d7_date: null,
            d9_date: addDaysToDateString(startDate, 9),
            ia_date: lotIaPlanned || addDaysToDateString(startDate, 11),
            dg_date: lotDgPlanned || addDaysToDateString(startDate, 44),
            d0_executed_at: startDate,
            d0_responsible: null,
            d0_notes: null,
            d9_executed_at: la.current_step === 'D9' || la.current_step === 'IA' || la.current_step === 'DG' || la.bull_id ? addDaysToDateString(startDate, 9) : null,
            d9_responsible: null,
            d9_device_loss: Boolean(la.d9_device_loss),
            d9_notes: null,
            ia_executed_at: la.bull_id || la.current_step === 'IA' || la.current_step === 'DG' ? (lotIaPlanned || addDaysToDateString(startDate, 11)) : null,
            bull_id: (la.bull_id as string) || null,
            semen_batch_id: (la.semen_batch_id as string) || null,
            inseminator_name: (la.inseminator_name as string) || null,
            ecc_ia: (la.ecc_ia as number) ?? null,
            ia_notes: null,
            dg_executed_at: isConcluded ? (lotDgPlanned || addDaysToDateString(startDate, 44)) : null,
            pregnancy_status: ((la.pregnancy_status as string) || 'pendente') as AnimalManagement['pregnancy_status'],
            ecc_dg: (la.ecc_dg as number) ?? null,
            expected_parturition_date: (la.expected_parturition_date as string) || null,
            dg_notes: null,
            status: isConcluded ? 'concluido' : 'em_andamento',
            notes: (la.notes as string) || null,
            created_at: (la.created_at as string) || nowIso,
            updated_at: (la.updated_at as string) || (la.created_at as string) || nowIso,
            protocols: proto
              ? {
                  name: proto.name,
                  number_of_managements: (proto.number_of_managements as number) || 3,
                  protocol_steps: (proto.protocol_steps as NonNullable<AnimalManagement['protocols']>['protocol_steps']) || [],
                }
              : null,
            bulls: bull ? { name: bull.name, code: bull.code || null } : (la.bulls as AnimalManagement['bulls']) || null,
            semen_batches: batch ? { batch_number: batch.batch_number } : (la.semen_batches as AnimalManagement['semen_batches']) || null,
            reproductive_seasons: season ? { name: season.name } : null,
            iatf_lots: { code: lot.code },
          });
        }
      }

      return mappedMgmts.sort((a, b) => (b.cycle_number || 0) - (a.cycle_number || 0));
    } catch (e) {
      console.warn('getAnimalManagements offline error:', e);
      return getCached<AnimalManagement[]>(cacheKey) ?? [];
    }
  };

  if (isSystemOffline()) {
    return buildOfflineAnimalManagements();
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('animal_managements')
    .select(`
      *,
      protocols (
        name,
        number_of_managements,
        protocol_steps (code, name, day_offset, step_order, dosage_instruction)
      ),
      bulls (name, code),
      semen_batches (batch_number),
      reproductive_seasons (name),
      iatf_lots (code)
    `)
    .eq('animal_id', animalId)
    .order('cycle_number', { ascending: false });

  if (error) {
    if (isNetworkError(error)) {
      syncEngine.markOffline();
      return buildOfflineAnimalManagements();
    }
    console.error('getAnimalManagements error:', error);
    return getCached<AnimalManagement[]>(cacheKey) ?? [];
  }

  const result = (data ?? []) as unknown as AnimalManagement[];
  setCached(cacheKey, result);
  return result;
}

export async function startAnimalManagement(params: {
  animal_id: string;
  farm_id: string;
  protocol_id: string;
  season_id?: string | null;
  lot_id?: string | null;
  start_date: string;
  d0_responsible?: string | null;
  d0_executed?: boolean;
  notes?: string | null;
  custom_d9_date?: string | null;
  custom_ia_date?: string | null;
  custom_dg_date?: string | null;
}): Promise<{ success: boolean; managementId?: string; error?: string }> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    const offlineMgmtId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'mgmt_' + Date.now();
    await syncEngine.recordOfflineManagementStart({
      id: offlineMgmtId,
      organization_id: (typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : '') || '',
      farm_id: params.farm_id,
      animal_id: params.animal_id,
      season_id: params.season_id || null,
      protocol_id: params.protocol_id,
      lot_id: params.lot_id || null,
      start_date: params.start_date,
      d0_executed_at: params.d0_executed !== false ? params.start_date : null,
      d0_responsible: params.d0_responsible || null,
      d0_notes: params.notes || null,
      custom_d9_date: params.custom_d9_date || null,
      custom_ia_date: params.custom_ia_date || null,
      custom_dg_date: params.custom_dg_date || null,
    });
    invalidateCache('animal_managements');
    invalidateCache('animals');
    return { success: true, managementId: offlineMgmtId };
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return { success: false, error: 'Sessão inválida.' };

  const supabase = createClient();

  // 1. Determinar o ciclo sequencial (ex: 1ª IATF, 2ª IATF)
  const { count } = await supabase
    .from('animal_managements')
    .select('id', { count: 'exact', head: true })
    .eq('animal_id', params.animal_id);

  const nextCycle = (count ?? 0) + 1;

  // 2. Buscar etapas do protocolo para calcular datas
  const { data: protocolSteps } = await supabase
    .from('protocol_steps')
    .select('code, day_offset')
    .eq('protocol_id', params.protocol_id)
    .order('step_order', { ascending: true });

  let d7Date: string | null = null;
  let d9Date: string | null = null;
  let iaDate: string | null = null;
  let dgDate: string | null = null;

  if (protocolSteps && protocolSteps.length > 0) {
    for (const step of protocolSteps) {
      const str = addDaysToDateString(params.start_date, step.day_offset);
      const codeUpper = step.code.toUpperCase();

      if (codeUpper === 'D7') d7Date = str;
      else if (codeUpper === 'D8' || codeUpper === 'D9') d9Date = str;
      else if (codeUpper === 'IA') iaDate = str;
      else if (codeUpper === 'DG' || codeUpper === 'DG1') dgDate = str;
    }
  }

  // Fallbacks padrão caso o protocolo não especifique algum step
  if (!d9Date) {
    d9Date = addDaysToDateString(params.start_date, 9);
  }
  if (!iaDate) {
    iaDate = addDaysToDateString(params.start_date, 11);
  }
  if (!dgDate) {
    dgDate = addDaysToDateString(params.start_date, 44);
  }

  // Livre escolha do veterinário tem precedência sobre o cálculo automático
  if (params.custom_d9_date) d9Date = params.custom_d9_date;
  if (params.custom_ia_date) iaDate = params.custom_ia_date;
  if (params.custom_dg_date) dgDate = params.custom_dg_date;

  const { data: inserted, error } = await supabase
    .from('animal_managements')
    .insert({
      organization_id: orgId,
      farm_id: params.farm_id,
      animal_id: params.animal_id,
      season_id: params.season_id || null,
      protocol_id: params.protocol_id,
      lot_id: params.lot_id || null,
      cycle_number: nextCycle,
      start_date: params.start_date,
      d7_date: d7Date,
      d9_date: d9Date,
      ia_date: iaDate,
      dg_date: dgDate,
      d0_executed_at: params.d0_executed !== false ? params.start_date : null,
      d0_responsible: params.d0_responsible || null,
      d0_notes: params.notes || null,
      status: 'em_andamento',
      pregnancy_status: 'pendente',
    })
    .select('id')
    .single();

  if (error) {
    console.error('startAnimalManagement error:', error);
    return { success: false, error: error.message };
  }

  invalidateCache('animal_managements');
  invalidateCache('animals');
  return { success: true, managementId: inserted.id };
}

export async function executeStepD0(
  managementId: string,
  data: { executed_at: string; responsible?: string | null; notes?: string | null }
): Promise<boolean> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    await syncEngine.recordOfflineStepD0(managementId, data);
    invalidateCache('animal_managements');
    return true;
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('animal_managements')
    .update({
      d0_executed_at: data.executed_at,
      d0_responsible: data.responsible || null,
      d0_notes: data.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', managementId);

  if (error) {
    console.error('executeStepD0 error:', error);
    return false;
  }
  invalidateCache('animal_managements');
  return true;
}

export async function executeStepD9(
  managementId: string,
  data: { executed_at: string; responsible?: string | null; device_loss?: boolean; notes?: string | null }
): Promise<boolean> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    await syncEngine.recordOfflineStepD9(managementId, data);
    invalidateCache('animal_managements');
    return true;
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('animal_managements')
    .update({
      d9_executed_at: data.executed_at,
      d9_responsible: data.responsible || null,
      d9_device_loss: Boolean(data.device_loss),
      d9_notes: data.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', managementId);

  if (error) {
    console.error('executeStepD9 error:', error);
    return false;
  }
  invalidateCache('animal_managements');
  return true;
}

/**
 * Dedução integrada no módulo de Estoque Genético Criogênico (genetic_inventory_balances).
 * Localiza os lotes genéticos da organização (inclusive os centralizados na Fazenda Principal)
 * e debita o saldo via procedure fn_process_genetic_usage_iatf, gerando auditoria no livro-razão.
 */
export async function deductGeneticInventoryForSemenBatch(params: {
  semenBatchId: string;
  quantity: number;
  referenceType: string;
  referenceId: string;
  inseminatorName?: string | null;
  notes?: string | null;
  preferredFarmId?: string | null;
}): Promise<boolean> {
  if (!params.semenBatchId || params.quantity <= 0) return false;
  const supabase = createClient();
  try {
    // 1. Obter informações da partida legada
    const { data: batch } = await supabase
      .from('semen_batches')
      .select('id, batch_number, bull_id, organization_id')
      .eq('id', params.semenBatchId)
      .maybeSingle();

    if (!batch) return false;

    const orgId = batch.organization_id;

    // 2. Localizar os materiais genéticos vinculados ao touro
    const { data: materials } = await supabase
      .from('genetic_materials')
      .select('id')
      .eq('organization_id', orgId)
      .eq('sire_id', batch.bull_id);

    const materialIds = (materials || []).map((m: { id: string }) => m.id);

    // 3. Localizar o lote em genetic_material_batches por batch_number
    let genBatchesQuery = supabase
      .from('genetic_material_batches')
      .select('id, farm_id')
      .eq('organization_id', orgId)
      .ilike('batch_number', batch.batch_number);

    if (materialIds.length > 0) {
      genBatchesQuery = genBatchesQuery.in('material_id', materialIds);
    }

    const { data: genBatchesData } = await genBatchesQuery.limit(5);
    const genBatches: Array<{ id: string; farm_id: string }> = genBatchesData ? [...genBatchesData] : [];

    if (genBatches.length === 0) {
      // Fallback: tentar sem filtrar material_id caso cadastrado com pequena divergência
      const { data: fallbackBatches } = await supabase
        .from('genetic_material_batches')
        .select('id, farm_id')
        .eq('organization_id', orgId)
        .ilike('batch_number', batch.batch_number)
        .limit(5);

      if (fallbackBatches && fallbackBatches.length > 0) {
        genBatches.push(...fallbackBatches);
      }
    }

    if (genBatches.length === 0) {
      console.warn('Lote de sêmen não encontrado no módulo criogênico:', batch.batch_number);
      return false;
    }

    const genBatchIds = Array.from(new Set(genBatches.map((b) => b.id)));

    // 4. Buscar saldos ativos em genetic_inventory_balances
    const { data: balances } = await supabase
      .from('genetic_inventory_balances')
      .select('id, farm_id, batch_id, tank_id, canister_id, owner_client_id, quantity_available')
      .in('batch_id', genBatchIds)
      .gt('quantity_available', 0)
      .order('quantity_available', { ascending: false });

    if (!balances || balances.length === 0) {
      console.warn('Nenhum saldo ativo no estoque criogênico para o lote:', batch.batch_number);
      return false;
    }

    // Se houver uma fazenda preferencial (onde o lote foi executado), prioriza os saldos dela
    const sortedBalances = [...balances].sort((a, b) => {
      if (params.preferredFarmId) {
        if (a.farm_id === params.preferredFarmId && b.farm_id !== params.preferredFarmId) return -1;
        if (b.farm_id === params.preferredFarmId && a.farm_id !== params.preferredFarmId) return 1;
      }
      return (b.quantity_available || 0) - (a.quantity_available || 0);
    });

    let remainingToDeduct = params.quantity;
    for (const bal of sortedBalances) {
      if (remainingToDeduct <= 0) break;
      const available = bal.quantity_available || 0;
      if (available <= 0) continue;

      const qtyToDeduct = Math.min(available, remainingToDeduct);
      const idempotencyKey = `ia_usage_${params.referenceType}_${params.referenceId}_${bal.id}_${Date.now()}`;

      await supabase.rpc('fn_process_genetic_usage_iatf', {
        p_organization_id: orgId,
        p_farm_id: bal.farm_id,
        p_batch_id: bal.batch_id,
        p_tank_id: bal.tank_id,
        p_canister_id: bal.canister_id,
        p_owner_client_id: bal.owner_client_id || null,
        p_quantity: qtyToDeduct,
        p_reference_type: params.referenceType,
        p_reference_id: params.referenceId,
        p_inseminator_name: params.inseminatorName || null,
        p_notes: params.notes || `Baixa automática IA (${qtyToDeduct} doses)`,
        p_created_by: params.inseminatorName || 'Sistema IATF',
        p_idempotency_key: idempotencyKey,
      });

      remainingToDeduct -= qtyToDeduct;
    }

    invalidateCache('gen_metrics');
    invalidateCache('tanks');
    invalidateCache('semen');
    return true;
  } catch (err) {
    console.warn('Erro ao deduzir sêmen do estoque criogênico:', err);
    return false;
  }
}

export async function executeStepIA(
  managementId: string,
  data: {
    animal_id: string;
    executed_at: string;
    bull_id?: string | null;
    semen_batch_id?: string | null;
    inseminator_name?: string | null;
    ecc_ia?: number | null;
    notes?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    await syncEngine.recordOfflineStepIA(managementId, {
      animal_id: data.animal_id,
      executed_at: data.executed_at,
      bull_id: data.bull_id || '',
      semen_batch_id: data.semen_batch_id || '',
      inseminator_name: data.inseminator_name || null,
      ecc_ia: data.ecc_ia !== undefined && data.ecc_ia !== null ? String(data.ecc_ia) : null,
      notes: data.notes || null,
    });
    invalidateCache('animal_managements');
    invalidateCache('animals');
    invalidateCache('semen');
    invalidateCache('metrics');
    return { success: true };
  }

  const supabase = createClient();

  // 1. Atualizar o registro do manejo individual
  const { error: mgmtError } = await supabase
    .from('animal_managements')
    .update({
      ia_executed_at: data.executed_at,
      bull_id: data.bull_id || null,
      semen_batch_id: data.semen_batch_id || null,
      inseminator_name: data.inseminator_name || null,
      ecc_ia: data.ecc_ia !== undefined && data.ecc_ia !== null ? Number(data.ecc_ia) : null,
      ia_notes: data.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', managementId);

  if (mgmtError) {
    console.error('executeStepIA error:', mgmtError);
    return { success: false, error: mgmtError.message };
  }

  // 2. Atualizar o status da fêmea para 'inseminada'
  await supabase
    .from('animals')
    .update({ reproductive_status: 'inseminada', updated_at: new Date().toISOString() })
    .eq('id', data.animal_id);

  // 3. Dar baixa automática de 1 dose do sêmen selecionado (RN-08)
  if (data.semen_batch_id) {
    const { data: batch } = await supabase
      .from('semen_batches')
      .select('id, batch_number, bull_id, used_quantity')
      .eq('id', data.semen_batch_id)
      .maybeSingle();

    if (batch) {
      // 3.1 Atualização legada
      await supabase
        .from('semen_batches')
        .update({
          used_quantity: (batch.used_quantity || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.semen_batch_id);

      // 3.2 Integração com o novo módulo de Estoque Genético Criogênico
      await deductGeneticInventoryForSemenBatch({
        semenBatchId: data.semen_batch_id,
        quantity: 1,
        referenceType: 'animal_managements',
        referenceId: managementId,
        inseminatorName: data.inseminator_name,
        notes: `Baixa automática IA da matriz em animal_managements`,
      });
    }
  }

  invalidateCache('animal_managements');
  invalidateCache('animals');
  invalidateCache('semen');
  invalidateCache('metrics');
  return { success: true };
}

export async function executeStepDG(
  managementId: string,
  data: {
    animal_id: string;
    executed_at: string;
    pregnancy_status: 'prenha' | 'vazia' | 'inconclusivo';
    ecc_dg?: number | null;
    ia_date?: string | null;
    notes?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  const isOffline = isSystemOffline();
  if (isOffline) {
    await syncEngine.recordOfflineStepDG(managementId, {
      animal_id: data.animal_id,
      executed_at: data.executed_at,
      pregnancy_status: data.pregnancy_status,
      ecc_dg: data.ecc_dg,
      notes: data.notes,
    });
    invalidateCache('animal_managements');
    invalidateCache('animals');
    invalidateCache('lots');
    invalidateCache('metrics');
    return { success: true };
  }

  const supabase = createClient();

  let expectedParturition: string | null = null;

  // Se prenha, calcular previsão de parto: Data IA + 295 dias (RN-06)
  if (data.pregnancy_status === 'prenha') {
    let baseIaDate = data.ia_date;
    if (!baseIaDate) {
      const { data: mgmt } = await supabase
        .from('animal_managements')
        .select('ia_executed_at, ia_date')
        .eq('id', managementId)
        .single();
      baseIaDate = mgmt?.ia_executed_at || mgmt?.ia_date;
    }

    if (baseIaDate) {
      expectedParturition = addDaysToDateString(baseIaDate, 295);
    }
  }

  // 1. Atualizar registro do manejo
  const { error: mgmtError } = await supabase
    .from('animal_managements')
    .update({
      dg_executed_at: data.executed_at,
      pregnancy_status: data.pregnancy_status,
      ecc_dg: data.ecc_dg !== undefined && data.ecc_dg !== null ? Number(data.ecc_dg) : null,
      expected_parturition_date: expectedParturition,
      dg_notes: data.notes || null,
      status: 'concluido',
      updated_at: new Date().toISOString(),
    })
    .eq('id', managementId);

  if (mgmtError) {
    console.error('executeStepDG error:', mgmtError);
    return { success: false, error: mgmtError.message };
  }

  // 2. Atualizar status reprodutivo da matriz
  const newAnimalStatus = data.pregnancy_status === 'prenha' ? 'prenha' : 'vazia';
  await supabase
    .from('animals')
    .update({
      reproductive_status: newAnimalStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.animal_id);

  // 3. Sincronizar status do animal no lote (se participante de lote)
  await supabase
    .from('iatf_lot_animals')
    .update({
      pregnancy_status: data.pregnancy_status,
      ecc_dg: data.ecc_dg !== undefined && data.ecc_dg !== null ? Number(data.ecc_dg) : null,
      expected_parturition_date: expectedParturition,
      updated_at: new Date().toISOString(),
    })
    .eq('animal_id', data.animal_id);

  invalidateCache('animal_managements');
  invalidateCache('animals');
  invalidateCache('lots');
  invalidateCache('metrics');
  return { success: true };
}

export async function recordDirectDG(params: {
  animal_id: string;
  farm_id: string;
  dg_date: string;
  pregnancy_status: 'prenha' | 'vazia' | 'inconclusivo';
  ecc_dg?: number | null;
  season_id?: string | null;
  lot_id?: string | null;
  notes?: string | null;
  expected_parturition_date?: string | null;
  management_id?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  // 1. Se tem management_id fornecido, executa via executeStepDG (que já possui suporte offline completo)
  if (params.management_id) {
    return executeStepDG(params.management_id, {
      animal_id: params.animal_id,
      executed_at: params.dg_date,
      pregnancy_status: params.pregnancy_status,
      ecc_dg: params.ecc_dg,
      notes: params.notes,
    });
  }

  const recordOfflineDGDirect = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const existingMgmts = await offlineDb.animal_managements.where('animal_id').equals(params.animal_id).toArray();
      const activeMgmt = existingMgmts.find((m) => (m as Record<string, unknown>).status === 'em_andamento' || m.step_code !== 'DG');
      if (activeMgmt) {
        return executeStepDG(activeMgmt.id, {
          animal_id: params.animal_id,
          executed_at: params.dg_date,
          pregnancy_status: params.pregnancy_status,
          ecc_dg: params.ecc_dg,
          notes: params.notes,
        });
      }

      const offlineId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'mgmt_' + Date.now();
      await syncEngine.recordOfflineManagement({
        id: offlineId,
        lot_id: params.lot_id || '',
        animal_id: params.animal_id,
        farm_id: params.farm_id,
        step_code: 'DG',
        date: params.dg_date,
        diagnosis_result: params.pregnancy_status === 'inconclusivo' ? 'duvidosa' : params.pregnancy_status,
        notes: params.notes || 'Diagnóstico de Gestação (Modo Curral)',
        created_at: new Date().toISOString(),
      });

      const newAnimalStatus = params.pregnancy_status === 'prenha' ? 'prenha' : 'vazia';
      await offlineDb.animals.update(params.animal_id, {
        reproductive_status: newAnimalStatus,
        updated_at: new Date().toISOString(),
      });
      await syncEngine.enqueueMutation('update', 'animals', params.animal_id, params.farm_id, {
        id: params.animal_id,
        reproductive_status: newAnimalStatus,
        updated_at: new Date().toISOString(),
      });

      invalidateCache('animal_managements');
      invalidateCache('animals');
      invalidateCache('lots');
      invalidateCache('metrics');
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao registrar DG offline';
      return { success: false, error: msg };
    }
  };

  if (isSystemOffline()) {
    return recordOfflineDGDirect();
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return { success: false, error: 'Sessão inválida.' };

  const supabase = createClient();

  // 2. Verificar se existe algum manejo em andamento para este animal
  const { data: activeMgmt, error: activeErr } = await supabase
    .from('animal_managements')
    .select('id, ia_executed_at, ia_date')
    .eq('animal_id', params.animal_id)
    .eq('status', 'em_andamento')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (isNetworkError(activeErr)) {
    syncEngine.markOffline();
    return recordOfflineDGDirect();
  }

  if (activeMgmt) {
    return executeStepDG(activeMgmt.id, {
      animal_id: params.animal_id,
      executed_at: params.dg_date,
      pregnancy_status: params.pregnancy_status,
      ecc_dg: params.ecc_dg,
      ia_date: activeMgmt.ia_executed_at || activeMgmt.ia_date,
      notes: params.notes,
    });
  }

  // 3. Se NÃO existe manejo prévio: cria registro direto de DG
  const { count } = await supabase
    .from('animal_managements')
    .select('id', { count: 'exact', head: true })
    .eq('animal_id', params.animal_id);

  const nextCycle = (count ?? 0) + 1;

  let expectedParturition = params.expected_parturition_date || null;
  if (params.pregnancy_status === 'prenha' && !expectedParturition) {
    expectedParturition = addDaysToDateString(params.dg_date, 250); // Estimativa padrão se gestação confirmada sem data de IA
  }

  const { error: insertError } = await supabase
    .from('animal_managements')
    .insert({
      organization_id: orgId,
      farm_id: params.farm_id,
      animal_id: params.animal_id,
      season_id: params.season_id || null,
      lot_id: params.lot_id || null,
      cycle_number: nextCycle,
      start_date: params.dg_date,
      dg_date: params.dg_date,
      dg_executed_at: params.dg_date,
      pregnancy_status: params.pregnancy_status,
      ecc_dg: params.ecc_dg !== undefined && params.ecc_dg !== null ? Number(params.ecc_dg) : null,
      expected_parturition_date: expectedParturition,
      dg_notes: params.notes || null,
      status: 'concluido',
      notes: params.notes ? `DG direto: ${params.notes}` : 'Diagnóstico de Gestação Direto (Toque)',
    });

  if (insertError) {
    if (isNetworkError(insertError)) {
      syncEngine.markOffline();
      return recordOfflineDGDirect();
    }
    console.error('recordDirectDG error:', insertError);
    return { success: false, error: insertError.message };
  }

  // 4. Atualizar status reprodutivo da fêmea
  const newAnimalStatus = params.pregnancy_status === 'prenha' ? 'prenha' : 'vazia';
  await supabase
    .from('animals')
    .update({
      reproductive_status: newAnimalStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.animal_id);

  // 5. Atualizar iatf_lot_animals se participante de lote
  await supabase
    .from('iatf_lot_animals')
    .update({
      pregnancy_status: params.pregnancy_status,
      ecc_dg: params.ecc_dg !== undefined && params.ecc_dg !== null ? Number(params.ecc_dg) : null,
      expected_parturition_date: expectedParturition,
      updated_at: new Date().toISOString(),
    })
    .eq('animal_id', params.animal_id);

  invalidateCache('animal_managements');
  invalidateCache('animals');
  invalidateCache('lots');
  invalidateCache('metrics');
  return { success: true };
}

export async function deleteAnimalManagement(managementId: string): Promise<boolean> {
  const deleteOffline = async (): Promise<boolean> => {
    try {
      await offlineDb.animal_managements.delete(managementId);
      if (!managementId.startsWith('lot_virtual_')) {
        await syncEngine.enqueueMutation('delete', 'animal_managements', managementId);
      }
      invalidateCache('animal_managements');
      invalidateCache('animals');
      return true;
    } catch {
      return false;
    }
  };

  if (isSystemOffline()) {
    return deleteOffline();
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('animal_managements')
    .delete()
    .eq('id', managementId);

  if (error) {
    if (isNetworkError(error)) {
      syncEngine.markOffline();
      return deleteOffline();
    }
    console.error('deleteAnimalManagement error:', error);
    return false;
  }

  try {
    await offlineDb.animal_managements.delete(managementId);
  } catch {}

  invalidateCache('animal_managements');
  invalidateCache('animals');
  return true;
}

// ============================================================
// RELATÓRIOS POR LOTE E CATEGORIA ANIMAL
// ============================================================

export interface LotCategoryStat {
  lot_id: string;
  lot_code: string;
  lot_name: string | null;
  farm_id: string;
  farm_name: string;
  season_id: string;
  property_name: string | null;
  protocol_name: string;
  ia_date: string | null;
  dg_date: string | null;
  category_id: string;
  category_name: string;
  total_females: number;
  inseminated_qty: number;
  pregnant_qty: number;
  empty_qty: number;
  pregnancy_rate: number;
  avg_ecc_ia: number | null;
  avg_ecc_dg: number | null;
}

export interface CategorySummaryStat {
  category_id: string;
  category_name: string;
  total_females: number;
  inseminated_qty: number;
  pregnant_qty: number;
  empty_qty: number;
  pregnancy_rate: number;
  avg_ecc_ia: number | null;
  lots_count: number;
}

interface RawLotAnimalJoin {
  id: string;
  lot_id: string;
  ecc_ia: number | null;
  ecc_dg: number | null;
  pregnancy_status: string | null;
  bull_id: string | null;
  semen_batch_id: string | null;
  inseminator_name: string | null;
  iatf_lots: {
    id: string;
    code: string;
    name: string | null;
    farm_id: string;
    season_id: string;
    ia_planned_date: string | null;
    dg_planned_date: string | null;
    protocols: { name: string } | null;
    properties: { name: string } | null;
    farms: { id: string; name: string } | null;
  } | null;
  animals: {
    id: string;
    tag_number: string;
    animal_categories: { id: string; name: string } | null;
  } | null;
}

export async function getLotCategoryReports(
  forceRefresh = false,
  farmId?: string,
  seasonId?: string
): Promise<LotCategoryStat[]> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const cacheKey = `lot_cat_report_${orgId}_${farmId || 'all'}_${seasonId || 'all'}`;
  if (!forceRefresh) {
    const cached = getCached<LotCategoryStat[]>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  let query = supabase
    .from('iatf_lot_animals')
    .select(`
      id,
      lot_id,
      ecc_ia,
      ecc_dg,
      pregnancy_status,
      bull_id,
      semen_batch_id,
      inseminator_name,
      iatf_lots!inner (
        id,
        code,
        name,
        farm_id,
        season_id,
        ia_planned_date,
        dg_planned_date,
        protocols (name),
        properties (name),
        farms (id, name)
      ),
      animals!inner (
        id,
        tag_number,
        animal_categories (id, name)
      )
    `);

  if (farmId && farmId !== 'all') {
    query = query.eq('iatf_lots.farm_id', farmId);
  }
  if (seasonId && seasonId !== 'all') {
    query = query.eq('iatf_lots.season_id', seasonId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('getLotCategoryReports error:', error);
    return getCached<LotCategoryStat[]>(cacheKey) ?? [];
  }

  const rawList = (data || []) as unknown as RawLotAnimalJoin[];
  
  // Agrupar por lot_id + category_id
  const groupMap = new Map<string, {
    stat: LotCategoryStat;
    eccIaSum: number;
    eccIaCount: number;
    eccDgSum: number;
    eccDgCount: number;
  }>();

  for (const item of rawList) {
    if (!item.iatf_lots) continue;

    const lot = item.iatf_lots;
    const cat = item.animals?.animal_categories;
    const catId = cat?.id || '00000000-0000-0000-0000-000000000000';
    const catName = cat?.name || 'Não Definida';
    const groupKey = `${lot.id}_${catId}`;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        stat: {
          lot_id: lot.id,
          lot_code: lot.code,
          lot_name: lot.name || null,
          farm_id: lot.farm_id,
          farm_name: lot.farms?.name || 'Fazenda',
          season_id: lot.season_id,
          property_name: lot.properties?.name || null,
          protocol_name: lot.protocols?.name || 'Protocolo Padrão',
          ia_date: lot.ia_planned_date || null,
          dg_date: lot.dg_planned_date || null,
          category_id: catId,
          category_name: catName,
          total_females: 0,
          inseminated_qty: 0,
          pregnant_qty: 0,
          empty_qty: 0,
          pregnancy_rate: 0,
          avg_ecc_ia: null,
          avg_ecc_dg: null,
        },
        eccIaSum: 0,
        eccIaCount: 0,
        eccDgSum: 0,
        eccDgCount: 0,
      });
    }

    const entry = groupMap.get(groupKey)!;
    entry.stat.total_females += 1;

    const isInseminated = !!(item.bull_id || item.semen_batch_id || item.inseminator_name || item.pregnancy_status);
    if (isInseminated) {
      entry.stat.inseminated_qty += 1;
    }

    if (item.pregnancy_status === 'prenha') {
      entry.stat.pregnant_qty += 1;
    } else if (item.pregnancy_status === 'vazia') {
      entry.stat.empty_qty += 1;
    }

    if (item.ecc_ia !== null && item.ecc_ia !== undefined) {
      entry.eccIaSum += Number(item.ecc_ia);
      entry.eccIaCount += 1;
    }

    if (item.ecc_dg !== null && item.ecc_dg !== undefined) {
      entry.eccDgSum += Number(item.ecc_dg);
      entry.eccDgCount += 1;
    }
  }

  const result: LotCategoryStat[] = Array.from(groupMap.values()).map((entry) => {
    const { stat, eccIaSum, eccIaCount, eccDgSum, eccDgCount } = entry;
    const rate = stat.inseminated_qty > 0 ? (stat.pregnant_qty / stat.inseminated_qty) * 100 : 0;
    return {
      ...stat,
      pregnancy_rate: Number(rate.toFixed(2)),
      avg_ecc_ia: eccIaCount > 0 ? Number((eccIaSum / eccIaCount).toFixed(2)) : null,
      avg_ecc_dg: eccDgCount > 0 ? Number((eccDgSum / eccDgCount).toFixed(2)) : null,
    };
  });

  // Ordenar por código do lote e nome da categoria
  result.sort((a, b) => {
    if (a.lot_code !== b.lot_code) return a.lot_code.localeCompare(b.lot_code);
    return a.category_name.localeCompare(b.category_name);
  });

  setCached(cacheKey, result);
  return result;
}

export async function getCategorySummaryReports(
  forceRefresh = false,
  farmId?: string,
  seasonId?: string
): Promise<CategorySummaryStat[]> {
  const lotCatStats = await getLotCategoryReports(forceRefresh, farmId, seasonId);

  const catMap = new Map<string, {
    stat: CategorySummaryStat;
    eccIaSum: number;
    eccIaCount: number;
    uniqueLots: Set<string>;
  }>();

  for (const item of lotCatStats) {
    if (!catMap.has(item.category_name)) {
      catMap.set(item.category_name, {
        stat: {
          category_id: item.category_id,
          category_name: item.category_name,
          total_females: 0,
          inseminated_qty: 0,
          pregnant_qty: 0,
          empty_qty: 0,
          pregnancy_rate: 0,
          avg_ecc_ia: null,
          lots_count: 0,
        },
        eccIaSum: 0,
        eccIaCount: 0,
        uniqueLots: new Set(),
      });
    }

    const entry = catMap.get(item.category_name)!;
    entry.stat.total_females += item.total_females;
    entry.stat.inseminated_qty += item.inseminated_qty;
    entry.stat.pregnant_qty += item.pregnant_qty;
    entry.stat.empty_qty += item.empty_qty;
    entry.uniqueLots.add(item.lot_id);

    if (item.avg_ecc_ia !== null) {
      entry.eccIaSum += item.avg_ecc_ia * item.total_females;
      entry.eccIaCount += item.total_females;
    }
  }

  const result: CategorySummaryStat[] = Array.from(catMap.values()).map((entry) => {
    const { stat, eccIaSum, eccIaCount, uniqueLots } = entry;
    const rate = stat.inseminated_qty > 0 ? (stat.pregnant_qty / stat.inseminated_qty) * 100 : 0;
    return {
      ...stat,
      pregnancy_rate: Number(rate.toFixed(2)),
      avg_ecc_ia: eccIaCount > 0 ? Number((eccIaSum / eccIaCount).toFixed(2)) : null,
      lots_count: uniqueLots.size,
    };
  });

  // Ordenar para colocar Novilha -> Primípara -> Secundípara -> Multípara
  const orderRank: Record<string, number> = {
    'Novilha': 1,
    'Primípara': 2,
    'Secundípara': 3,
    'Multípara': 4,
  };

  result.sort((a, b) => {
    const rankA = orderRank[a.category_name] || 99;
    const rankB = orderRank[b.category_name] || 99;
    if (rankA !== rankB) return rankA - rankB;
    return a.category_name.localeCompare(b.category_name);
  });

  return result;
}

// ============================================================
// GESTÃO DE EQUIPE & MEMBROS DA ORGANIZAÇÃO
// ============================================================

export interface TeamMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'admin' | 'veterinarian' | 'operator' | string;
  display_name: string | null;
  email: string | null;
  status: 'active' | 'inactive' | string;
  created_at: string;
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('organization_members')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getTeamMembers error:', error);
    return [];
  }
  return (data || []) as TeamMember[];
}

export async function createTeamMemberDirect(input: {
  name: string;
  email: string;
  password: string;
  role: string;
}): Promise<{ success: boolean; error?: string; user_id?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { success: false, error: 'Organização ativa não encontrada' };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('create_team_member_user', {
    p_org_id: orgId,
    p_name: input.name,
    p_email: input.email,
    p_password: input.password,
    p_role: input.role,
  });

  if (error) {
    console.error('createTeamMemberDirect error:', error);
    return { success: false, error: error.message };
  }

  if (data && typeof data === 'object') {
    const res = data as { success: boolean; error?: string; user_id?: string };
    if (!res.success) {
      return { success: false, error: res.error || 'Erro ao cadastrar usuário' };
    }
    return { success: true, user_id: res.user_id };
  }

  return { success: true };
}

export async function updateTeamMemberRole(memberId: string, role: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('organization_members')
    .update({ role })
    .eq('id', memberId);
  return !error;
}

export async function toggleTeamMemberStatus(memberId: string, status: 'active' | 'inactive'): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('organization_members')
    .update({ status })
    .eq('id', memberId);
  return !error;
}

// ==========================================
// MANEJOS COLETIVOS EM LOTE (BATCH LOT MANAGEMENT)
// ==========================================

export async function executeBatchLotManagementD0(params: {
  lotId: string;
  executionDate: string;
  responsibleName?: string | null;
  notes?: string | null;
  animalIds: string[];
}): Promise<{ success: boolean; count: number; error?: string }> {
  if (!params.animalIds.length) return { success: true, count: 0 };

  const isOffline = isSystemOffline();
  const todayIso = new Date().toISOString();

  if (isOffline) {
    try {
      const lot = await offlineDb.lots.get(params.lotId);
      const farmId = lot?.farm_id || '';
      const orgId = (lot?.organization_id as string) || (typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : '') || '';

      for (const animalId of params.animalIds) {
        const mgmtId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'mgmt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        await syncEngine.recordOfflineManagementStart({
          id: mgmtId,
          organization_id: orgId,
          farm_id: farmId,
          animal_id: animalId,
          protocol_id: lot?.protocol_id || '',
          season_id: lot?.season_id || null,
          lot_id: params.lotId,
          start_date: params.executionDate,
          d0_executed_at: params.executionDate,
          d0_responsible: params.responsibleName || null,
          d0_notes: params.notes || null,
        });

        await offlineDb.animals.update(animalId, {
          reproductive_status: 'em_protocolo',
          updated_at: todayIso,
        });
      }

      const events = await offlineDb.management_events.where('lot_id').equals(params.lotId).toArray();
      const d0Event = events.find((e) => e.step_code === 'D0');
      if (d0Event) {
        await offlineDb.management_events.update(d0Event.id, {
          status: 'concluido',
          execution_date: params.executionDate,
          animals_worked_count: params.animalIds.length,
          updated_at: todayIso,
        });
        await syncEngine.enqueueMutation('update', 'management_events', d0Event.id, d0Event.farm_id, {
          status: 'concluido',
          execution_date: params.executionDate,
          animals_worked_count: params.animalIds.length,
          updated_at: todayIso,
        });
      }

      if (lot && lot.status === 'planejado') {
        await offlineDb.lots.update(params.lotId, {
          status: 'em_andamento',
          updated_at: todayIso,
        });
        await syncEngine.enqueueMutation('update', 'iatf_lots', params.lotId, farmId, {
          status: 'em_andamento',
          updated_at: todayIso,
        });
      }

      invalidateCache('lot_animals');
      invalidateCache('lots');
      invalidateCache('animal_managements');
      invalidateCache('events');
      invalidateCache('animals');
      invalidateCache('metrics');
      saveLocalLotStepChecks(params.lotId, 'D0', params.animalIds, true);
      return { success: true, count: params.animalIds.length };
    } catch (e: unknown) {
      console.error('executeBatchLotManagementD0 offline error:', e);
      return { success: false, count: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return { success: false, count: 0, error: 'Sessão inválida.' };

  const supabase = createClient();

  const { data: lot, error: lotErr } = await supabase
    .from('iatf_lots')
    .select('id, farm_id, protocol_id, season_id, status')
    .eq('id', params.lotId)
    .single();

  if (lotErr || !lot) {
    return { success: false, count: 0, error: lotErr?.message || 'Lote não encontrado.' };
  }

  const { data: protocolSteps } = await supabase
    .from('protocol_steps')
    .select('code, day_offset')
    .eq('protocol_id', lot.protocol_id)
    .order('step_order', { ascending: true });

  let d9Date: string | null = null;
  let iaDate: string | null = null;
  let dgDate: string | null = null;

  if (protocolSteps && protocolSteps.length > 0) {
    for (const step of protocolSteps) {
      const str = addDaysToDateString(params.executionDate, step.day_offset);
      const codeUpper = step.code.toUpperCase();
      if (codeUpper === 'D8' || codeUpper === 'D9') d9Date = str;
      else if (codeUpper === 'IA') iaDate = str;
      else if (codeUpper === 'DG' || codeUpper === 'DG1') dgDate = str;
    }
  }

  if (!d9Date) d9Date = addDaysToDateString(params.executionDate, 9);
  if (!iaDate) iaDate = addDaysToDateString(params.executionDate, 11);
  if (!dgDate) dgDate = addDaysToDateString(params.executionDate, 44);

  for (const animalId of params.animalIds) {
    const { data: existingMgmt } = await supabase
      .from('animal_managements')
      .select('id')
      .eq('animal_id', animalId)
      .eq('lot_id', params.lotId)
      .maybeSingle();

    if (existingMgmt) {
      await supabase
        .from('animal_managements')
        .update({
          start_date: params.executionDate,
          d0_executed_at: params.executionDate,
          d0_responsible: params.responsibleName || null,
          d0_notes: params.notes || null,
          d9_date: d9Date,
          ia_date: iaDate,
          dg_date: dgDate,
          status: 'em_andamento',
          updated_at: todayIso,
        })
        .eq('id', existingMgmt.id);
    } else {
      const { count: cycleCount } = await supabase
        .from('animal_managements')
        .select('id', { count: 'exact', head: true })
        .eq('animal_id', animalId);

      await supabase
        .from('animal_managements')
        .insert({
          organization_id: orgId,
          farm_id: lot.farm_id,
          animal_id: animalId,
          season_id: lot.season_id,
          protocol_id: lot.protocol_id,
          lot_id: params.lotId,
          cycle_number: (cycleCount ?? 0) + 1,
          start_date: params.executionDate,
          d0_executed_at: params.executionDate,
          d0_responsible: params.responsibleName || null,
          d0_notes: params.notes || null,
          d9_date: d9Date,
          ia_date: iaDate,
          dg_date: dgDate,
          status: 'em_andamento',
          pregnancy_status: 'pendente',
        });
    }

    await supabase
      .from('animals')
      .update({
        reproductive_status: 'em_protocolo',
        updated_at: todayIso,
      })
      .eq('id', animalId);
  }

  await supabase
    .from('management_events')
    .update({
      status: 'concluido',
      execution_date: params.executionDate,
      animals_worked_count: params.animalIds.length,
      responsible_name: params.responsibleName || null,
      updated_at: todayIso,
    })
    .eq('lot_id', params.lotId)
    .eq('step_code', 'D0');

  if (lot.status === 'planejado') {
    await supabase
      .from('iatf_lots')
      .update({ status: 'em_andamento', updated_at: todayIso })
      .eq('id', params.lotId);
  }

  invalidateCache('lot_animals');
  invalidateCache('lots');
  invalidateCache('animal_managements');
  invalidateCache('events');
  invalidateCache('animals');
  invalidateCache('metrics');
  saveLocalLotStepChecks(params.lotId, 'D0', params.animalIds, true);
  return { success: true, count: params.animalIds.length };
}

export async function executeBatchLotManagementD9(params: {
  lotId: string;
  stepCode?: string;
  executionDate: string;
  responsibleName?: string | null;
  notes?: string | null;
  deviceLossAnimalIds?: string[];
  animalIds?: string[];
}): Promise<{ success: boolean; count: number; error?: string }> {
  const isOffline = isSystemOffline();
  const stepCode = params.stepCode || 'D9';
  const lossIds = new Set(params.deviceLossAnimalIds || []);
  const selectedIds = params.animalIds ? new Set(params.animalIds) : null;
  const todayIso = new Date().toISOString();

  if (isOffline) {
    try {
      const allLotAnimals = await offlineDb.lot_animals.where('lot_id').equals(params.lotId).toArray();
      const lotAnimals = selectedIds
        ? allLotAnimals.filter((la) => selectedIds.has(la.animal_id))
        : allLotAnimals;
      for (const la of lotAnimals) {
        const hasLoss = lossIds.has(la.animal_id);
        const mgmts = await offlineDb.animal_managements
          .where('animal_id')
          .equals(la.animal_id)
          .toArray();
        const activeMgmt = mgmts.find((m) => m.lot_id === params.lotId && m.status === 'em_andamento') || mgmts[0];

        if (activeMgmt) {
          await syncEngine.recordOfflineStepD9(activeMgmt.id, {
            executed_at: params.executionDate,
            responsible: params.responsibleName || null,
            device_loss: hasLoss,
            notes: hasLoss ? 'Perda de implante no D9 coletivo' : params.notes || null,
          });
        }
      }

      const events = await offlineDb.management_events.where('lot_id').equals(params.lotId).toArray();
      const targetEvent = events.find((e) => e.step_code === stepCode);
      if (targetEvent) {
        await offlineDb.management_events.update(targetEvent.id, {
          status: 'concluido',
          execution_date: params.executionDate,
          animals_worked_count: Math.max(0, lotAnimals.length - lossIds.size),
          losses_count: lossIds.size,
          updated_at: todayIso,
        });
        await syncEngine.enqueueMutation('update', 'management_events', targetEvent.id, targetEvent.farm_id, {
          status: 'concluido',
          execution_date: params.executionDate,
          animals_worked_count: Math.max(0, lotAnimals.length - lossIds.size),
          losses_count: lossIds.size,
          updated_at: todayIso,
        });
      }

      const workedAnimalIds = lotAnimals.filter((la) => !lossIds.has(la.animal_id)).map((la) => la.animal_id);
      saveLocalLotStepChecks(params.lotId, stepCode, workedAnimalIds, true);
      if (lossIds.size > 0) {
        saveLocalLotStepChecks(params.lotId, stepCode, Array.from(lossIds), false);
      }

      invalidateCache('lot_animals');
      invalidateCache('lots');
      invalidateCache('animal_managements');
      invalidateCache('events');
      invalidateCache('animals');
      invalidateCache('metrics');
      return { success: true, count: lotAnimals.length };
    } catch (e: unknown) {
      console.error('executeBatchLotManagementD9 offline error:', e);
      return { success: false, count: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return { success: false, count: 0, error: 'Sessão inválida.' };

  const supabase = createClient();

  const { data: allLotAnimals, error: laErr } = await supabase
    .from('iatf_lot_animals')
    .select('animal_id')
    .eq('lot_id', params.lotId);

  if (laErr) return { success: false, count: 0, error: laErr.message };

  const lotAnimals = selectedIds
    ? (allLotAnimals || []).filter((la) => selectedIds.has(la.animal_id))
    : (allLotAnimals || []);
  const total = lotAnimals.length;

  for (const la of lotAnimals) {
    const hasLoss = lossIds.has(la.animal_id);

    const { data: mgmts } = await supabase
      .from('animal_managements')
      .select('id')
      .eq('animal_id', la.animal_id)
      .eq('lot_id', params.lotId)
      .order('created_at', { ascending: false })
      .limit(1);

    const mgmtId = mgmts?.[0]?.id;
    if (mgmtId) {
      await supabase
        .from('animal_managements')
        .update({
          d9_executed_at: params.executionDate,
          d9_responsible: params.responsibleName || null,
          d9_device_loss: hasLoss,
          d9_notes: hasLoss ? 'Perda de implante no D9 coletivo' : params.notes || null,
          status: hasLoss ? 'interrompido' : 'em_andamento',
          updated_at: todayIso,
        })
        .eq('id', mgmtId);
    }

    if (hasLoss) {
      await supabase
        .from('animals')
        .update({ reproductive_status: 'vazia', updated_at: todayIso })
        .eq('id', la.animal_id);
    }
  }

  await supabase
    .from('management_events')
    .update({
      status: 'concluido',
      execution_date: params.executionDate,
      animals_worked_count: Math.max(0, total - lossIds.size),
      losses_count: lossIds.size,
      responsible_name: params.responsibleName || null,
      updated_at: todayIso,
    })
    .eq('lot_id', params.lotId)
    .eq('step_code', stepCode);

  const workedAnimalIds = lotAnimals.filter((la) => !lossIds.has(la.animal_id)).map((la) => la.animal_id);
  saveLocalLotStepChecks(params.lotId, stepCode, workedAnimalIds, true);
  if (lossIds.size > 0) {
    saveLocalLotStepChecks(params.lotId, stepCode, Array.from(lossIds), false);
  }

  invalidateCache('lot_animals');
  invalidateCache('lots');
  invalidateCache('animal_managements');
  invalidateCache('events');
  invalidateCache('animals');
  invalidateCache('metrics');
  return { success: true, count: total };
}

export async function executeBatchLotManagementIA(params: {
  lotId: string;
  executionDate: string;
  defaultBullId?: string | null;
  defaultSemenBatchId?: string | null;
  defaultInseminatorName?: string | null;
  defaultEccIa?: number | null;
  notes?: string | null;
  items: {
    animal_id: string;
    lot_animal_id: string;
    bull_id?: string | null;
    semen_batch_id?: string | null;
    inseminator_name?: string | null;
    ecc_ia?: number | null;
    skipped?: boolean;
    notes?: string | null;
  }[];
}): Promise<{ success: boolean; count: number; error?: string }> {
  const isOffline = isSystemOffline();
  const todayIso = new Date().toISOString();
  const activeItems = params.items.filter((it) => !it.skipped);

  if (!activeItems.length) {
    return { success: true, count: 0 };
  }

  if (isOffline) {
    try {
      for (const item of activeItems) {
        const bullId = item.bull_id || params.defaultBullId || '';
        const batchId = item.semen_batch_id || params.defaultSemenBatchId || '';
        const inseminator = item.inseminator_name || params.defaultInseminatorName || null;
        const ecc = item.ecc_ia !== undefined && item.ecc_ia !== null ? item.ecc_ia : (params.defaultEccIa || null);

        const bullObj = bullId ? await offlineDb.bulls.get(bullId) : undefined;
        const batchObj = batchId ? await offlineDb.semen_batches.get(batchId) : undefined;

        await offlineDb.lot_animals.update(item.lot_animal_id, {
          bull_id: bullId || undefined,
          semen_batch_id: batchId || undefined,
          inseminator_name: inseminator || undefined,
          ecc_ia: ecc || undefined,
          bulls: bullObj ? { id: bullObj.id, name: bullObj.name } : undefined,
          semen_batches: batchObj ? { id: batchObj.id, batch_number: batchObj.batch_number } : undefined,
          notes: item.notes || null,
          updated_at: todayIso,
        });

        await syncEngine.enqueueMutation('update', 'iatf_lot_animals', item.lot_animal_id, undefined, {
          id: item.lot_animal_id,
          bull_id: bullId || null,
          semen_batch_id: batchId || null,
          inseminator_name: inseminator || null,
          ecc_ia: ecc || null,
          notes: item.notes || null,
          updated_at: todayIso,
        });

        await offlineDb.animals.update(item.animal_id, {
          reproductive_status: 'inseminada',
          updated_at: todayIso,
        });

        const mgmts = await offlineDb.animal_managements.where('animal_id').equals(item.animal_id).toArray();
        const activeMgmt = mgmts.find((m) => m.lot_id === params.lotId && m.status === 'em_andamento') || mgmts[0];

        if (activeMgmt) {
          await syncEngine.recordOfflineStepIA(activeMgmt.id, {
            animal_id: item.animal_id,
            executed_at: params.executionDate,
            bull_id: bullId,
            semen_batch_id: batchId,
            inseminator_name: inseminator,
            ecc_ia: ecc != null ? String(ecc) : null,
            notes: item.notes || params.notes || null,
          });
        } else if (batchId) {
          await syncEngine.decrementLocalSemenBatch(batchId, 1);
        }
      }

      const workedCountInLot = await offlineDb.lot_animals
        .where('lot_id')
        .equals(params.lotId)
        .filter((la) => Boolean(la.bull_id || la.inseminator_name || la.semen_batch_id))
        .count();
      const iaCountToSave = Math.max(workedCountInLot, activeItems.length);

      const events = await offlineDb.management_events.where('lot_id').equals(params.lotId).toArray();
      const iaEvent = events.find((e) => e.step_code === 'IA');
      if (iaEvent) {
        await offlineDb.management_events.update(iaEvent.id, {
          status: 'concluido',
          execution_date: params.executionDate,
          animals_worked_count: iaCountToSave,
          updated_at: todayIso,
        });
        await syncEngine.enqueueMutation('update', 'management_events', iaEvent.id, iaEvent.farm_id, {
          status: 'concluido',
          execution_date: params.executionDate,
          animals_worked_count: iaCountToSave,
          updated_at: todayIso,
        });
      }

      const skippedItems = params.items.filter((it) => it.skipped);
      saveLocalLotStepChecks(params.lotId, 'IA', activeItems.map((it) => it.animal_id), true);
      if (skippedItems.length > 0) {
        saveLocalLotStepChecks(params.lotId, 'IA', skippedItems.map((it) => it.animal_id), false);
      }

      invalidateCache('lot_animals');
      invalidateCache('lots');
      invalidateCache('animal_managements');
      invalidateCache('events');
      invalidateCache('animals');
      invalidateCache('semen');
      invalidateCache('metrics');
      return { success: true, count: activeItems.length };
    } catch (e: unknown) {
      console.error('executeBatchLotManagementIA offline error:', e);
      return { success: false, count: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return { success: false, count: 0, error: 'Sessão inválida.' };

  const supabase = createClient();
  const batchUsageCount: Record<string, number> = {};

  for (const item of activeItems) {
    const bullId = item.bull_id || params.defaultBullId || null;
    const batchId = item.semen_batch_id || params.defaultSemenBatchId || null;
    const inseminator = item.inseminator_name || params.defaultInseminatorName || null;
    const ecc = item.ecc_ia !== undefined && item.ecc_ia !== null ? item.ecc_ia : (params.defaultEccIa || null);

    if (batchId) {
      batchUsageCount[batchId] = (batchUsageCount[batchId] || 0) + 1;
    }

    // 1. Atualiza iatf_lot_animals
    const { error: laUpdateErr } = await supabase
      .from('iatf_lot_animals')
      .update({
        bull_id: bullId,
        semen_batch_id: batchId,
        inseminator_name: inseminator,
        ecc_ia: ecc != null ? Number(ecc) : null,
        notes: item.notes || null,
        updated_at: todayIso,
      })
      .eq('id', item.lot_animal_id);

    if (laUpdateErr) {
      console.warn('Erro ao atualizar iatf_lot_animals na IA:', laUpdateErr);
    }

    // 1.1 Atualiza imediatamente no IndexedDB local também
    try {
      await offlineDb.lot_animals.update(item.lot_animal_id, {
        bull_id: bullId || undefined,
        semen_batch_id: batchId || undefined,
        inseminator_name: inseminator || undefined,
        ecc_ia: ecc != null ? Number(ecc) : undefined,
        notes: item.notes || null,
        updated_at: todayIso,
      });
    } catch {
      // ignore
    }

    // 2. Atualiza status do animal
    await supabase
      .from('animals')
      .update({
        reproductive_status: 'inseminada',
        updated_at: todayIso,
      })
      .eq('id', item.animal_id);

    // 3. Atualiza registro em animal_managements
    const { data: mgmts } = await supabase
      .from('animal_managements')
      .select('id')
      .eq('animal_id', item.animal_id)
      .eq('lot_id', params.lotId)
      .order('created_at', { ascending: false })
      .limit(1);

    const mgmtId = mgmts?.[0]?.id;
    if (mgmtId) {
      await supabase
        .from('animal_managements')
        .update({
          ia_executed_at: params.executionDate,
          bull_id: bullId,
          semen_batch_id: batchId,
          inseminator_name: inseminator,
          ecc_ia: ecc != null ? Number(ecc) : null,
          ia_notes: item.notes || params.notes || null,
          updated_at: todayIso,
        })
        .eq('id', mgmtId);
    } else {
      await supabase.from('animal_managements').insert({
        organization_id: orgId,
        lot_id: params.lotId,
        animal_id: item.animal_id,
        ia_executed_at: params.executionDate,
        bull_id: bullId,
        semen_batch_id: batchId,
        inseminator_name: inseminator,
        ecc_ia: ecc != null ? Number(ecc) : null,
        ia_notes: item.notes || params.notes || null,
        status: 'em_andamento',
        pregnancy_status: 'pendente',
        created_at: todayIso,
        updated_at: todayIso,
      });
    }
  }

  // 4. Baixa de estoque de sêmen para as partidas utilizadas
  const { data: lotData } = await supabase
    .from('iatf_lots')
    .select('farm_id')
    .eq('id', params.lotId)
    .maybeSingle();

  for (const [bId, count] of Object.entries(batchUsageCount)) {
    const { data: batch } = await supabase
      .from('semen_batches')
      .select('id, batch_number, used_quantity')
      .eq('id', bId)
      .maybeSingle();

    if (batch) {
      // 4.1 Atualização legada
      await supabase
        .from('semen_batches')
        .update({
          used_quantity: (batch.used_quantity || 0) + count,
          updated_at: todayIso,
        })
        .eq('id', bId);

      // 4.2 Baixa integrada no novo módulo criogênico
      await deductGeneticInventoryForSemenBatch({
        semenBatchId: bId,
        quantity: count,
        referenceType: 'iatf_lots',
        referenceId: params.lotId,
        inseminatorName: params.defaultInseminatorName,
        notes: `Baixa em lote de IA (${count} doses) no lote IATF`,
        preferredFarmId: lotData?.farm_id || null,
      });
    }
  }

  // 5. Concluir evento de IA em management_events
  const { count: dbIaWorkedCount } = await supabase
    .from('iatf_lot_animals')
    .select('id', { count: 'exact', head: true })
    .eq('lot_id', params.lotId)
    .not('bull_id', 'is', null);

  const iaCountToSave = Math.max(dbIaWorkedCount || 0, activeItems.length);

  await supabase
    .from('management_events')
    .update({
      status: 'concluido',
      execution_date: params.executionDate,
      animals_worked_count: iaCountToSave,
      responsible_name: params.defaultInseminatorName || null,
      updated_at: todayIso,
    })
    .eq('lot_id', params.lotId)
    .eq('step_code', 'IA');

  const skippedItems = params.items.filter((it) => it.skipped);
  saveLocalLotStepChecks(params.lotId, 'IA', activeItems.map((it) => it.animal_id), true);
  if (skippedItems.length > 0) {
    saveLocalLotStepChecks(params.lotId, 'IA', skippedItems.map((it) => it.animal_id), false);
  }

  invalidateCache('lot_animals');
  invalidateCache('lots');
  invalidateCache('animal_managements');
  invalidateCache('events');
  invalidateCache('animals');
  invalidateCache('semen');
  invalidateCache('metrics');
  return { success: true, count: activeItems.length };
}

export async function executeBatchLotManagementDG(params: {
  lotId: string;
  executionDate: string;
  responsibleName?: string | null;
  notes?: string | null;
  items: {
    animal_id: string;
    lot_animal_id: string;
    pregnancy_status: 'prenha' | 'vazia' | 'inconclusivo';
    ecc_dg?: number | null;
    notes?: string | null;
  }[];
}): Promise<{ success: boolean; count: number; error?: string }> {
  const isOffline = isSystemOffline();
  const todayIso = new Date().toISOString();

  if (!params.items.length) {
    return { success: true, count: 0 };
  }

  if (isOffline) {
    try {
      const lot = await offlineDb.lots.get(params.lotId);
      const baseIaDate = lot?.ia_planned_date;

      for (const item of params.items) {
        const isPregnant = item.pregnancy_status === 'prenha';
        let expectedParturition: string | null = null;
        const validIaDate = typeof baseIaDate === 'string' && baseIaDate ? baseIaDate : null;
        if (isPregnant) {
          expectedParturition = addDaysToDateString(validIaDate || params.executionDate, validIaDate ? 295 : 250);
        }

        const offlineStatus = item.pregnancy_status === 'inconclusivo' ? 'repeticao' : item.pregnancy_status;
        await syncEngine.recordOfflineLotAnimalDG(item.lot_animal_id, offlineStatus, item.ecc_dg || undefined, item.notes || null);
        if (expectedParturition || item.notes) {
          await offlineDb.lot_animals.update(item.lot_animal_id, {
            ...(expectedParturition ? { expected_parturition_date: expectedParturition } : {}),
            ...(item.notes ? { notes: item.notes } : {}),
          });
        }

        await offlineDb.animals.update(item.animal_id, {
          reproductive_status: isPregnant ? 'prenha' : 'vazia',
          updated_at: todayIso,
        });

        const mgmts = await offlineDb.animal_managements.where('animal_id').equals(item.animal_id).toArray();
        const activeMgmt = mgmts.find((m) => m.lot_id === params.lotId) || mgmts[0];

        if (activeMgmt) {
          await syncEngine.recordOfflineStepDG(activeMgmt.id, {
            animal_id: item.animal_id,
            executed_at: params.executionDate,
            pregnancy_status: item.pregnancy_status,
            ecc_dg: item.ecc_dg || undefined,
            notes: item.notes || params.notes || null,
          });
        }
      }

      const dgDoneCount = await offlineDb.lot_animals
        .where('lot_id')
        .equals(params.lotId)
        .filter((la) => la.pregnancy_status === 'prenha' || la.pregnancy_status === 'vazia' || la.pregnancy_status === 'repeticao')
        .count();
      const dgCountToSave = Math.max(dgDoneCount, params.items.length);

      const events = await offlineDb.management_events.where('lot_id').equals(params.lotId).toArray();
      const dgEvent = events.find((e) => e.step_code === 'DG' || e.step_code === 'DG1');
      if (dgEvent) {
        await offlineDb.management_events.update(dgEvent.id, {
          status: 'concluido',
          execution_date: params.executionDate,
          animals_worked_count: dgCountToSave,
          updated_at: todayIso,
        });
        await syncEngine.enqueueMutation('update', 'management_events', dgEvent.id, dgEvent.farm_id, {
          status: 'concluido',
          execution_date: params.executionDate,
          animals_worked_count: dgCountToSave,
          updated_at: todayIso,
        });
      }

      saveLocalLotStepChecks(params.lotId, 'DG', params.items.map((it) => it.animal_id), true);

      invalidateCache('lot_animals');
      invalidateCache('lots');
      invalidateCache('animal_managements');
      invalidateCache('events');
      invalidateCache('animals');
      invalidateCache('metrics');
      return { success: true, count: params.items.length };
    } catch (e: unknown) {
      console.error('executeBatchLotManagementDG offline error:', e);
      return { success: false, count: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return { success: false, count: 0, error: 'Sessão inválida.' };

  const supabase = createClient();

  const { data: lot } = await supabase
    .from('iatf_lots')
    .select('ia_planned_date')
    .eq('id', params.lotId)
    .single();

  const baseIaDate = lot?.ia_planned_date;

  for (const item of params.items) {
    const isPregnant = item.pregnancy_status === 'prenha';
    let expectedParturition: string | null = null;
    if (isPregnant) {
      expectedParturition = addDaysToDateString(baseIaDate || params.executionDate, baseIaDate ? 295 : 250);
    }

    // 1. Atualiza iatf_lot_animals
    await supabase
      .from('iatf_lot_animals')
      .update({
        pregnancy_status: item.pregnancy_status,
        ecc_dg: item.ecc_dg !== undefined && item.ecc_dg !== null ? Number(item.ecc_dg) : null,
        expected_parturition_date: expectedParturition,
        notes: item.notes || null,
        updated_at: todayIso,
      })
      .eq('id', item.lot_animal_id);

    // 2. Atualiza animals
    await supabase
      .from('animals')
      .update({
        reproductive_status: isPregnant ? 'prenha' : 'vazia',
        updated_at: todayIso,
      })
      .eq('id', item.animal_id);

    // 3. Atualiza animal_managements
    const { data: mgmts } = await supabase
      .from('animal_managements')
      .select('id')
      .eq('animal_id', item.animal_id)
      .eq('lot_id', params.lotId)
      .order('created_at', { ascending: false })
      .limit(1);

    const mgmtId = mgmts?.[0]?.id;
    if (mgmtId) {
      await supabase
        .from('animal_managements')
        .update({
          dg_executed_at: params.executionDate,
          pregnancy_status: item.pregnancy_status,
          ecc_dg: item.ecc_dg !== undefined && item.ecc_dg !== null ? Number(item.ecc_dg) : null,
          expected_parturition_date: expectedParturition,
          dg_notes: item.notes || params.notes || null,
          status: 'concluido',
          updated_at: todayIso,
        })
        .eq('id', mgmtId);
    }
  }

  // 4. Concluir evento de DG em management_events
  const { count: dbDgCount } = await supabase
    .from('iatf_lot_animals')
    .select('id', { count: 'exact', head: true })
    .eq('lot_id', params.lotId)
    .in('pregnancy_status', ['prenha', 'vazia']);

  const dgCountToSave = Math.max(dbDgCount || 0, params.items.length);

  await supabase
    .from('management_events')
    .update({
      status: 'concluido',
      execution_date: params.executionDate,
      animals_worked_count: dgCountToSave,
      responsible_name: params.responsibleName || null,
      updated_at: todayIso,
    })
    .eq('lot_id', params.lotId)
    .in('step_code', ['DG', 'DG1']);

  // 5. Se nenhum animal do lote ficou pendente, marca o lote como concluído
  const { data: pendingAnimals } = await supabase
    .from('iatf_lot_animals')
    .select('id')
    .eq('lot_id', params.lotId)
    .eq('pregnancy_status', 'pendente')
    .limit(1);

  if (!pendingAnimals || pendingAnimals.length === 0) {
    await supabase
      .from('iatf_lots')
      .update({ status: 'concluido', updated_at: todayIso })
      .eq('id', params.lotId);
  }

  saveLocalLotStepChecks(params.lotId, 'DG', params.items.map((it) => it.animal_id), true);

  invalidateCache('lot_animals');
  invalidateCache('lots');
  invalidateCache('animal_managements');
  invalidateCache('events');
  invalidateCache('animals');
  invalidateCache('metrics');
  return { success: true, count: params.items.length };
}

// ============================================================
// CHECKBOXES RÁPIDOS DE ETAPAS POR MATRIZ NO LOTE (D0, D7/D8/D9, IA, DG)
// ============================================================

const LOT_STEP_CHECKS_KEY_PREFIX = 'iatf_lot_step_checks_';

export function readLocalLotStepChecks(lotId: string): Record<string, Record<string, boolean>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`${LOT_STEP_CHECKS_KEY_PREFIX}${lotId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLocalLotStepChecks(
  lotId: string,
  stepCode: string,
  animalIds: string[],
  checked: boolean
): Record<string, Record<string, boolean>> {
  if (typeof window === 'undefined') return {};
  try {
    const current = readLocalLotStepChecks(lotId);
    const upperStep = stepCode.toUpperCase();
    for (const animalId of animalIds) {
      if (!current[animalId]) current[animalId] = {};
      current[animalId][upperStep] = checked;
      if (upperStep === 'D7' || upperStep === 'D8' || upperStep === 'D9') {
        current[animalId]['D9'] = checked;
      }
    }
    localStorage.setItem(`${LOT_STEP_CHECKS_KEY_PREFIX}${lotId}`, JSON.stringify(current));
    return current;
  } catch {
    return {};
  }
}

export async function getLotAnimalStepChecks(
  lotId: string,
  lotAnimals?: LotAnimal[],
  events?: ManagementEvent[]
): Promise<Record<string, Record<string, boolean>>> {
  const localMap = readLocalLotStepChecks(lotId);
  const result: Record<string, Record<string, boolean>> = { ...localMap };

  const ensureAnimal = (animalId: string) => {
    if (!result[animalId]) result[animalId] = {};
    return result[animalId];
  };

  try {
    const animalsList = lotAnimals || (await getLotAnimals(lotId));
    const lotEvents = (events || (await getManagementEvents(false))).filter((e) => e.lot_id === lotId);

    const completedStepCodes = new Set(
      lotEvents
        .filter((e) => e.status === 'concluido' || e.status === 'realizado')
        .map((e) => (e.step_code || '').toUpperCase())
    );

    const mgmtsByAnimal = new Map<string, Record<string, unknown>>();
    if (isSystemOffline()) {
      const allMgmts = await offlineDb.animal_managements.toArray();
      for (const m of allMgmts) {
        if (m.lot_id === lotId) {
          mgmtsByAnimal.set(m.animal_id, m as Record<string, unknown>);
        }
      }
    } else {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('animal_managements')
        .select('animal_id, d0_executed_at, d9_executed_at, d9_device_loss, ia_executed_at, dg_executed_at, pregnancy_status')
        .eq('lot_id', lotId);
      if (!error && data) {
        for (const m of data) {
          mgmtsByAnimal.set(m.animal_id as string, m as Record<string, unknown>);
        }
      } else {
        const allMgmts = await offlineDb.animal_managements.toArray();
        for (const m of allMgmts) {
          if (m.lot_id === lotId) {
            mgmtsByAnimal.set(m.animal_id, m as Record<string, unknown>);
          }
        }
      }
    }

    for (const la of animalsList) {
      const animalChecks = ensureAnimal(la.animal_id);
      const mgmt = mgmtsByAnimal.get(la.animal_id);
      const rawLa = la as unknown as Record<string, unknown>;

      // D0
      if (animalChecks['D0'] === undefined) {
        animalChecks['D0'] = Boolean(
          mgmt?.d0_executed_at ||
          completedStepCodes.has('D0')
        );
      }

      // D7 / D8 / D9
      const d9Done = Boolean(
        (mgmt?.d9_executed_at && !mgmt?.d9_device_loss) ||
        completedStepCodes.has('D9') ||
        completedStepCodes.has('D8') ||
        completedStepCodes.has('D7')
      );
      for (const code of ['D7', 'D8', 'D9']) {
        if (animalChecks[code] === undefined) {
          animalChecks[code] = d9Done;
        }
      }

      // IA
      if (animalChecks['IA'] === undefined) {
        animalChecks['IA'] = Boolean(
          mgmt?.ia_executed_at ||
          la.bulls?.name ||
          rawLa.bull_id ||
          la.inseminator_name ||
          la.ecc_ia != null ||
          la.animals?.reproductive_status === 'inseminada' ||
          la.animals?.reproductive_status === 'prenha' ||
          completedStepCodes.has('IA')
        );
      }

      // DG
      if (animalChecks['DG'] === undefined) {
        animalChecks['DG'] = Boolean(
          mgmt?.dg_executed_at ||
          la.pregnancy_status === 'prenha' ||
          la.pregnancy_status === 'vazia' ||
          completedStepCodes.has('DG') ||
          completedStepCodes.has('DG1')
        );
      }
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(`${LOT_STEP_CHECKS_KEY_PREFIX}${lotId}`, JSON.stringify(result));
    }
  } catch (e) {
    console.warn('getLotAnimalStepChecks error:', e);
  }

  return result;
}

export async function toggleLotAnimalStepCheck(params: {
  lotId: string;
  stepCode: string;
  animalIds: string[];
  checked: boolean;
  totalAnimalsInLot?: number;
  checkedCountInStep?: number;
  executionDate?: string;
  responsibleName?: string | null;
}): Promise<{ success: boolean }> {
  const upperStep = params.stepCode.toUpperCase();
  const execDate = params.executionDate || getTodayDateString();
  const todayIso = new Date().toISOString();

  // 1. Persistir imediatamente no mapa local
  const updatedMap = saveLocalLotStepChecks(params.lotId, upperStep, params.animalIds, params.checked);

  // Contar quantos animais estão marcados nesta etapa
  const totalChecked =
    params.checkedCountInStep !== undefined
      ? params.checkedCountInStep
      : Object.values(updatedMap).filter((steps) => Boolean(steps[upperStep])).length;

  const isOffline = isSystemOffline();

  try {
    if (isOffline) {
      const lot = await offlineDb.lots.get(params.lotId);
      const baseIaDate = (lot?.ia_planned_date as string | undefined) || execDate;

      for (const animalId of params.animalIds) {
        const la = await offlineDb.lot_animals
          .where('lot_id')
          .equals(params.lotId)
          .and((item) => item.animal_id === animalId)
          .first();

        if (upperStep === 'D0') {
          await offlineDb.animals.update(animalId, {
            reproductive_status: params.checked ? 'em_protocolo' : 'vazia',
            updated_at: todayIso,
          });
        } else if (upperStep === 'IA') {
          await offlineDb.animals.update(animalId, {
            reproductive_status: params.checked ? 'inseminada' : 'em_protocolo',
            updated_at: todayIso,
          });
          if (la && params.checked && params.responsibleName && !la.inseminator_name) {
            await offlineDb.lot_animals.update(la.id, {
              inseminator_name: params.responsibleName,
              updated_at: todayIso,
            });
          }
        } else if (upperStep === 'DG' || upperStep === 'DG1') {
          const newPregStatus = params.checked ? 'prenha' : 'pendente';
          const expectedParturition = params.checked ? addDaysToDateString(baseIaDate, 295) : null;
          if (la) {
            await offlineDb.lot_animals.update(la.id, {
              pregnancy_status: newPregStatus,
              is_pregnant: params.checked ? true : null,
              expected_parturition_date: expectedParturition,
              updated_at: todayIso,
            });
            await syncEngine.enqueueMutation('update', 'iatf_lot_animals', la.id, la.farm_id, {
              id: la.id,
              pregnancy_status: newPregStatus,
              expected_parturition_date: expectedParturition,
              updated_at: todayIso,
            });
          }
          await offlineDb.animals.update(animalId, {
            reproductive_status: params.checked ? 'prenha' : 'inseminada',
            updated_at: todayIso,
          });
        }
      }

      const events = await offlineDb.management_events.where('lot_id').equals(params.lotId).toArray();
      const targetEvent = events.find((e) => {
        const c = (e.step_code || '').toUpperCase();
        if (upperStep === 'D9' || upperStep === 'D8' || upperStep === 'D7') {
          return c === upperStep || c === 'D9' || c === 'D8' || c === 'D7';
        }
        if (upperStep === 'DG' || upperStep === 'DG1') {
          return c === 'DG' || c === 'DG1';
        }
        return c === upperStep;
      });

      if (targetEvent) {
        const newEventStatus = totalChecked > 0 ? 'concluido' : 'pendente';
        await offlineDb.management_events.update(targetEvent.id, {
          status: newEventStatus,
          execution_date: totalChecked > 0 ? execDate : null,
          animals_worked_count: totalChecked,
          updated_at: todayIso,
        });
        await syncEngine.enqueueMutation('update', 'management_events', targetEvent.id, targetEvent.farm_id, {
          status: newEventStatus,
          execution_date: totalChecked > 0 ? execDate : null,
          animals_worked_count: totalChecked,
          updated_at: todayIso,
        });
      }

      invalidateCache('lot_animals');
      invalidateCache('lots');
      invalidateCache('animal_managements');
      invalidateCache('events');
      invalidateCache('animals');
      invalidateCache('metrics');
      return { success: true };
    }

    // Modo Online
    const supabase = createClient();

    if (upperStep === 'D0') {
      if (params.checked) {
        await executeBatchLotManagementD0({
          lotId: params.lotId,
          executionDate: execDate,
          responsibleName: params.responsibleName || null,
          animalIds: params.animalIds,
        });
      } else {
        await supabase
          .from('animal_managements')
          .update({ d0_executed_at: null, updated_at: todayIso })
          .eq('lot_id', params.lotId)
          .in('animal_id', params.animalIds);
      }
    } else if (upperStep === 'D7' || upperStep === 'D8' || upperStep === 'D9') {
      if (params.checked) {
        await executeBatchLotManagementD9({
          lotId: params.lotId,
          stepCode: upperStep,
          executionDate: execDate,
          responsibleName: params.responsibleName || null,
          animalIds: params.animalIds,
        });
      } else {
        await supabase
          .from('animal_managements')
          .update({ d9_executed_at: null, updated_at: todayIso })
          .eq('lot_id', params.lotId)
          .in('animal_id', params.animalIds);
      }
    } else if (upperStep === 'IA') {
      await supabase
        .from('animal_managements')
        .update({
          ia_executed_at: params.checked ? execDate : null,
          ...(params.checked && params.responsibleName ? { inseminator_name: params.responsibleName } : {}),
          updated_at: todayIso,
        })
        .eq('lot_id', params.lotId)
        .in('animal_id', params.animalIds);

      await supabase
        .from('animals')
        .update({
          reproductive_status: params.checked ? 'inseminada' : 'em_protocolo',
          updated_at: todayIso,
        })
        .in('id', params.animalIds);

      if (params.checked && params.responsibleName) {
        await supabase
          .from('iatf_lot_animals')
          .update({ inseminator_name: params.responsibleName, updated_at: todayIso })
          .eq('lot_id', params.lotId)
          .in('animal_id', params.animalIds)
          .is('inseminator_name', null);
      }
    } else if (upperStep === 'DG' || upperStep === 'DG1') {
      const { data: lot } = await supabase
        .from('iatf_lots')
        .select('ia_planned_date')
        .eq('id', params.lotId)
        .maybeSingle();
      const baseIaDate = lot?.ia_planned_date || execDate;
      const expectedParturition = params.checked ? addDaysToDateString(baseIaDate, 295) : null;
      const newPregStatus = params.checked ? 'prenha' : 'pendente';

      await supabase
        .from('iatf_lot_animals')
        .update({
          pregnancy_status: newPregStatus,
          expected_parturition_date: expectedParturition,
          updated_at: todayIso,
        })
        .eq('lot_id', params.lotId)
        .in('animal_id', params.animalIds);

      await supabase
        .from('animal_managements')
        .update({
          dg_executed_at: params.checked ? execDate : null,
          pregnancy_status: newPregStatus,
          expected_parturition_date: expectedParturition,
          status: params.checked ? 'concluido' : 'em_andamento',
          updated_at: todayIso,
        })
        .eq('lot_id', params.lotId)
        .in('animal_id', params.animalIds);

      await supabase
        .from('animals')
        .update({
          reproductive_status: params.checked ? 'prenha' : 'inseminada',
          updated_at: todayIso,
        })
        .in('id', params.animalIds);
    }

    const newEventStatus = totalChecked > 0 ? 'concluido' : 'pendente';
    const stepCodesToMatch =
      upperStep === 'D9' || upperStep === 'D8' || upperStep === 'D7'
        ? [upperStep, 'D9', 'D8', 'D7']
        : upperStep === 'DG' || upperStep === 'DG1'
        ? ['DG', 'DG1']
        : [upperStep];

    await supabase
      .from('management_events')
      .update({
        status: newEventStatus,
        execution_date: totalChecked > 0 ? execDate : null,
        animals_worked_count: totalChecked,
        updated_at: todayIso,
      })
      .eq('lot_id', params.lotId)
      .in('step_code', stepCodesToMatch);

    invalidateCache('lot_animals');
    invalidateCache('lots');
    invalidateCache('animal_managements');
    invalidateCache('events');
    invalidateCache('animals');
    invalidateCache('metrics');
    return { success: true };
  } catch (e) {
    console.warn('toggleLotAnimalStepCheck fallback:', e);
    return { success: true };
  }
}
