import { createClient } from './supabase/client';
import { offlineDb } from './offline/offlineDb';
import { syncEngine } from './offline/syncEngine';

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

export async function getCurrentOrgId(): Promise<string | null> {
  const now = Date.now();
  if (cachedOrgId && now - cachedOrgIdTimestamp < CACHE_TTL_MS) {
    return cachedOrgId;
  }

  const supabase = createClient();
  // getSession() lê a sessão localmente em milissegundos sem fazer chamada remota à API de auth
  const { data: { session } } = await supabase.auth.getSession();
  let user = session?.user ?? null;

  if (!user) {
    const { data: userData } = await supabase.auth.getUser();
    user = userData?.user ?? null;
  }

  if (!user) return null;

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (member?.organization_id) {
    cachedOrgId = member.organization_id;
    cachedOrgIdTimestamp = now;
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

  const supabase = createClient();
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, code, document_number')
    .eq('id', orgId)
    .maybeSingle();

  if (orgErr || !org) {
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
  protocol_name: string | null;
  farm_name: string | null;
  worked_qty: number;
  inseminated_qty: number;
  pregnancies: number;
  empty_count: number;
  pregnancy_rate: number;
  pending_dg: number;
}

export async function getLots(forceRefresh = false, farmId?: string): Promise<LotStat[]> {
  const isOffline = typeof window !== 'undefined' && !navigator.onLine;
  if (isOffline) {
    try {
      let offlineLots = await offlineDb.lots.toArray();
      if (farmId && farmId !== 'all') {
        offlineLots = offlineLots.filter((l) => l.farm_id === farmId);
      }
      if (offlineLots.length > 0) {
        return offlineLots.map((l) => ({
          id: l.id,
          code: l.code || 'Lote',
          farm_id: l.farm_id,
          season_id: l.season_id,
          season_name: null,
          start_date: (l.start_date as string) || new Date().toISOString().slice(0, 10),
          ia_planned_date: null,
          dg_planned_date: null,
          responsible_name: null,
          status: (l.status as string) || 'ativo',
          property_name: null,
          protocol_name: null,
          farm_name: null,
          worked_qty: (l.females_count as number) || 0,
          inseminated_qty: (l.inseminated_count as number) || 0,
          pregnancies: (l.pregnant_count as number) || 0,
          empty_count: 0,
          pregnancy_rate: 0,
          pending_dg: 0,
        }));
      }
    } catch (e) {
      console.warn('Falha ao carregar lotes offline:', e);
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

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
      const offlineLots = await offlineDb.lots.toArray();
      if (offlineLots.length > 0) {
        return offlineLots.map((l) => ({
          id: l.id,
          code: l.code || 'Lote',
          farm_id: l.farm_id,
          season_id: l.season_id,
          season_name: null,
          start_date: (l.start_date as string) || new Date().toISOString().slice(0, 10),
          ia_planned_date: null,
          dg_planned_date: null,
          responsible_name: null,
          status: (l.status as string) || 'ativo',
          property_name: null,
          protocol_name: null,
          farm_name: null,
          worked_qty: (l.females_count as number) || 0,
          inseminated_qty: (l.inseminated_count as number) || 0,
          pregnancies: (l.pregnant_count as number) || 0,
          empty_count: 0,
          pregnancy_rate: 0,
          pending_dg: 0,
        }));
      }
    } catch {
      // ignore
    }
    return getCached<LotStat[]>(cacheKey) ?? [];
  }
  const result = (data ?? []) as LotStat[];
  setCached(cacheKey, result);
  return result;
}

export async function getLotById(id: string, forceRefresh = false): Promise<LotStat | null> {
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
    return getCached<LotAnimal[]>(cacheKey) ?? [];
  }
  const result = (data ?? []) as unknown as LotAnimal[];
  setCached(cacheKey, result);
  return result;
}

export async function updateAnimalDG(
  lotAnimalId: string,
  pregnancyStatus: 'prenha' | 'vazia' | 'repeticao',
  eccDg?: number
): Promise<boolean> {
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
  invalidateCache('metrics');
  return { success: true, count: data?.length ?? records.length };
}

export async function removeAnimalFromLot(lotAnimalId: string): Promise<boolean> {
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
): Promise<{ success: boolean; error?: string }> {
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

  const cleanTag = animal.tag_number.trim();

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

    return {
      success: false,
      error: `Já existe uma matriz cadastrada com o brinco "${cleanTag}" nesta fazenda. Use a aba "Selecionar Existentes" para vinculá-la a este lote.`,
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

  invalidateCache('lot_animals');
  invalidateCache('lots');
  invalidateCache('animals');
  invalidateCache('metrics');
  return { success: true };
}

// ============================================================
// MANAGEMENT EVENTS (AGENDA)
// ============================================================

export interface ManagementEvent {
  id: string;
  lot_id: string;
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
  iatf_lots: {
    code: string;
    name?: string | null;
    farm_id?: string;
    farms?: { id: string; name: string } | null;
    properties?: { name: string } | null;
  } | null;
}

export async function getManagementEvents(forceRefresh = false, farmId?: string): Promise<ManagementEvent[]> {
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
      iatf_lots!inner (
        code,
        name,
        farm_id,
        properties (name),
        farms (id, name)
      )
    `)
    .eq('organization_id', orgId);

  if (farmId && farmId !== 'all') {
    query = query.eq('iatf_lots.farm_id', farmId);
  }

  const { data, error } = await query.order('planned_date', { ascending: true });

  if (error) {
    console.error('getManagementEvents error:', error);
    return getCached<ManagementEvent[]>(cacheKey) ?? [];
  }
  const result = (data ?? []) as unknown as ManagementEvent[];
  setCached(cacheKey, result);
  return result;
}

export async function completeManagementEvent(
  eventId: string,
  animalsWorked: number,
  lossesCount: number = 0
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('management_events')
    .update({
      status: 'concluido',
      execution_date: new Date().toISOString().split('T')[0],
      animals_worked_count: animalsWorked,
      losses_count: lossesCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId);

  if (error) {
    console.error('completeManagementEvent error:', error);
    return false;
  }

  invalidateCache('events');
  invalidateCache('lots');
  invalidateCache('metrics');
  return true;
}

export async function insertManagementEvent(event: {
  lot_id: string;
  step_code: string;
  planned_date: string;
  start_time?: string | null;
  end_time?: string | null;
  responsible_name?: string | null;
  notes?: string | null;
  status?: string;
}): Promise<boolean> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return false;

  const supabase = createClient();
  const { error } = await supabase
    .from('management_events')
    .insert({
      organization_id: orgId,
      lot_id: event.lot_id,
      step_code: event.step_code,
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

  invalidateCache('events');
  return true;
}

export async function deleteManagementEvent(eventId: string): Promise<boolean> {
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

  invalidateCache('events');
  return !!(data && data.length > 0);
}

export async function updateManagementEventDate(
  eventId: string,
  newPlannedDate: string,
  startTime?: string | null,
  endTime?: string | null
): Promise<boolean> {
  const supabase = createClient();
  const updateData: Record<string, unknown> = {
    planned_date: newPlannedDate,
    updated_at: new Date().toISOString(),
  };
  if (startTime !== undefined) updateData.start_time = startTime;
  if (endTime !== undefined) updateData.end_time = endTime;

  const { error } = await supabase
    .from('management_events')
    .update(updateData)
    .eq('id', eventId);

  if (error) {
    console.error('updateManagementEventDate error:', error);
    return false;
  }

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
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

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
    return getCached<SemenBatch[]>(cacheKey) ?? [];
  }
  const result = (data ?? []) as unknown as SemenBatch[];
  setCached(cacheKey, result);
  return result;
}

export async function insertSemenBatch(batch: {
  bull_id: string;
  batch_number: string;
  supplier_central?: string;
  initial_quantity: number;
}): Promise<boolean> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return false;

  const supabase = createClient();
  const { error } = await supabase.from('semen_batches').insert({
    ...batch,
    organization_id: orgId,
  });
  if (error) {
    console.error('insertSemenBatch error:', error);
    return false;
  }

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
  breeds: { name: string } | null;
  animal_categories: { name: string } | null;
  properties: { name: string } | null;
  farms: { name: string } | null;
}

export async function getAnimals(limit = 50, forceRefresh = false, farmId?: string): Promise<Animal[]> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const cacheKey = `animals_${orgId}_${farmId || 'all'}_${limit}`;
  if (!forceRefresh) {
    const cached = getCached<Animal[]>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  let query = supabase
    .from('animals')
    .select('*, breeds(name), animal_categories(name), properties(name), farms(name)')
    .eq('organization_id', orgId)
    .eq('status', 'active');

  if (farmId && farmId !== 'all') {
    query = query.eq('farm_id', farmId);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('getAnimals error:', error);
    return getCached<Animal[]>(cacheKey) ?? [];
  }
  const result = (data ?? []) as unknown as Animal[];
  setCached(cacheKey, result);
  return result;
}

export async function searchAnimals(query: string, farmId?: string): Promise<Animal[]> {
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

  const { data, error } = await q.limit(20);

  if (error) {
    console.error('searchAnimals error:', error);
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
  const orgId = await getCurrentOrgId();
  if (!orgId) return { success: false, error: 'Organização não identificada.' };

  const supabase = createClient();
  const { error } = await supabase.from('animals').insert({
    organization_id: orgId,
    farm_id: animal.farm_id,
    property_id: animal.property_id || null,
    tag_number: animal.tag_number.trim(),
    rfid_number: animal.rfid_number ? animal.rfid_number.trim() : null,
    breed_id: animal.breed_id || null,
    category_id: animal.category_id || null,
    reproductive_status: animal.reproductive_status || 'vazia',
    birth_date: animal.birth_date || null,
    sex: 'F',
    status: 'active',
  });

  if (error) {
    console.error('createAnimal error:', error.message, error.details, error.code);
    if (error.code === '23505' || error.message?.includes('unique constraint') || error.message?.includes('duplicate key')) {
      return {
        success: false,
        error: `Já existe uma matriz cadastrada com o brinco "${animal.tag_number.trim()}" nesta fazenda.`,
      };
    }
    return { success: false, error: error.message };
  }

  invalidateCache('animals');
  invalidateCache('metrics');
  return { success: true };
}

export async function getAnimalHistory(animalId: string) {
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

  if (lotRes.error) {
    console.error('getAnimalHistory lot error:', lotRes.error);
  }
  if (mgmtRes.error) {
    console.error('getAnimalHistory mgmt error:', mgmtRes.error);
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

  const supabase = createClient();
  const { data, error } = await supabase
    .from('organization_metrics')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) {
    console.error('getOrgMetrics error:', error);
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
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

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
    return getCached<Protocol[]>(cacheKey) ?? [];
  }
  const result = (data ?? []) as unknown as Protocol[];
  setCached(cacheKey, result);
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
  const orgId = await getCurrentOrgId();
  if (!orgId) return false;

  const supabase = createClient();
  const { data: created, error: protoErr } = await supabase
    .from('protocols')
    .insert({
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

  const stepsToInsert = protocol.steps.map((step, idx) => ({
    protocol_id: created.id,
    step_order: idx + 1,
    code: step.code.trim(),
    name: step.name.trim(),
    day_offset: Number(step.day_offset) || 0,
    dosage_instruction: step.dosage_instruction?.trim() || null,
  }));

  const { error: stepsErr } = await supabase
    .from('protocol_steps')
    .insert(stepsToInsert);

  if (stepsErr) {
    console.error('createProtocol steps error:', stepsErr);
    return false;
  }

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
  const orgId = await getCurrentOrgId();
  if (!orgId) return false;

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
    const { error: delErr } = await supabase
      .from('protocol_steps')
      .delete()
      .eq('protocol_id', id);

    if (delErr) {
      console.error('updateProtocol delete steps error:', delErr);
      return false;
    }

    const stepsToInsert = protocol.steps.map((step, idx) => ({
      protocol_id: id,
      step_order: idx + 1,
      code: step.code.trim(),
      name: step.name.trim(),
      day_offset: Number(step.day_offset) || 0,
      dosage_instruction: step.dosage_instruction?.trim() || null,
    }));

    const { error: stepsErr } = await supabase
      .from('protocol_steps')
      .insert(stepsToInsert);

    if (stepsErr) {
      console.error('updateProtocol insert steps error:', stepsErr);
      return false;
    }
  }

  try {
    const existing = await offlineDb.protocols.get(id);
    if (existing) {
      await offlineDb.protocols.update(id, {
        name: protocol.name.trim(),
        description: protocol.description?.trim() || undefined,
        updated_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn('Offline protocol update warning:', err);
  }

  invalidateCache('protocols');
  return true;
}

export async function deleteProtocol(id: string): Promise<{ success: boolean; error?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { success: false, error: 'Sessão inválida' };

  const supabase = createClient();

  // 1. Verificar se existem lotes de IATF vinculados a este protocolo
  const { count: lotsCount, error: countErr } = await supabase
    .from('iatf_lots')
    .select('id', { count: 'exact', head: true })
    .eq('protocol_id', id);

  if (countErr) {
    console.error('deleteProtocol check lots error:', countErr);
  }

  if (lotsCount && lotsCount > 0) {
    return {
      success: false,
      error: `Não é possível excluir este protocolo pois existem ${lotsCount} lote(s) de IATF vinculados a ele. Você pode arquivá-lo para preservar os históricos operacionais.`,
    };
  }

  // 2. Excluir etapas do protocolo
  await supabase
    .from('protocol_steps')
    .delete()
    .eq('protocol_id', id);

  // 3. Excluir protocolo
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
  } catch (e) {
    console.warn('Offline protocol delete warning:', e);
  }

  invalidateCache('protocols');
  return { success: true };
}

export async function toggleProtocolStatus(id: string, newStatus: 'active' | 'archived'): Promise<boolean> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return false;

  const supabase = createClient();
  const { error } = await supabase
    .from('protocols')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    console.error('toggleProtocolStatus error:', error);
    return false;
  }

  invalidateCache('protocols');
  return true;
}

// ============================================================
// BULLS
// ============================================================

export interface Bull {
  id: string;
  name: string;
  code: string | null;
  owner_central: string | null;
  status: string;
}

export async function getBulls(forceRefresh = false): Promise<Bull[]> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const cacheKey = `bulls_${orgId}`;
  if (!forceRefresh) {
    const cached = getCached<Bull[]>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('bulls')
    .select('*')
    .eq('organization_id', orgId)
    .order('name');

  if (error) {
    console.error('getBulls error:', error);
    return getCached<Bull[]>(cacheKey) ?? [];
  }
  const result = (data ?? []) as Bull[];
  setCached(cacheKey, result);
  return result;
}

export async function createBull(bull: {
  name: string;
  code?: string;
  owner_central?: string;
  registration_number?: string;
  breed_id?: string;
}): Promise<boolean> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return false;

  const supabase = createClient();
  const { error } = await supabase.from('bulls').insert({
    ...bull,
    organization_id: orgId,
    status: 'active',
  });
  if (error) {
    console.error('createBull error:', error);
    return false;
  }

  invalidateCache('bulls');
  return true;
}

// ============================================================
// CREATE LOT
// ============================================================

export async function createLot(lot: {
  property_id: string;
  protocol_id: string;
  code: string;
  start_date: string;
  responsible_name: string;
  season_id?: string;
}): Promise<string | null> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return null;

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

  // Fallback: pick any available season
  if (!targetSeasonId) {
    const { data: anySeason } = await supabase
      .from('reproductive_seasons')
      .select('id')
      .eq('organization_id', orgId)
      .limit(1)
      .maybeSingle();

    targetSeasonId = anySeason?.id;
  }

  // If none exists, create a default active season
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

  if (!targetSeasonId) return null;

  // Fetch protocol steps to calculate dates
  const { data: proto } = await supabase
    .from('protocols')
    .select('protocol_steps(*)')
    .eq('id', lot.protocol_id)
    .single() as { data: { protocol_steps: { code: string; name?: string; day_offset: number }[] } | null };

  const steps = proto?.protocol_steps ?? [];
  const d0 = new Date(lot.start_date);
  const addDays = (d: Date, n: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r.toISOString().split('T')[0];
  };

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
      ia_planned_date: iaStep ? addDays(d0, iaStep.day_offset) : null,
      dg_planned_date: dgStep ? addDays(d0, dgStep.day_offset) : null,
      responsible_name: lot.responsible_name,
      status: 'planejado',
    })
    .select('id')
    .single();

  if (error) {
    console.error('createLot error:', error);
    return null;
  }

  // Auto-generate management events
  for (const step of steps) {
    await supabase.from('management_events').insert({
      organization_id: orgId,
      lot_id: inserted.id,
      step_code: step.code,
      step_name: step.name ?? step.code,
      planned_date: addDays(d0, step.day_offset),
      responsible_name: lot.responsible_name,
      status: 'pendente',
    });
  }

  invalidateCache('lots');
  invalidateCache('events');
  invalidateCache('metrics');
  return inserted.id;
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

  invalidateCache('lots');
  invalidateCache('events');
  invalidateCache('metrics');
  return { success: true };
}

// ============================================================
// DELETE LOT
// ============================================================

export async function deleteLot(
  lotId: string
): Promise<{ success: boolean; error?: string }> {
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

    // 5. Invalidar caches
    invalidateCache('lots');
    invalidateCache('events');
    invalidateCache('lot_animals');
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
  const isOffline = typeof window !== 'undefined' && !navigator.onLine;
  if (isOffline) {
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
    } catch (e) {
      console.warn('Falha ao carregar fazendas offline:', e);
    }
  }

  const now = Date.now();
  if (!forceRefresh && cachedFarms && !includeFrozen && now - cachedFarmsTimestamp < CACHE_TTL_MS) {
    return cachedFarms;
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

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
  return farmsList;
}

export async function freezeFarm(farmId: string): Promise<boolean> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return false;
  const supabase = createClient();
  const { error } = await supabase.rpc('freeze_farm', { p_farm_id: farmId, p_org_id: orgId });
  if (error) {
    console.error('freezeFarm rpc error, attempting direct update:', error);
    const { error: err2 } = await supabase
      .from('farms')
      .update({ status: 'frozen' })
      .eq('id', farmId)
      .eq('organization_id', orgId);
    if (err2) {
      console.error('freezeFarm direct update error:', err2);
      return false;
    }
  }
  cachedFarms = null;
  return true;
}

export async function unfreezeFarm(farmId: string): Promise<boolean> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return false;
  const supabase = createClient();
  const { error } = await supabase.rpc('unfreeze_farm', { p_farm_id: farmId, p_org_id: orgId });
  if (error) {
    console.error('unfreezeFarm rpc error, attempting direct update:', error);
    const { error: err2 } = await supabase
      .from('farms')
      .update({ status: 'active' })
      .eq('id', farmId)
      .eq('organization_id', orgId);
    if (err2) {
      console.error('unfreezeFarm direct update error:', err2);
      return false;
    }
  }
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
  const orgId = await getCurrentOrgId();
  if (!orgId) return null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from('farms')
    .insert({ ...farm, organization_id: orgId })
    .select('id')
    .single();

  if (error) {
    console.error('createFarm error:', error);
    return null;
  }

  clearFarmsCache();
  return data?.id ?? null;
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
  const orgId = await getCurrentOrgId();
  if (!orgId) return false;

  const supabase = createClient();
  const { error } = await supabase
    .from('farms')
    .update({
      name: farm.name.trim(),
      owner_name: farm.owner_name?.trim() || null,
      technical_responsible: farm.technical_responsible?.trim() || null,
      city: farm.city?.trim() || null,
      state: farm.state?.trim() ? farm.state.trim().toUpperCase() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    console.error('updateFarm error:', error);
    return false;
  }

  try {
    const existing = await offlineDb.farms.get(id);
    if (existing) {
      await offlineDb.farms.update(id, {
        name: farm.name.trim(),
        owner_name: farm.owner_name?.trim() || null,
        technical_responsible: farm.technical_responsible?.trim() || null,
        city: farm.city?.trim() || null,
        state: farm.state?.trim() ? farm.state.trim().toUpperCase() : null,
        updated_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn('Offline farm update warning:', err);
  }

  clearFarmsCache();
  return true;
}

export async function deleteFarm(id: string): Promise<{ success: boolean; error?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { success: false, error: 'Sessão inválida' };

  const supabase = createClient();

  // 1. Verificar se existem lotes vinculados à fazenda
  const { count: lotsCount, error: lotsErr } = await supabase
    .from('iatf_lots')
    .select('id', { count: 'exact', head: true })
    .eq('farm_id', id);

  if (!lotsErr && lotsCount && lotsCount > 0) {
    return {
      success: false,
      error: `Não é possível excluir esta fazenda pois existem ${lotsCount} lote(s) de IATF vinculados a ela. Você pode congelá-la para desativar sem perder os dados.`,
    };
  }

  // 2. Verificar se existem animais vinculados à fazenda
  const { count: animalsCount, error: animalsErr } = await supabase
    .from('animals')
    .select('id', { count: 'exact', head: true })
    .eq('farm_id', id);

  if (!animalsErr && animalsCount && animalsCount > 0) {
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
    return getCached<Property[]>(cacheKey) ?? [];
  }
  const result = (data ?? []) as Property[];
  setCached(cacheKey, result);
  return result;
}

export async function createProperty(prop: {
  farm_id: string;
  name: string;
  code?: string;
}): Promise<boolean> {
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
  const orgId = await getCurrentOrgId();
  if (!orgId) return false;

  const supabase = createClient();
  const { error } = await supabase
    .from('properties')
    .update({
      name: prop.name.trim(),
      code: prop.code?.trim() || null,
    })
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    console.error('updateProperty error:', error);
    return false;
  }

  invalidateCache('properties');
  clearFarmsCache();
  return true;
}

export async function deleteProperty(id: string): Promise<{ success: boolean; error?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { success: false, error: 'Sessão inválida' };

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
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

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
    return getCached<Breed[]>(cacheKey) ?? [];
  }
  const result = (data ?? []) as Breed[];
  setCached(cacheKey, result);
  return result;
}

export async function createBreed(name: string): Promise<boolean> {
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
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

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
    return getCached<AnimalCategory[]>(cacheKey) ?? [];
  }
  const result = (data ?? []) as AnimalCategory[];
  setCached(cacheKey, result);
  return result;
}

export async function createAnimalCategory(name: string): Promise<boolean> {
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
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

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
    return getCached<ReproductiveSeason[]>(cacheKey) ?? [];
  }

  const result = (data ?? []) as ReproductiveSeason[];
  setCached(cacheKey, result);
  return result;
}

export async function createReproductiveSeason(season: {
  name: string;
  start_date: string;
  end_date: string;
  status?: 'active' | 'closed';
}): Promise<ReproductiveSeason | null> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return null;

  const supabase = createClient();
  const status = season.status || 'closed';

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
  const orgId = await getCurrentOrgId();
  if (!orgId) return false;

  const supabase = createClient();

  if (updates.status === 'active') {
    // If activating, close others
    await supabase
      .from('reproductive_seasons')
      .update({ status: 'closed' })
      .eq('organization_id', orgId)
      .neq('id', id);
  }

  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.start_date !== undefined) payload.start_date = updates.start_date;
  if (updates.end_date !== undefined) payload.end_date = updates.end_date;
  if (updates.status !== undefined) payload.status = updates.status;

  const { error } = await supabase
    .from('reproductive_seasons')
    .update(payload)
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    console.error('updateReproductiveSeason error:', error);
    return false;
  }

  invalidateCache('seasons');
  invalidateCache('lots');
  invalidateCache('metrics');
  return true;
}

export async function setActiveReproductiveSeason(id: string): Promise<boolean> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return false;

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
    console.error('setActiveReproductiveSeason error:', error);
    return false;
  }

  invalidateCache('seasons');
  invalidateCache('lots');
  invalidateCache('metrics');
  return true;
}

export async function deleteReproductiveSeason(id: string): Promise<{ success: boolean; error?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { success: false, error: 'Sessão inválida' };

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
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

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
    // Fallback in memory if table not yet seeded or error
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
  const orgId = await getCurrentOrgId();
  if (!orgId) return null;

  const supabase = createClient();
  const isDefault = !!vet.is_default;

  if (isDefault) {
    await supabase
      .from('veterinarians')
      .update({ is_default: false })
      .eq('organization_id', orgId);
  }

  const { data, error } = await supabase
    .from('veterinarians')
    .insert({
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

  invalidateCache('vets');
  return data as Veterinarian;
}

export async function updateVeterinarian(
  id: string,
  updates: Partial<Veterinarian>
): Promise<boolean> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return false;

  const supabase = createClient();

  if (updates.is_default) {
    await supabase
      .from('veterinarians')
      .update({ is_default: false })
      .eq('organization_id', orgId)
      .neq('id', id);
  }

  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.crmv !== undefined) payload.crmv = updates.crmv ? updates.crmv.trim() : null;
  if (updates.phone !== undefined) payload.phone = updates.phone ? updates.phone.trim() : null;
  if (updates.email !== undefined) payload.email = updates.email ? updates.email.trim() : null;
  if (updates.is_default !== undefined) payload.is_default = updates.is_default;

  const { error } = await supabase
    .from('veterinarians')
    .update(payload)
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    console.error('updateVeterinarian error:', error);
    return false;
  }

  invalidateCache('vets');
  return true;
}

export async function setDefaultVeterinarian(id: string): Promise<boolean> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return false;

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

  invalidateCache('vets');
  return true;
}

export async function deleteVeterinarian(id: string): Promise<{ success: boolean; error?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { success: false, error: 'Sessão inválida' };

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

  const d0Date = new Date(params.start_date + 'T00:00:00');

  let d7Date: string | null = null;
  let d9Date: string | null = null;
  let iaDate: string | null = null;
  let dgDate: string | null = null;

  if (protocolSteps && protocolSteps.length > 0) {
    for (const step of protocolSteps) {
      const target = new Date(d0Date);
      target.setDate(target.getDate() + step.day_offset);
      const str = target.toISOString().split('T')[0];
      const codeUpper = step.code.toUpperCase();

      if (codeUpper === 'D7') d7Date = str;
      else if (codeUpper === 'D8' || codeUpper === 'D9') d9Date = str;
      else if (codeUpper === 'IA') iaDate = str;
      else if (codeUpper === 'DG' || codeUpper === 'DG1') dgDate = str;
    }
  }

  // Fallbacks padrão caso o protocolo não especifique algum step
  if (!d9Date) {
    const d9 = new Date(d0Date);
    d9.setDate(d9.getDate() + 9);
    d9Date = d9.toISOString().split('T')[0];
  }
  if (!iaDate) {
    const ia = new Date(d0Date);
    ia.setDate(ia.getDate() + 11);
    iaDate = ia.toISOString().split('T')[0];
  }
  if (!dgDate) {
    const dg = new Date(d0Date);
    dg.setDate(dg.getDate() + 44);
    dgDate = dg.toISOString().split('T')[0];
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

      // 3.2 Integração com o novo módulo de Estoque Genético
      try {
        const { data: mgmtRec } = await supabase
          .from('animal_managements')
          .select('organization_id, farm_id')
          .eq('id', managementId)
          .maybeSingle();

        if (mgmtRec?.farm_id) {
          // Localizar o lote correspondente no novo módulo
          const { data: genBatches } = await supabase
            .from('genetic_material_batches')
            .select('id')
            .eq('farm_id', mgmtRec.farm_id)
            .ilike('batch_number', batch.batch_number)
            .limit(1);

          const genBatchId = genBatches?.[0]?.id;
          if (genBatchId) {
            // Localizar uma caneca/botijão com saldo deste lote
            const { data: activeBalances } = await supabase
              .from('genetic_inventory_balances')
              .select('id, tank_id, canister_id, owner_client_id, quantity_available')
              .eq('farm_id', mgmtRec.farm_id)
              .eq('batch_id', genBatchId)
              .gt('quantity_available', 0)
              .limit(1);

            if (activeBalances && activeBalances.length > 0) {
              const bal = activeBalances[0];
              await supabase.rpc('fn_process_genetic_usage_iatf', {
                p_organization_id: mgmtRec.organization_id,
                p_farm_id: mgmtRec.farm_id,
                p_batch_id: genBatchId,
                p_tank_id: bal.tank_id,
                p_canister_id: bal.canister_id,
                p_owner_client_id: bal.owner_client_id || null,
                p_quantity: 1,
                p_reference_type: 'animal_managements',
                p_reference_id: managementId,
                p_inseminator_name: data.inseminator_name || null,
                p_notes: `Baixa automática IA da matriz em animal_managements`,
                p_created_by: data.inseminator_name || 'Sistema IATF',
                p_idempotency_key: `ia_mgmt_${managementId}`,
              });
            }
          }
        }
      } catch (genErr) {
        console.warn('Integração com estoque genético na IA:', genErr);
      }
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
      const iaD = new Date(baseIaDate + 'T00:00:00');
      iaD.setDate(iaD.getDate() + 295);
      expectedParturition = iaD.toISOString().split('T')[0];
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
    .from('lot_animals')
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
  const isOffline = typeof window !== 'undefined' && !navigator.onLine;
  if (isOffline) {
    try {
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
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao registrar DG offline';
      return { success: false, error: msg };
    }
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return { success: false, error: 'Sessão inválida.' };

  const supabase = createClient();

  // 1. Se tem management_id fornecido, executa via executeStepDG
  if (params.management_id) {
    return executeStepDG(params.management_id, {
      animal_id: params.animal_id,
      executed_at: params.dg_date,
      pregnancy_status: params.pregnancy_status,
      ecc_dg: params.ecc_dg,
      notes: params.notes,
    });
  }

  // 2. Verificar se existe algum manejo em andamento para este animal
  const { data: activeMgmt } = await supabase
    .from('animal_managements')
    .select('id, ia_executed_at, ia_date')
    .eq('animal_id', params.animal_id)
    .eq('status', 'em_andamento')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

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
    const d = new Date(params.dg_date + 'T00:00:00');
    d.setDate(d.getDate() + 250); // Estimativa padrão se gestação confirmada sem data de IA
    expectedParturition = d.toISOString().split('T')[0];
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

  // 5. Atualizar lot_animals se participante de lote
  await supabase
    .from('lot_animals')
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
  const supabase = createClient();
  const { error } = await supabase
    .from('animal_managements')
    .delete()
    .eq('id', managementId);

  if (error) {
    console.error('deleteAnimalManagement error:', error);
    return false;
  }

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
