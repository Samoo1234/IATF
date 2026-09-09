import { createClient } from './supabase/client';

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
    properties: { name: string } | null;
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
      iatf_lots!inner (code, farm_id, properties(name))
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
  const { data, error } = await supabase
    .from('iatf_lot_animals')
    .select(`
      id, ecc_ia, ecc_dg, inseminator_name, pregnancy_status, expected_parturition_date,
      iatf_lots (code, start_date, ia_planned_date, status,
        reproductive_seasons (name),
        protocols (name),
        properties (name)
      ),
      bulls (name)
    `)
    .eq('animal_id', animalId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getAnimalHistory error:', error);
    return [];
  }
  return data ?? [];
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

export async function getProtocols(forceRefresh = false): Promise<Protocol[]> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const cacheKey = `protocols_${orgId}`;
  if (!forceRefresh) {
    const cached = getCached<Protocol[]>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('protocols')
    .select('*, protocol_steps(*)')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('name');

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
      name: protocol.name,
      description: protocol.description,
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
    code: step.code,
    name: step.name,
    day_offset: step.day_offset,
    dosage_instruction: step.dosage_instruction,
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
  properties?: Property[];
}

export async function getFarms(forceRefresh = false): Promise<Farm[]> {
  const now = Date.now();
  if (!forceRefresh && cachedFarms && now - cachedFarmsTimestamp < CACHE_TTL_MS) {
    return cachedFarms;
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('farms')
    .select('*, properties(*)')
    .eq('organization_id', orgId)
    .order('name');

  if (error) {
    console.error('getFarms error:', error);
    return cachedFarms ?? [];
  }

  cachedFarms = (data ?? []) as Farm[];
  cachedFarmsTimestamp = now;
  return cachedFarms;
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


