import { createClient } from './supabase/client';

// ============================================================
// DYNAMIC MULTI-TENANT RESOLVER
// ============================================================

export async function getCurrentOrgId(): Promise<string | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (member?.organization_id) {
    return member.organization_id;
  }

  // Fallback: Check if user owns an organization directly
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id')
    .limit(1);

  if (orgs && orgs.length > 0) {
    return orgs[0].id;
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

  return {
    ...org,
    farm: farm || null,
  };
}

export interface LotStat {
  id: string;
  code: string;
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

export async function getLots(): Promise<LotStat[]> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('lot_stats')
    .select('*')
    .eq('organization_id', orgId)
    .order('start_date', { ascending: true });

  if (error) { console.error('getLots error:', error); return []; }
  return (data ?? []) as LotStat[];
}

export async function getLotById(id: string): Promise<LotStat | null> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from('lot_stats')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single();

  if (error) { console.error('getLotById error:', error); return null; }
  return data as LotStat;
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

export async function getLotAnimals(lotId: string): Promise<LotAnimal[]> {
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

  if (error) { console.error('getLotAnimals error:', error); return []; }
  return (data ?? []) as unknown as LotAnimal[];
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

  if (error) { console.error('updateAnimalDG error:', error); return false; }
  return true;
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

export async function getManagementEvents(): Promise<ManagementEvent[]> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('management_events')
    .select(`
      *,
      iatf_lots (code, properties(name))
    `)
    .eq('organization_id', orgId)
    .order('planned_date', { ascending: true });

  if (error) { console.error('getManagementEvents error:', error); return []; }
  return (data ?? []) as unknown as ManagementEvent[];
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

  if (error) { console.error('completeManagementEvent error:', error); return false; }
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

  if (error) { console.error('insertManagementEvent error:', error); return false; }
  return true;
}

export async function deleteManagementEvent(eventId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('management_events')
    .delete()
    .eq('id', eventId)
    .select();

  if (error) { console.error('deleteManagementEvent error:', error); return false; }
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

  if (error) { console.error('updateManagementEventDate error:', error); return false; }
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

export async function getSemenBatches(): Promise<SemenBatch[]> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('semen_batches')
    .select('*, bulls(name, code)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) { console.error('getSemenBatches error:', error); return []; }
  return (data ?? []) as unknown as SemenBatch[];
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
  if (error) { console.error('insertSemenBatch error:', error); return false; }
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

export async function getAnimals(limit = 50): Promise<Animal[]> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('animals')
    .select('*, breeds(name), animal_categories(name), properties(name), farms(name)')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) { console.error('getAnimals error:', error); return []; }
  return (data ?? []) as unknown as Animal[];
}

export async function searchAnimals(query: string): Promise<Animal[]> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('animals')
    .select('*, breeds(name), animal_categories(name), properties(name), farms(name)')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .ilike('tag_number', `%${query}%`)
    .limit(20);

  if (error) { console.error('searchAnimals error:', error); return []; }
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
    console.error('createAnimal error:', error);
    return { success: false, error: error.message };
  }
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

  if (error) { console.error('getAnimalHistory error:', error); return []; }
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

export async function getOrgMetrics(): Promise<OrgMetrics | null> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from('organization_metrics')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) { console.error('getOrgMetrics error:', error); return null; }
  return data as OrgMetrics;
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

export async function getProtocols(): Promise<Protocol[]> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('protocols')
    .select('*, protocol_steps(*)')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('name');

  if (error) { console.error('getProtocols error:', error); return []; }
  return (data ?? []) as unknown as Protocol[];
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

export async function getBulls(): Promise<Bull[]> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('bulls')
    .select('*')
    .eq('organization_id', orgId)
    .order('name');

  if (error) { console.error('getBulls error:', error); return []; }
  return (data ?? []) as Bull[];
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
  if (error) { console.error('createBull error:', error); return false; }
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
}): Promise<string | null> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return null;

  const supabase = createClient();

  // Fetch active season
  const { data: season } = await supabase
    .from('reproductive_seasons')
    .select('id')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (!season) return null;

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
      season_id: season.id,
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

  if (error) { console.error('createLot error:', error); return null; }

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

  return inserted.id;
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

export async function getFarms(): Promise<Farm[]> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('farms')
    .select('*, properties(*)')
    .eq('organization_id', orgId)
    .order('name');

  if (error) { console.error('getFarms error:', error); return []; }
  return (data ?? []) as Farm[];
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

  if (error) { console.error('createFarm error:', error); return null; }
  return data?.id ?? null;
}

export interface Property {
  id: string;
  name: string;
  code: string | null;
  farm_id: string;
}

export async function getProperties(): Promise<Property[]> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('organization_id', orgId)
    .order('name');

  if (error) { console.error('getProperties error:', error); return []; }
  return (data ?? []) as Property[];
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
  if (error) { console.error('createProperty error:', error); return false; }
  return true;
}

// ============================================================
// BREEDS & CATEGORIES
// ============================================================

export interface Breed {
  id: string;
  name: string;
}

export async function getBreeds(): Promise<Breed[]> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('breeds')
    .select('*')
    .eq('organization_id', orgId)
    .order('name');

  if (error) { console.error('getBreeds error:', error); return []; }
  return (data ?? []) as Breed[];
}

export async function createBreed(name: string): Promise<boolean> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return false;

  const supabase = createClient();
  const { error } = await supabase.from('breeds').insert({
    name,
    organization_id: orgId,
  });
  if (error) { console.error('createBreed error:', error); return false; }
  return true;
}

export interface AnimalCategory {
  id: string;
  name: string;
}

export async function getAnimalCategories(): Promise<AnimalCategory[]> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('animal_categories')
    .select('*')
    .eq('organization_id', orgId)
    .order('name');

  if (error) { console.error('getAnimalCategories error:', error); return []; }
  return (data ?? []) as AnimalCategory[];
}

export async function createAnimalCategory(name: string): Promise<boolean> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return false;

  const supabase = createClient();
  const { error } = await supabase.from('animal_categories').insert({
    name,
    organization_id: orgId,
  });
  if (error) { console.error('createAnimalCategory error:', error); return false; }
  return true;
}
