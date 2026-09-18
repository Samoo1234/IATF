import { createClient } from '@/lib/supabase/client';
import { getCurrentOrgId, getCached, setCached, invalidateCache } from '@/lib/db';
import type {
  GeneticMaterialType,
  SemenTank,
  TankCanister,
  NitrogenMeasurement,
  InventoryBalance,
  InventoryMovement,
  WithdrawalReceipt,
  GeneticClient,
  GeneticCenter,
  InventoryDashboardMetrics,
  AnimalGeneticPosition,
  InboundPayload,
  OutboundPayload,
  TransferPayload,
  AdjustmentPayload,
} from '@/lib/types/genetic-inventory';
import * as XLSX from 'xlsx';

// ============================================================
// 1. DASHBOARD METRICS
// ============================================================

export async function getInventoryDashboardMetrics(
  farmId: string,
  materialType?: GeneticMaterialType
): Promise<InventoryDashboardMetrics> {
  const orgId = await getCurrentOrgId();
  if (!orgId || !farmId) {
    return {
      totalSemenDoses: 0,
      totalEmbryoDoses: 0,
      activeTanksCount: 0,
      lowStockItemsCount: 0,
      tanksBelowNitrogenCount: 0,
      movementsLast30DaysCount: 0,
      monthlyStats: [],
      tanksSummary: [],
    };
  }

  const cacheKey = `gen_metrics_${farmId}_${materialType || 'all'}`;
  const cached = getCached<InventoryDashboardMetrics>(cacheKey, 60 * 1000); // 1 minuto
  if (cached) return cached;

  const supabase = createClient();

  // 1. Total doses por tipo
  const { data: balances } = await supabase
    .from('genetic_inventory_balances')
    .select(`
      quantity_available,
      tank_id,
      genetic_material_batches (
        genetic_materials (
          type
        )
      )
    `)
    .eq('farm_id', farmId);

  let totalSemen = 0;
  let totalEmbryo = 0;
  let lowStockCount = 0;

  const tankDosesMap = new Map<string, number>();

  interface BalanceMetricRow {
    quantity_available: number;
    tank_id: string;
    genetic_material_batches?: {
      genetic_materials?: {
        type: GeneticMaterialType;
      };
    };
  }

  (balances as unknown as BalanceMetricRow[] || []).forEach((b) => {
    const qty = b.quantity_available || 0;
    const type = b.genetic_material_batches?.genetic_materials?.type;
    if (type === 'EMBRYO') {
      totalEmbryo += qty;
    } else {
      totalSemen += qty;
    }

    if (qty > 0 && qty < 10) {
      lowStockCount++;
    }

    if (b.tank_id) {
      tankDosesMap.set(b.tank_id, (tankDosesMap.get(b.tank_id) || 0) + qty);
    }
  });

  // 2. Botijões
  const { data: tanks } = await supabase
    .from('semen_tanks')
    .select('id, name, number, current_nitrogen_level, minimum_nitrogen_level, status')
    .eq('farm_id', farmId)
    .is('deleted_at', null);

  interface TankMetricRow {
    id: string;
    name: string;
    number: string;
    current_nitrogen_level: number;
    minimum_nitrogen_level: number;
    status: 'ativo' | 'manutencao' | 'inativo';
  }

  const typedTanks = (tanks as unknown as TankMetricRow[]) || [];
  const activeTanks = typedTanks.filter((t) => t.status === 'ativo');
  const tanksBelowN2 = typedTanks.filter(
    (t) => Number(t.current_nitrogen_level) < Number(t.minimum_nitrogen_level)
  );

  const tanksSummary = typedTanks.map((t) => ({
    tankId: t.id,
    tankName: t.name,
    tankNumber: t.number,
    currentNitrogen: Number(t.current_nitrogen_level),
    minimumNitrogen: Number(t.minimum_nitrogen_level),
    totalDoses: tankDosesMap.get(t.id) || 0,
    status: t.status,
  }));

  // 3. Movimentações últimos 30 dias
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: movements } = await supabase
    .from('genetic_inventory_movements')
    .select('id, movement_type, quantity, occurred_at')
    .eq('farm_id', farmId)
    .gte('occurred_at', thirtyDaysAgo.toISOString());

  const movementsCount = movements?.length || 0;

  // 4. Estatísticas mensais (últimos 6 meses)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);

  const { data: historicalMovs } = await supabase
    .from('genetic_inventory_movements')
    .select('movement_type, quantity, occurred_at')
    .eq('farm_id', farmId)
    .gte('occurred_at', sixMonthsAgo.toISOString());

  const monthsMap = new Map<string, { inbound: number; outbound: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = d.toLocaleDateString('pt-BR', { month: 'short' });
    monthsMap.set(key, { inbound: 0, outbound: 0 });
  }

  interface HistMovRow {
    movement_type: string;
    quantity: number;
    occurred_at: string;
  }

  (historicalMovs as unknown as HistMovRow[] || []).forEach((m) => {
    const d = new Date(m.occurred_at);
    const key = d.toLocaleDateString('pt-BR', { month: 'short' });
    if (monthsMap.has(key)) {
      const entry = monthsMap.get(key)!;
      if (['INBOUND', 'TRANSFER_IN', 'ADJUSTMENT_POSITIVE'].includes(m.movement_type)) {
        entry.inbound += m.quantity;
      } else if (['OUTBOUND', 'TRANSFER_OUT', 'USAGE', 'LOSS', 'ADJUSTMENT_NEGATIVE'].includes(m.movement_type)) {
        entry.outbound += m.quantity;
      }
    }
  });

  const monthlyStats = Array.from(monthsMap.entries()).map(([month, stats]) => ({
    month,
    inbound: stats.inbound,
    outbound: stats.outbound,
  }));

  const result: InventoryDashboardMetrics = {
    totalSemenDoses: totalSemen,
    totalEmbryoDoses: totalEmbryo,
    activeTanksCount: activeTanks.length,
    lowStockItemsCount: lowStockCount,
    tanksBelowNitrogenCount: tanksBelowN2.length,
    movementsLast30DaysCount: movementsCount,
    monthlyStats,
    tanksSummary,
  };

  setCached(cacheKey, result);
  return result;
}

// ============================================================
// 2. BOTIJÕES E CANECAS
// ============================================================

export async function getTanks(farmId: string, forceRefresh = false): Promise<SemenTank[]> {
  const orgId = await getCurrentOrgId();
  if (!orgId || !farmId) return [];

  const cacheKey = `tanks_${farmId}`;
  if (!forceRefresh) {
    const cached = getCached<SemenTank[]>(cacheKey);
    if (cached) return cached;
  }

  const supabase = createClient();
  const { data: tanks, error } = await supabase
    .from('semen_tanks')
    .select(`
      *,
      semen_tank_canisters (id)
    `)
    .eq('farm_id', farmId)
    .is('deleted_at', null)
    .order('number');

  if (error) {
    console.error('getTanks error:', error);
    return [];
  }

  // Doses por botijão
  const { data: balances } = await supabase
    .from('genetic_inventory_balances')
    .select('tank_id, quantity_available')
    .eq('farm_id', farmId);

  const dosesMap = new Map<string, number>();
  (balances || []).forEach((b: { tank_id: string; quantity_available: number | null }) => {
    dosesMap.set(b.tank_id, (dosesMap.get(b.tank_id) || 0) + (b.quantity_available || 0));
  });

  const result: SemenTank[] = (tanks || []).map((t: SemenTank & { semen_tank_canisters?: unknown[] }) => ({
    ...t,
    current_nitrogen_level: Number(t.current_nitrogen_level),
    minimum_nitrogen_level: Number(t.minimum_nitrogen_level),
    total_doses: dosesMap.get(t.id) || 0,
    canisters_count: t.semen_tank_canisters?.length || 0,
  }));

  setCached(cacheKey, result);
  return result;
}

export async function createTank(
  farmId: string,
  tank: {
    number: string;
    name: string;
    brand?: string;
    model?: string;
    serial_number?: string;
    capacity_notes?: string;
    current_nitrogen_level: number;
    minimum_nitrogen_level: number;
    status?: 'ativo' | 'manutencao' | 'inativo';
    notes?: string;
    initial_canisters_count?: number;
  }
): Promise<{ success: boolean; tankId?: string; error?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId || !farmId) return { success: false, error: 'Fazenda não identificada.' };

  const supabase = createClient();
  const { data, error } = await supabase
    .from('semen_tanks')
    .insert({
      organization_id: orgId,
      farm_id: farmId,
      number: tank.number.trim(),
      name: tank.name.trim(),
      brand: tank.brand?.trim() || null,
      model: tank.model?.trim() || null,
      serial_number: tank.serial_number?.trim() || null,
      capacity_notes: tank.capacity_notes?.trim() || null,
      current_nitrogen_level: tank.current_nitrogen_level,
      minimum_nitrogen_level: tank.minimum_nitrogen_level,
      status: tank.status || 'ativo',
      notes: tank.notes || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('createTank error:', error);
    return { success: false, error: error.message };
  }

  // Criar canecas iniciais se solicitado (ex: 6 a 10 canecas)
  const canistersCount = tank.initial_canisters_count || 10;
  if (canistersCount > 0 && data?.id) {
    const canisterRecords = Array.from({ length: canistersCount }, (_, idx) => ({
      organization_id: orgId,
      farm_id: farmId,
      tank_id: data.id,
      position_number: idx + 1,
      nickname: `Caneca ${idx + 1}`,
      active: true,
    }));

    await supabase.from('semen_tank_canisters').insert(canisterRecords);
  }

  invalidateCache(`tanks_${farmId}`);
  invalidateCache(`gen_metrics_${farmId}`);
  return { success: true, tankId: data.id };
}

export async function updateTank(
  tankId: string,
  updates: Partial<SemenTank>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('semen_tanks')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tankId);

  if (error) {
    return { success: false, error: error.message };
  }

  invalidateCache();
  return { success: true };
}

export async function getCanisters(tankId: string): Promise<TankCanister[]> {
  const supabase = createClient();
  const { data: canisters, error } = await supabase
    .from('semen_tank_canisters')
    .select('*')
    .eq('tank_id', tankId)
    .order('position_number');

  if (error) {
    console.error('getCanisters error:', error);
    return [];
  }

  // Quantidade por caneca
  const { data: balances } = await supabase
    .from('genetic_inventory_balances')
    .select('canister_id, quantity_available')
    .eq('tank_id', tankId);

  const canisterDosesMap = new Map<string, number>();
  (balances || []).forEach((b: { canister_id: string; quantity_available: number | null }) => {
    canisterDosesMap.set(b.canister_id, (canisterDosesMap.get(b.canister_id) || 0) + (b.quantity_available || 0));
  });

  return (canisters || []).map((c: TankCanister) => ({
    ...c,
    total_doses: canisterDosesMap.get(c.id) || 0,
  }));
}

export async function recordNitrogenMeasurement(
  farmId: string,
  tankId: string,
  levelPercent: number,
  notes?: string,
  measuredBy?: string
): Promise<{ success: boolean; error?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId || !farmId) return { success: false, error: 'Fazenda não identificada.' };

  const supabase = createClient();
  const { error } = await supabase.rpc('fn_record_nitrogen_measurement', {
    p_organization_id: orgId,
    p_farm_id: farmId,
    p_tank_id: tankId,
    p_level_percent: levelPercent,
    p_measured_by: measuredBy || 'Operador',
    p_notes: notes || null,
    p_measured_at: new Date().toISOString(),
  });

  if (error) {
    console.error('recordNitrogenMeasurement error:', error);
    return { success: false, error: error.message };
  }

  invalidateCache();
  return { success: true };
}

export async function getNitrogenHistory(tankId: string): Promise<NitrogenMeasurement[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tank_nitrogen_measurements')
    .select(`
      *,
      semen_tanks (name, number)
    `)
    .eq('tank_id', tankId)
    .order('measured_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('getNitrogenHistory error:', error);
    return [];
  }

  return (data || []).map((m: NitrogenMeasurement) => ({
    ...m,
    level_percent: Number(m.level_percent),
  }));
}

// ============================================================
// 3. SALDOS E INVENTÁRIO COMPLETO
// ============================================================

export interface InventoryFilterParams {
  materialType?: GeneticMaterialType;
  tankId?: string;
  canisterId?: string;
  breedId?: string;
  centerId?: string;
  ownerClientId?: string;
  isClientStockOnly?: boolean;
  isOwnStockOnly?: boolean;
  lowStockOnly?: boolean;
  search?: string;
}

export async function getInventoryBalances(
  farmId: string,
  filters?: InventoryFilterParams
): Promise<InventoryBalance[]> {
  const supabase = createClient();

  let query = supabase
    .from('genetic_inventory_balances')
    .select(`
      *,
      genetic_material_batches (
        id,
        batch_number,
        rack_code,
        cost_per_unit,
        supplier_name,
        genetic_materials (
          id,
          type,
          material_code,
          sexing,
          package_type,
          cryopreservation,
          donor_name,
          donor_rgd,
          bulls (name, code),
          animals (tag_number),
          breeds (name)
        ),
        genetic_centers (name, short_name)
      ),
      semen_tanks (id, name, number, current_nitrogen_level),
      semen_tank_canisters (id, position_number, nickname),
      genetic_clients (id, name, document_number)
    `)
    .eq('farm_id', farmId)
    .gt('quantity_available', 0)
    .order('updated_at', { ascending: false });

  if (filters?.tankId) {
    query = query.eq('tank_id', filters.tankId);
  }
  if (filters?.canisterId) {
    query = query.eq('canister_id', filters.canisterId);
  }
  if (filters?.ownerClientId) {
    query = query.eq('owner_client_id', filters.ownerClientId);
  } else if (filters?.isOwnStockOnly) {
    query = query.is('owner_client_id', null);
  } else if (filters?.isClientStockOnly) {
    query = query.not('owner_client_id', 'is', null);
  }

  const { data, error } = await query;
  if (error) {
    console.error('getInventoryBalances error:', error);
    return [];
  }

  let result = (data || []) as unknown as InventoryBalance[];

  // Filtros em memória para relações profundas
  if (filters?.materialType) {
    result = result.filter(
      (b) => b.genetic_material_batches?.genetic_materials?.type === filters.materialType
    );
  }

  if (filters?.lowStockOnly) {
    result = result.filter((b) => b.quantity_available < 10);
  }

  if (filters?.search && filters.search.trim()) {
    const s = filters.search.toLowerCase().trim();
    result = result.filter((b) => {
      const mat = b.genetic_material_batches?.genetic_materials;
      const bullName = mat?.bulls?.name?.toLowerCase() || '';
      const bullCode = mat?.bulls?.code?.toLowerCase() || '';
      const donorName = mat?.donor_name?.toLowerCase() || mat?.animals?.tag_number?.toLowerCase() || '';
      const batchNum = b.genetic_material_batches?.batch_number?.toLowerCase() || '';
      const rack = b.genetic_material_batches?.rack_code?.toLowerCase() || '';
      const tank = b.semen_tanks?.name?.toLowerCase() || b.semen_tanks?.number?.toLowerCase() || '';
      const client = b.genetic_clients?.name?.toLowerCase() || '';
      const breed = mat?.breeds?.name?.toLowerCase() || '';

      return (
        bullName.includes(s) ||
        bullCode.includes(s) ||
        donorName.includes(s) ||
        batchNum.includes(s) ||
        rack.includes(s) ||
        tank.includes(s) ||
        client.includes(s) ||
        breed.includes(s)
      );
    });
  }

  return result;
}

// ============================================================
// 4. CONSULTA RÁPIDA DE ANIMAL (REPRODUTOR / DOADORA)
// ============================================================

export async function searchAnimalGeneticPositions(
  farmId: string,
  queryText: string,
  materialType: GeneticMaterialType = 'SEMEN'
): Promise<AnimalGeneticPosition[]> {
  if (!farmId || !queryText || queryText.trim().length < 2) return [];

  const balances = await getInventoryBalances(farmId, {
    materialType,
    search: queryText,
  });

  return balances.map((b) => {
    const mat = b.genetic_material_batches?.genetic_materials;
    const isSemen = mat?.type === 'SEMEN';

    const animalName = isSemen 
      ? (mat?.bulls?.name || 'Touro Desconhecido') 
      : (mat?.donor_name || mat?.animals?.tag_number || 'Doadora');
    const animalCode = isSemen ? mat?.bulls?.code : mat?.donor_rgd;

    return {
      materialId: mat?.id || '',
      materialType: mat?.type || 'SEMEN',
      animalName,
      animalCode: animalCode || null,
      animalRgd: isSemen ? null : mat?.donor_rgd,
      breedName: mat?.breeds?.name || null,
      batchId: b.batch_id,
      batchNumber: b.genetic_material_batches?.batch_number || '',
      rackCode: b.genetic_material_batches?.rack_code || null,
      tankId: b.tank_id,
      tankName: b.semen_tanks?.name || '',
      tankNumber: b.semen_tanks?.number || '',
      canisterId: b.canister_id,
      canisterPosition: b.semen_tank_canisters?.position_number || 0,
      quantityAvailable: b.quantity_available,
      ownerClientName: b.genetic_clients?.name || null,
      ownerClientId: b.owner_client_id || null,
      centerName: b.genetic_material_batches?.genetic_centers?.name || null,
      sexing: mat?.sexing || 'convencional',
    };
  });
}

// ============================================================
// 5. TRANSAÇÕES DE ENTRADA, SAÍDA, TRANSFERÊNCIA E AJUSTE
// ============================================================

export async function processInbound(
  farmId: string,
  payload: InboundPayload,
  operatorName = 'Operador'
): Promise<{ success: boolean; movementId?: string; error?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId || !farmId) return { success: false, error: 'Fazenda não identificada.' };

  const supabase = createClient();

  let targetBatchId = payload.batchId;

  // Se for cadastro simultâneo de novo material + lote
  if (payload.isNewMaterial) {
    if (!payload.batchNumber) {
      return { success: false, error: 'Número da partida/lote é obrigatório para novo material.' };
    }

    // 1. Inserir material
    const { data: newMat, error: matErr } = await supabase
      .from('genetic_materials')
      .insert({
        organization_id: orgId,
        farm_id: farmId,
        type: payload.materialType,
        sire_id: payload.sireId || null,
        donor_id: payload.donorId || null,
        donor_name: payload.donorName || null,
        donor_rgd: payload.donorRgd || null,
        breed_id: payload.breedId || null,
        sexing: payload.sexing,
        package_type: payload.packageType,
        cryopreservation: payload.cryopreservation,
        material_code: payload.materialCode || null,
        description: payload.description || null,
      })
      .select('id')
      .single();

    if (matErr || !newMat) {
      console.error('Error creating material in inbound:', matErr);
      return { success: false, error: matErr?.message || 'Erro ao criar material genético.' };
    }

    // 2. Inserir lote
    const { data: newBatch, error: batchErr } = await supabase
      .from('genetic_material_batches')
      .insert({
        organization_id: orgId,
        farm_id: farmId,
        material_id: newMat.id,
        center_id: payload.centerId || null,
        batch_number: payload.batchNumber.trim(),
        rack_code: payload.rackCode || null,
        cost_per_unit: payload.costPerUnit || 0,
        supplier_name: payload.supplierName || null,
        manufactured_at: payload.manufacturedAt || null,
        expires_at: payload.expiresAt || null,
      })
      .select('id')
      .single();

    if (batchErr || !newBatch) {
      console.error('Error creating batch in inbound:', batchErr);
      return { success: false, error: batchErr?.message || 'Erro ao criar lote.' };
    }

    targetBatchId = newBatch.id;
  }

  if (!targetBatchId) {
    return { success: false, error: 'Lote de material genético inválido.' };
  }

  // 3. Chamar função transacional no banco
  const { data: movementId, error: rpcErr } = await supabase.rpc('fn_process_genetic_inbound', {
    p_organization_id: orgId,
    p_farm_id: farmId,
    p_batch_id: targetBatchId,
    p_material_type: payload.materialType,
    p_tank_id: payload.tankId,
    p_canister_id: payload.canisterId,
    p_owner_client_id: payload.ownerClientId || null,
    p_quantity: payload.quantity,
    p_reason: payload.reason || 'Entrada de estoque',
    p_notes: payload.notes || null,
    p_created_by: operatorName,
    p_occurred_at: payload.occurredAt || new Date().toISOString(),
  });

  if (rpcErr) {
    console.error('processInbound rpc error:', rpcErr);
    return { success: false, error: rpcErr.message };
  }

  // 4. Sincronizar com semen_batches para retrocompatibilidade
  if (payload.sireId && payload.materialType === 'SEMEN') {
    await supabase.from('semen_batches').insert({
      organization_id: orgId,
      bull_id: payload.sireId,
      batch_number: payload.batchNumber,
      supplier_central: payload.supplierName || undefined,
      initial_quantity: payload.quantity,
      used_quantity: 0,
      lost_quantity: 0,
    });
  }

  invalidateCache();
  return { success: true, movementId };
}

export async function processOutbound(
  farmId: string,
  payload: OutboundPayload,
  operatorName = 'Operador'
): Promise<{ success: boolean; receiptNumber?: string; receiptId?: string; error?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId || !farmId) return { success: false, error: 'Fazenda não identificada.' };

  const supabase = createClient();
  const { data: res, error } = await supabase.rpc('fn_process_genetic_outbound', {
    p_organization_id: orgId,
    p_farm_id: farmId,
    p_batch_id: payload.batchId,
    p_material_type: payload.materialType,
    p_tank_id: payload.tankId,
    p_canister_id: payload.canisterId,
    p_owner_client_id: payload.ownerClientId || null,
    p_quantity: payload.quantity,
    p_reason: payload.reason,
    p_notes: payload.notes || null,
    p_reference_type: payload.referenceType || null,
    p_reference_id: payload.referenceId || null,
    p_recipient_name: payload.recipientName,
    p_recipient_document: payload.recipientDocument || null,
    p_created_by: operatorName,
    p_occurred_at: payload.occurredAt || new Date().toISOString(),
  });

  if (error) {
    console.error('processOutbound rpc error:', error);
    return { success: false, error: error.message };
  }

  invalidateCache();
  return {
    success: true,
    receiptNumber: res?.receipt_number,
    receiptId: res?.receipt_id,
  };
}

export async function processTransfer(
  farmId: string,
  payload: TransferPayload,
  operatorName = 'Operador'
): Promise<{ success: boolean; transferGroupId?: string; error?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId || !farmId) return { success: false, error: 'Fazenda não identificada.' };

  const supabase = createClient();
  const { data: transferGroupId, error } = await supabase.rpc('fn_process_genetic_transfer', {
    p_organization_id: orgId,
    p_farm_id: farmId,
    p_batch_id: payload.batchId,
    p_material_type: payload.materialType,
    p_source_tank_id: payload.sourceTankId,
    p_source_canister_id: payload.sourceCanisterId,
    p_dest_tank_id: payload.destTankId,
    p_dest_canister_id: payload.destCanisterId,
    p_owner_client_id: payload.ownerClientId || null,
    p_quantity: payload.quantity,
    p_reason: payload.reason,
    p_notes: payload.notes || null,
    p_created_by: operatorName,
    p_occurred_at: payload.occurredAt || new Date().toISOString(),
  });

  if (error) {
    console.error('processTransfer rpc error:', error);
    return { success: false, error: error.message };
  }

  invalidateCache();
  return { success: true, transferGroupId };
}

export async function processAdjustment(
  farmId: string,
  payload: AdjustmentPayload,
  operatorName = 'Operador'
): Promise<{ success: boolean; error?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId || !farmId) return { success: false, error: 'Fazenda não identificada.' };

  const supabase = createClient();
  const { error } = await supabase.rpc('fn_process_genetic_adjustment', {
    p_organization_id: orgId,
    p_farm_id: farmId,
    p_batch_id: payload.batchId,
    p_material_type: payload.materialType,
    p_tank_id: payload.tankId,
    p_canister_id: payload.canisterId,
    p_owner_client_id: payload.ownerClientId || null,
    p_quantity: payload.quantity,
    p_is_positive: payload.isPositive,
    p_is_loss: payload.isLoss,
    p_reason: payload.reason,
    p_notes: payload.notes || null,
    p_created_by: operatorName,
  });

  if (error) {
    console.error('processAdjustment rpc error:', error);
    return { success: false, error: error.message };
  }

  invalidateCache();
  return { success: true };
}

export async function processReversal(
  farmId: string,
  movementId: string,
  reason: string,
  operatorName = 'Operador'
): Promise<{ success: boolean; reversalId?: string; error?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId || !farmId) return { success: false, error: 'Fazenda não identificada.' };

  const supabase = createClient();
  const { data: reversalId, error } = await supabase.rpc('fn_process_genetic_reversal', {
    p_organization_id: orgId,
    p_farm_id: farmId,
    p_movement_id: movementId,
    p_reason: reason,
    p_created_by: operatorName,
  });

  if (error) {
    console.error('processReversal rpc error:', error);
    return { success: false, error: error.message };
  }

  invalidateCache();
  return { success: true, reversalId };
}

// ============================================================
// 6. HISTÓRICO DE MOVIMENTAÇÕES (LIVRO RAZÃO)
// ============================================================

export async function getMovementHistory(
  farmId: string,
  filters?: {
    materialType?: GeneticMaterialType;
    movementType?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }
): Promise<InventoryMovement[]> {
  const supabase = createClient();
  let query = supabase
    .from('genetic_inventory_movements')
    .select(`
      *,
      genetic_material_batches (
        batch_number,
        rack_code,
        genetic_materials (
          type,
          sexing,
          donor_name,
          bulls (name),
          animals (tag_number)
        )
      ),
      source_tank:semen_tanks!source_tank_id (name, number),
      source_canister:semen_tank_canisters!source_canister_id (position_number, nickname),
      dest_tank:semen_tanks!destination_tank_id (name, number),
      dest_canister:semen_tank_canisters!destination_canister_id (position_number, nickname),
      genetic_clients (name)
    `)
    .eq('farm_id', farmId)
    .order('occurred_at', { ascending: false })
    .limit(filters?.limit || 100);

  if (filters?.materialType) {
    query = query.eq('material_type', filters.materialType);
  }
  if (filters?.movementType) {
    query = query.eq('movement_type', filters.movementType);
  }
  if (filters?.startDate) {
    query = query.gte('occurred_at', filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte('occurred_at', filters.endDate);
  }

  const { data, error } = await query;
  if (error) {
    console.error('getMovementHistory error:', error);
    return [];
  }

  return (data || []) as unknown as InventoryMovement[];
}

// ============================================================
// 7. COMPROVANTES DE RETIRADA
// ============================================================

export async function getWithdrawalReceipts(farmId: string): Promise<WithdrawalReceipt[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('genetic_withdrawal_receipts')
    .select(`
      *,
      genetic_inventory_movements (
        id,
        quantity,
        reason,
        notes,
        occurred_at,
        created_by,
        genetic_material_batches (
          batch_number,
          rack_code,
          genetic_materials (
            type,
            sexing,
            package_type,
            cryopreservation,
            donor_name,
            donor_rgd,
            bulls (name, code),
            animals (tag_number),
            breeds (name)
          ),
          genetic_centers (name, short_name)
        ),
        source_tank:semen_tanks!source_tank_id (name, number),
        source_canister:semen_tank_canisters!source_canister_id (position_number, nickname),
        genetic_clients (name, document_number)
      )
    `)
    .eq('farm_id', farmId)
    .order('generated_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('getWithdrawalReceipts error:', error);
    return [];
  }

  return (data || []) as unknown as WithdrawalReceipt[];
}

// ============================================================
// 8. CLIENTES E CENTRAIS
// ============================================================

export async function getClients(farmId: string): Promise<GeneticClient[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('genetic_clients')
    .select('*')
    .eq('farm_id', farmId)
    .order('name');

  if (error) {
    console.error('getClients error:', error);
    return [];
  }
  return data || [];
}

export async function createClientRecord(
  farmId: string,
  client: { name: string; document_number?: string; phone?: string; email?: string; notes?: string }
): Promise<{ success: boolean; client?: GeneticClient; error?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId || !farmId) return { success: false, error: 'Fazenda não identificada.' };

  const supabase = createClient();
  const { data, error } = await supabase
    .from('genetic_clients')
    .insert({
      organization_id: orgId,
      farm_id: farmId,
      name: client.name.trim(),
      document_number: client.document_number?.trim() || null,
      phone: client.phone?.trim() || null,
      email: client.email?.trim() || null,
      notes: client.notes || null,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, client: data };
}

export async function getGeneticCenters(): Promise<GeneticCenter[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('genetic_centers')
    .select('*')
    .eq('active', true)
    .order('name');

  if (error) {
    console.error('getGeneticCenters error:', error);
    return [];
  }
  return data || [];
}

// ============================================================
// 9. EXPORTAÇÃO EXCEL (.XLSX)
// ============================================================

export function exportInventoryToExcel(balances: InventoryBalance[], farmName = 'Fazenda'): void {
  const rows = balances.map((b) => {
    const mat = b.genetic_material_batches?.genetic_materials;
    const isSemen = mat?.type === 'SEMEN';
    const animalName = isSemen 
      ? (mat?.bulls?.name || 'N/D') 
      : (mat?.donor_name || mat?.animals?.tag_number || 'N/D');

    return {
      'Tipo de Material': isSemen ? 'Sêmen' : 'Embrião',
      'Animal / Genética': animalName,
      'Código / RGD': (isSemen ? mat?.bulls?.code : mat?.donor_rgd) || '-',
      'Raça': mat?.breeds?.name || '-',
      'Partida / Lote': b.genetic_material_batches?.batch_number || '-',
      'Rack': b.genetic_material_batches?.rack_code || '-',
      'Central Fornecedora': b.genetic_material_batches?.genetic_centers?.name || '-',
      'Sexagem': mat?.sexing || 'convencional',
      'Envase / Criopreservação': isSemen ? mat?.package_type : mat?.cryopreservation,
      'Botijão': `${b.semen_tanks?.number} - ${b.semen_tanks?.name}`,
      'Caneca': `Caneca ${b.semen_tank_canisters?.position_number}`,
      'Proprietário': b.genetic_clients?.name || 'Estoque Próprio',
      'Saldo Disponível': b.quantity_available,
      'Custo Unitário (R$)': b.genetic_material_batches?.cost_per_unit || 0,
      'Valor Total em Estoque (R$)':
        (b.quantity_available || 0) * (b.genetic_material_batches?.cost_per_unit || 0),
      'Última Movimentação': new Date(b.last_movement_at).toLocaleDateString('pt-BR'),
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventário Genético');

  // Larguras automáticas de coluna
  worksheet['!cols'] = [
    { wch: 15 },
    { wch: 25 },
    { wch: 15 },
    { wch: 15 },
    { wch: 16 },
    { wch: 10 },
    { wch: 22 },
    { wch: 14 },
    { wch: 20 },
    { wch: 22 },
    { wch: 12 },
    { wch: 20 },
    { wch: 16 },
    { wch: 18 },
    { wch: 22 },
    { wch: 18 },
  ];

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `Inventario_Estoque_Genetico_${farmName.replace(/\s+/g, '_')}_${dateStr}.xlsx`);
}

export function exportMovementsToExcel(movements: InventoryMovement[], farmName = 'Fazenda'): void {
  const rows = movements.map((m) => {
    const mat = m.genetic_material_batches?.genetic_materials;
    const isSemen = m.material_type === 'SEMEN';
    const animalName = isSemen 
      ? (mat?.bulls?.name || 'N/D') 
      : (mat?.donor_name || mat?.animals?.tag_number || 'N/D');

    return {
      'Data / Hora': new Date(m.occurred_at).toLocaleString('pt-BR'),
      'Tipo de Operação': m.movement_type,
      'Material': isSemen ? 'Sêmen' : 'Embrião',
      'Animal': animalName,
      'Lote / Partida': m.genetic_material_batches?.batch_number || '-',
      'Quantidade': m.quantity,
      'Proprietário': m.genetic_clients?.name || 'Estoque Próprio',
      'Botijão Origem': m.source_tank?.name || '-',
      'Caneca Origem': m.source_canister ? `Caneca ${m.source_canister.position_number}` : '-',
      'Botijão Destino': m.dest_tank?.name || '-',
      'Caneca Destino': m.dest_canister ? `Caneca ${m.dest_canister.position_number}` : '-',
      'Motivo': m.reason || '-',
      'Observações': m.notes || '-',
      'Operador': m.created_by || '-',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Livro Razão de Movimentações');

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `Movimentacoes_Estoque_Genetico_${farmName.replace(/\s+/g, '_')}_${dateStr}.xlsx`);
}
