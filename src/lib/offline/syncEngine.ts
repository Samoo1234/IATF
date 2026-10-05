import { createClient } from '@/lib/supabase/client';
import { 
  offlineDb, 
  type SyncQueueItem, 
  type OfflineFarm, 
  type OfflineSeason, 
  type OfflineLot, 
  type OfflineAnimal, 
  type OfflineLotAnimal, 
  type OfflineProtocol, 
  type OfflineBull,
  type OfflineSemenBatch,
  type OfflineManagementRecord,
  type OfflineBreed,
  type OfflineCategory,
  type OfflineProperty,
  type OfflineVeterinarian,
  type OfflineManagementEvent
} from './offlineDb';

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
  lastError: string | null;
}

type SyncListener = (state: SyncState) => void;

class SyncEngine {
  private listeners: Set<SyncListener> = new Set();
  private isSyncing = false;
  private forcedOffline = typeof window !== 'undefined' ? localStorage.getItem('iatf_force_offline') === 'true' : false;
  private isOnline = typeof window !== 'undefined' ? (navigator.onLine && localStorage.getItem('iatf_force_offline') !== 'true') : true;
  private lastSyncAt: Date | null = null;
  private lastError: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (!this.forcedOffline) {
          this.isOnline = true;
          this.notify();
          this.syncNow();
        }
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notify();
      });

      // Periodic check every 60s when online
      setInterval(() => {
        if (this.isOnline && !this.forcedOffline && !this.isSyncing) {
          this.syncNow();
        }
      }, 60000);
    }
  }

  public isOffline(): boolean {
    if (typeof window === 'undefined') return false;
    if (this.forcedOffline) return true;
    if (!navigator.onLine) return true;
    return !this.isOnline;
  }

  public markOffline(): void {
    if (this.isOnline) {
      console.warn('[SyncEngine] Falha de conexão detectada. Alternando para modo offline operacional.');
      this.isOnline = false;
      this.notify();
    }
  }

  public markOnline(): void {
    if (!this.forcedOffline && !this.isOnline) {
      this.isOnline = true;
      this.notify();
    }
  }

  public setForcedOffline(force: boolean): void {
    this.forcedOffline = force;
    if (typeof window !== 'undefined') {
      localStorage.setItem('iatf_force_offline', force ? 'true' : 'false');
    }
    this.isOnline = !force && (typeof window !== 'undefined' ? navigator.onLine : true);
    this.notify();
    if (!force && this.isOnline) {
      this.syncNow();
    }
  }

  public getForcedOffline(): boolean {
    return this.forcedOffline;
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    this.getPendingCount().then((count) => {
      listener(this.getStateWithCount(count));
    });

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(pendingCount?: number): void {
    if (pendingCount !== undefined) {
      const state = this.getStateWithCount(pendingCount);
      this.listeners.forEach((fn) => fn(state));
    } else {
      this.getPendingCount().then((count) => {
        const state = this.getStateWithCount(count);
        this.listeners.forEach((fn) => fn(state));
      });
    }
  }

  private getStateWithCount(pendingCount: number): SyncState {
    return {
      isOnline: !this.isOffline(),
      isSyncing: this.isSyncing,
      pendingCount,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
    };
  }

  public async getPendingCount(): Promise<number> {
    try {
      return await offlineDb.sync_queue
        .where('status')
        .equals('pending')
        .count();
    } catch {
      return 0;
    }
  }

  /**
   * Enfileira uma mutação para envio posterior ou imediato
   */
  public async enqueueMutation(
    action: 'insert' | 'update' | 'delete' | 'custom_rpc',
    table: string,
    recordId?: string,
    farmId?: string,
    payload: Record<string, unknown> = {},
    organizationId?: string
  ): Promise<number | undefined> {
    const finalOrgId = organizationId || 
      (typeof payload.organization_id === 'string' ? payload.organization_id : undefined) ||
      (typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') || undefined : undefined);

    if (finalOrgId && !payload.organization_id && table !== 'custom_rpc') {
      payload.organization_id = finalOrgId;
    }

    const item: SyncQueueItem = {
      action,
      table,
      record_id: recordId,
      farm_id: farmId,
      organization_id: finalOrgId,
      payload,
      created_at: new Date().toISOString(),
      status: 'pending',
      retry_count: 0,
    };

    const id = await offlineDb.sync_queue.add(item);

    // Registra na caixa-preta de auditoria local
    await offlineDb.audit_log.add({
      timestamp: new Date().toISOString(),
      action: `${action}:${table}`,
      table,
      description: `Ação offline registrada para o registro ${recordId || 'novo'}`,
      payload,
    });

    this.notify();

    // Se estiver online, tenta enviar imediatamente
    if (this.isOnline && !this.isSyncing) {
      this.syncNow();
    }

    return id;
  }

  /**
   * Executa a sincronização de todas as alterações pendentes da fila (FIFO)
   */
  public async syncNow(): Promise<{ synced: number; failed: number }> {
    if (this.isSyncing) {
      return { synced: 0, failed: 0 };
    }

    if (typeof window !== 'undefined' && !navigator.onLine) {
      this.isOnline = false;
      this.notify();
      return { synced: 0, failed: 0 };
    }

    this.isSyncing = true;
    this.lastError = null;
    this.notify();

    let synced = 0;
    let failed = 0;

    try {
      const pendingItems = await offlineDb.sync_queue
        .where('status')
        .equals('pending')
        .sortBy('id');

      if (pendingItems.length === 0) {
        this.isSyncing = false;
        this.lastSyncAt = new Date();
        this.notify(0);
        return { synced: 0, failed: 0 };
      }

      const supabase = createClient();
      const currentOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;

      for (const item of pendingItems) {
        try {
          // Atualiza status para processing
          await offlineDb.sync_queue.update(item.id!, { status: 'processing' });

          const payload = { ...item.payload };
          if (!payload.organization_id && (item.organization_id || currentOrgId)) {
            payload.organization_id = item.organization_id || currentOrgId;
          }

          if (item.action === 'insert' || item.action === 'update') {
            // Upsert inteligente
            const { error } = await supabase
              .from(item.table)
              .upsert(payload, { onConflict: 'id' });

            if (error) throw error;
          } else if (item.action === 'delete') {
            if (item.record_id) {
              const { error } = await supabase
                .from(item.table)
                .delete()
                .eq('id', item.record_id);

              if (error) throw error;
            }
          } else if (item.action === 'custom_rpc') {
            const { error } = await supabase.rpc(item.table, payload);
            if (error) throw error;
          }

          // Removido da fila após sucesso
          await offlineDb.sync_queue.delete(item.id!);
          synced++;
        } catch (err: unknown) {
          failed++;
          const errorMessage = err instanceof Error ? err.message : String(err);
          this.lastError = errorMessage;

          await offlineDb.sync_queue.update(item.id!, {
            status: 'pending',
            retry_count: (item.retry_count || 0) + 1,
            last_error: errorMessage,
          });

          console.warn(`[SyncEngine] Erro ao sincronizar item ${item.id}:`, err);
        }
      }

      this.lastSyncAt = new Date();
      this.syncDownAllData().catch(() => {});
    } catch (globalErr: unknown) {
      this.lastError = globalErr instanceof Error ? globalErr.message : String(globalErr);
    } finally {
      this.isSyncing = false;
      this.notify();
    }

    return { synced, failed };
  }

  /**
   * Baixa e atualiza todos os dados essenciais da organização no IndexedDB
   * garantindo que todo o sistema funcione 100% offline.
   */
  public async syncDownAllData(orgIdParam?: string): Promise<void> {
    if (typeof window !== 'undefined' && !navigator.onLine) return;

    try {
      const supabase = createClient();
      const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('iatf_current_org_id') : null;
      const orgId = orgIdParam || storedOrgId;
      if (!orgId) return;

      const [
        farmsRes,
        propsRes,
        seasonsRes,
        protosRes,
        bullsRes,
        semenRes,
        breedsRes,
        catsRes,
        animalsRes,
        lotsRes,
        lotAnimalsRes,
        eventsRes,
        vetsRes
      ] = await Promise.all([
        supabase.from('farms').select('*').eq('organization_id', orgId),
        supabase.from('properties').select('*').eq('organization_id', orgId),
        supabase.from('reproductive_seasons').select('*').eq('organization_id', orgId),
        supabase.from('protocols').select('*, protocol_steps(*)').eq('organization_id', orgId),
        supabase.from('bulls').select('*, breeds(id, name)').eq('organization_id', orgId),
        supabase.from('semen_batches').select('*, bulls(name, code)').eq('organization_id', orgId),
        supabase.from('breeds').select('*').eq('organization_id', orgId),
        supabase.from('animal_categories').select('*').eq('organization_id', orgId),
        supabase.from('animals').select('*, breeds(name), animal_categories(name), properties(name), farms(name)').eq('organization_id', orgId).eq('status', 'active'),
        supabase.from('iatf_lots').select('*').eq('organization_id', orgId),
        supabase.from('iatf_lot_animals').select('*, animals(tag_number, reproductive_status, breeds(name), animal_categories(name), properties(name)), bulls(name), semen_batches(batch_number)').limit(5000),
        supabase.from('management_events').select('*').eq('organization_id', orgId),
        supabase.from('veterinarians').select('*').eq('organization_id', orgId),
      ]);

      if (farmsRes.data && farmsRes.data.length > 0) {
        await offlineDb.farms.bulkPut(farmsRes.data as OfflineFarm[]);
      }
      if (propsRes.data && propsRes.data.length > 0) {
        await offlineDb.properties.bulkPut(propsRes.data as OfflineProperty[]);
      }
      if (seasonsRes.data && seasonsRes.data.length > 0) {
        await offlineDb.seasons.bulkPut(seasonsRes.data as OfflineSeason[]);
      }
      if (protosRes.data && protosRes.data.length > 0) {
        await offlineDb.protocols.bulkPut(protosRes.data as OfflineProtocol[]);
      }
      if (bullsRes.data && bullsRes.data.length > 0) {
        await offlineDb.bulls.bulkPut(bullsRes.data as OfflineBull[]);
      }
      if (semenRes.data && semenRes.data.length > 0) {
        await offlineDb.semen_batches.bulkPut(semenRes.data as unknown as OfflineSemenBatch[]);
      }
      if (breedsRes.data && breedsRes.data.length > 0) {
        await offlineDb.breeds.bulkPut(breedsRes.data as OfflineBreed[]);
      }
      if (catsRes.data && catsRes.data.length > 0) {
        await offlineDb.categories.bulkPut(catsRes.data as OfflineCategory[]);
      }
      if (animalsRes.data && animalsRes.data.length > 0) {
        await offlineDb.animals.bulkPut(
          animalsRes.data.map((a: Record<string, unknown>): OfflineAnimal => ({
            id: a.id as string,
            farm_id: a.farm_id as string,
            ear_tag: ((a.tag_number || a.ear_tag) as string) || '',
            tag_number: ((a.tag_number || a.ear_tag) as string) || '',
            name: ((a.tag_number || a.ear_tag) as string) || '',
            status: (a.status as string) || 'active',
            reproductive_status: (a.reproductive_status as string) || 'vazia',
            category: ((a.animal_categories as { name?: string })?.name || a.category_id || undefined) as string | undefined,
            breed: ((a.breeds as { name?: string })?.name || a.breed_id || undefined) as string | undefined,
            breed_id: (a.breed_id as string) || undefined,
            category_id: (a.category_id as string) || undefined,
            property_id: (a.property_id as string) || undefined,
            organization_id: (a.organization_id as string) || orgId,
            updated_at: (a.updated_at as string) || new Date().toISOString(),
          }))
        );
      }
      if (lotsRes.data && lotsRes.data.length > 0) {
        await offlineDb.lots.bulkPut(lotsRes.data as OfflineLot[]);
      }
      if (lotAnimalsRes.data && lotAnimalsRes.data.length > 0) {
        await offlineDb.lot_animals.bulkPut(lotAnimalsRes.data as unknown as OfflineLotAnimal[]);
      }
      if (eventsRes.data && eventsRes.data.length > 0) {
        await offlineDb.management_events.bulkPut(eventsRes.data as OfflineManagementEvent[]);
      }
      if (vetsRes.data && vetsRes.data.length > 0) {
        await offlineDb.veterinarians.bulkPut(vetsRes.data as OfflineVeterinarian[]);
      }
    } catch (err) {
      console.warn('[SyncEngine] Aviso durante syncDownAllData:', err);
    }
  }

  /**
   * Realiza a baixa imediata no estoque de sêmen offline no IndexedDB
   */
  public async decrementLocalSemenBatch(batchId: string, doses = 1): Promise<boolean> {
    try {
      // 1. Atualizar em semen_batches
      const semenBatch = await offlineDb.semen_batches.get(batchId);
      if (semenBatch) {
        await offlineDb.semen_batches.update(batchId, {
          used_quantity: (semenBatch.used_quantity || 0) + doses,
          updated_at: new Date().toISOString(),
        });
      }

      // 2. Atualizar em genetic_batches se existir
      const batch = await offlineDb.genetic_batches.get(batchId);
      if (batch) {
        const newDoses = Math.max(0, (batch.current_doses || 0) - doses);
        await offlineDb.genetic_batches.update(batchId, {
          current_doses: newDoses,
          updated_at: new Date().toISOString(),
        });
      }
      return true;
    } catch (e) {
      console.warn('[SyncEngine] Falha ao dar baixa local no sêmen:', e);
    }
    return false;
  }

  /**
   * Grava início de protocolo IATF (D0) em modo offline
   */
  public async recordOfflineManagementStart(params: {
    id: string;
    organization_id: string;
    farm_id: string;
    animal_id: string;
    season_id?: string | null;
    protocol_id: string;
    lot_id?: string | null;
    start_date: string;
    d0_executed_at?: string | null;
    d0_responsible?: string | null;
    d0_notes?: string | null;
    custom_d9_date?: string | null;
    custom_ia_date?: string | null;
    custom_dg_date?: string | null;
  }): Promise<void> {
    const record: OfflineManagementRecord = {
      id: params.id,
      lot_id: params.lot_id || '',
      animal_id: params.animal_id,
      farm_id: params.farm_id,
      step_code: 'D0',
      date: params.start_date,
      inseminator: params.d0_responsible || undefined,
      notes: params.d0_notes || undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await offlineDb.animal_managements.put(record);

    await this.enqueueMutation('insert', 'animal_managements', params.id, params.farm_id, {
      id: params.id,
      organization_id: params.organization_id,
      farm_id: params.farm_id,
      animal_id: params.animal_id,
      season_id: params.season_id || null,
      protocol_id: params.protocol_id,
      lot_id: params.lot_id || null,
      cycle_number: 1,
      start_date: params.start_date,
      d0_executed_at: params.d0_executed_at || null,
      d0_responsible: params.d0_responsible || null,
      d0_notes: params.d0_notes || null,
      d9_date: params.custom_d9_date || null,
      ia_date: params.custom_ia_date || null,
      dg_date: params.custom_dg_date || null,
      status: 'em_andamento',
      pregnancy_status: 'pendente',
    }, params.organization_id);
  }

  /**
   * Grava etapa D0 em modo offline
   */
  public async recordOfflineStepD0(
    managementId: string,
    data: { executed_at: string; responsible?: string | null; notes?: string | null }
  ): Promise<void> {
    const existing = await offlineDb.animal_managements.get(managementId);
    if (existing) {
      await offlineDb.animal_managements.update(managementId, {
        step_code: 'D0',
        date: data.executed_at,
        inseminator: data.responsible || existing.inseminator,
        notes: data.notes || existing.notes,
        updated_at: new Date().toISOString(),
      });
    }

    await this.enqueueMutation('update', 'animal_managements', managementId, undefined, {
      id: managementId,
      d0_executed_at: data.executed_at,
      d0_responsible: data.responsible || null,
      d0_notes: data.notes || null,
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Grava etapa D9 (retirada de implante) em modo offline
   */
  public async recordOfflineStepD9(
    managementId: string,
    data: { executed_at: string; responsible?: string | null; device_loss?: boolean; notes?: string | null }
  ): Promise<void> {
    const existing = await offlineDb.animal_managements.get(managementId);
    if (existing) {
      await offlineDb.animal_managements.update(managementId, {
        step_code: 'D9',
        date: data.executed_at,
        inseminator: data.responsible || existing.inseminator,
        notes: data.notes || existing.notes,
        updated_at: new Date().toISOString(),
      });
    }

    await this.enqueueMutation('update', 'animal_managements', managementId, undefined, {
      id: managementId,
      d9_executed_at: data.executed_at,
      d9_responsible: data.responsible || null,
      d9_device_loss: Boolean(data.device_loss),
      d9_notes: data.notes || null,
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Grava etapa IA em modo offline com baixa imediata no estoque de sêmen
   */
  public async recordOfflineStepIA(
    managementId: string,
    data: {
      animal_id: string;
      executed_at: string;
      bull_id: string;
      semen_batch_id: string;
      inseminator_name?: string | null;
      ecc_ia?: string | null;
      notes?: string | null;
    }
  ): Promise<void> {
    // 1. Atualizar registro local de manejo
    const existing = await offlineDb.animal_managements.get(managementId);
    if (existing) {
      await offlineDb.animal_managements.update(managementId, {
        step_code: 'IA',
        date: data.executed_at,
        semen_batch_id: data.semen_batch_id,
        inseminator: data.inseminator_name || existing.inseminator,
        notes: data.notes || existing.notes,
        updated_at: new Date().toISOString(),
      });
    }

    // 2. Dar baixa local de 1 dose do sêmen
    if (data.semen_batch_id) {
      await this.decrementLocalSemenBatch(data.semen_batch_id, 1);
    }

    // 3. Atualizar status da matriz localmente
    try {
      const animal = await offlineDb.animals.get(data.animal_id);
      if (animal) {
        await offlineDb.animals.update(data.animal_id, {
          status: 'inseminada',
          updated_at: new Date().toISOString(),
        });
      }

      // Atualizar lot_animals local
      const lotAnimals = await offlineDb.lot_animals
        .where('animal_id')
        .equals(data.animal_id)
        .toArray();

      for (const la of lotAnimals) {
        await offlineDb.lot_animals.update(la.id, {
          bull_id: data.bull_id,
          semen_batch_id: data.semen_batch_id,
          inseminator_name: data.inseminator_name || null,
          current_step: 'IA',
          updated_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('Erro ao atualizar animal/lot_animal localmente na IA:', e);
    }

    // 4. Enfileirar mutações para sincronização
    await this.enqueueMutation('update', 'animal_managements', managementId, undefined, {
      id: managementId,
      ia_executed_at: data.executed_at,
      bull_id: data.bull_id,
      semen_batch_id: data.semen_batch_id,
      inseminator_name: data.inseminator_name || null,
      ecc_ia: data.ecc_ia ? parseFloat(data.ecc_ia) : null,
      ia_notes: data.notes || null,
      updated_at: new Date().toISOString(),
    });

    await this.enqueueMutation('update', 'animals', data.animal_id, undefined, {
      id: data.animal_id,
      reproductive_status: 'inseminada',
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Grava diagnóstico de gestação (DG) no manejo em modo offline
   */
  public async recordOfflineStepDG(
    managementId: string,
    data: {
      animal_id: string;
      executed_at: string;
      pregnancy_status: 'prenha' | 'vazia' | 'inconclusivo';
      ecc_dg?: number | null;
      notes?: string | null;
    }
  ): Promise<void> {
    const isPregnant = data.pregnancy_status === 'prenha';
    const repStatus = isPregnant ? 'prenha' : data.pregnancy_status === 'vazia' ? 'vazia' : 'indefinido';

    // 1. Atualizar registro local
    const existing = await offlineDb.animal_managements.get(managementId);
    if (existing) {
      await offlineDb.animal_managements.update(managementId, {
        step_code: 'DG',
        date: data.executed_at,
        diagnosis_result: data.pregnancy_status === 'inconclusivo' ? 'duvidosa' : data.pregnancy_status,
        notes: data.notes || existing.notes,
        updated_at: new Date().toISOString(),
      });
    }

    // 2. Atualizar status na matriz local
    try {
      const animal = await offlineDb.animals.get(data.animal_id);
      if (animal) {
        await offlineDb.animals.update(data.animal_id, {
          status: repStatus,
          updated_at: new Date().toISOString(),
        });
      }

      const lotAnimals = await offlineDb.lot_animals
        .where('animal_id')
        .equals(data.animal_id)
        .toArray();

      for (const la of lotAnimals) {
        await offlineDb.lot_animals.update(la.id, {
          pregnancy_status: data.pregnancy_status,
          ecc_dg: data.ecc_dg || null,
          current_step: 'DG',
          is_pregnant: isPregnant,
          updated_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('Erro ao atualizar animal localmente no DG:', e);
    }

    // 3. Enfileirar mutações
    await this.enqueueMutation('update', 'animal_managements', managementId, undefined, {
      id: managementId,
      dg_executed_at: data.executed_at,
      pregnancy_status: data.pregnancy_status,
      ecc_dg: data.ecc_dg ?? null,
      dg_notes: data.notes || null,
      status: isPregnant ? 'concluido' : 'em_andamento',
      updated_at: new Date().toISOString(),
    });

    await this.enqueueMutation('update', 'animals', data.animal_id, undefined, {
      id: data.animal_id,
      reproductive_status: repStatus,
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Atualiza DG diretamente no vínculo de lot_animals
   */
  public async recordOfflineLotAnimalDG(
    lotAnimalId: string,
    pregnancyStatus: 'prenha' | 'vazia' | 'repeticao',
    eccDg?: number
  ): Promise<void> {
    try {
      await offlineDb.lot_animals.update(lotAnimalId, {
        pregnancy_status: pregnancyStatus,
        ecc_dg: eccDg !== undefined ? eccDg : null,
        is_pregnant: pregnancyStatus === 'prenha',
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Erro ao atualizar lot_animal offline:', e);
    }

    const updatePayload: Record<string, unknown> = {
      id: lotAnimalId,
      pregnancy_status: pregnancyStatus,
      updated_at: new Date().toISOString(),
    };
    if (eccDg !== undefined) updatePayload.ecc_dg = eccDg;
    if (pregnancyStatus !== 'prenha') updatePayload.expected_parturition_date = null;

    await this.enqueueMutation('update', 'iatf_lot_animals', lotAnimalId, undefined, updatePayload);
  }

  /**
   * Grava criação de animal (matriz) em modo offline
   */
  public async recordOfflineAnimal(animal: {
    id: string;
    organization_id: string;
    farm_id: string;
    property_id?: string | null;
    tag_number: string;
    rfid_number?: string | null;
    breed_id?: string | null;
    category_id?: string | null;
    reproductive_status?: string;
    birth_date?: string | null;
    sex?: string;
    status?: string;
  }): Promise<void> {
    const offlineAnimal: OfflineAnimal = {
      id: animal.id,
      farm_id: animal.farm_id,
      ear_tag: animal.tag_number,
      tag_number: animal.tag_number,
      name: animal.tag_number,
      status: animal.status || 'active',
      reproductive_status: animal.reproductive_status || 'vazia',
      category: animal.category_id || undefined,
      breed: animal.breed_id || undefined,
      property_id: animal.property_id || undefined,
      organization_id: animal.organization_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await offlineDb.animals.put(offlineAnimal);

    await this.enqueueMutation('insert', 'animals', animal.id, animal.farm_id, {
      id: animal.id,
      organization_id: animal.organization_id,
      farm_id: animal.farm_id,
      property_id: animal.property_id || null,
      tag_number: animal.tag_number,
      rfid_number: animal.rfid_number || null,
      breed_id: animal.breed_id || null,
      category_id: animal.category_id || null,
      reproductive_status: animal.reproductive_status || 'vazia',
      birth_date: animal.birth_date || null,
      sex: animal.sex || 'F',
      status: animal.status || 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, animal.organization_id);
  }

  /**
   * Grava criação e vinculação de matriz diretamente a um lote em modo offline
   */
  public async recordOfflineCreateAndAddAnimalToLot(params: {
    lotId: string;
    animalId: string;
    lotAnimalId: string;
    organization_id: string;
    farm_id: string;
    property_id?: string | null;
    tag_number: string;
    rfid_number?: string | null;
    breed_id?: string | null;
    category_id?: string | null;
    reproductive_status?: string;
    birth_date?: string | null;
    breed_name?: string | null;
    category_name?: string | null;
  }): Promise<void> {
    // 1. Salvar o animal localmente
    await this.recordOfflineAnimal({
      id: params.animalId,
      organization_id: params.organization_id,
      farm_id: params.farm_id,
      property_id: params.property_id,
      tag_number: params.tag_number,
      rfid_number: params.rfid_number,
      breed_id: params.breed_id,
      category_id: params.category_id,
      reproductive_status: params.reproductive_status,
      birth_date: params.birth_date,
    });

    // 2. Salvar o vínculo do lote localmente
    const lotAnimalRecord: OfflineLotAnimal = {
      id: params.lotAnimalId,
      lot_id: params.lotId,
      animal_id: params.animalId,
      farm_id: params.farm_id,
      status: 'active',
      pregnancy_status: 'pendente',
      is_pregnant: null,
      animals: {
        tag_number: params.tag_number,
        reproductive_status: params.reproductive_status || 'vazia',
        breeds: params.breed_name ? { name: params.breed_name } : null,
        animal_categories: params.category_name ? { name: params.category_name } : null,
        properties: null,
      },
      bulls: null,
      semen_batches: null,
      updated_at: new Date().toISOString(),
    };
    await offlineDb.lot_animals.put(lotAnimalRecord);

    // 3. Atualizar o contador de animais no lote local
    const lot = await offlineDb.lots.get(params.lotId);
    if (lot) {
      await offlineDb.lots.update(params.lotId, {
        females_count: ((lot.females_count as number) || 0) + 1,
        updated_at: new Date().toISOString(),
      });
    }

    // 4. Enfileirar mutação de vinculação
    await this.enqueueMutation('insert', 'iatf_lot_animals', params.lotAnimalId, params.farm_id, {
      id: params.lotAnimalId,
      lot_id: params.lotId,
      animal_id: params.animalId,
      pregnancy_status: 'pendente',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, params.organization_id);
  }

  /**
   * Salva ou atualiza um registro de manejo de campo no IndexedDB
   */
  public async recordOfflineManagement(record: OfflineManagementRecord): Promise<void> {
    await offlineDb.animal_managements.put(record);

    // Se houve uso de sêmen, baixa na base local
    if (record.semen_batch_id && record.doses_used) {
      await this.decrementLocalSemenBatch(record.semen_batch_id, record.doses_used);
    }

    // Se o animal pertence a um lote, atualiza a etapa no lot_animals local
    if (record.lot_id && record.animal_id) {
      const lotAnimal = await offlineDb.lot_animals
        .where({ lot_id: record.lot_id, animal_id: record.animal_id })
        .first();

      if (lotAnimal) {
        await offlineDb.lot_animals.update(lotAnimal.id, {
          current_step: record.step_code,
          is_pregnant: record.diagnosis_result === 'prenhe' ? true : record.diagnosis_result === 'vazia' ? false : lotAnimal.is_pregnant,
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Enfileira para sincronização
    await this.enqueueMutation('insert', 'animal_managements', record.id, record.farm_id, {
      id: record.id,
      lot_id: record.lot_id,
      animal_id: record.animal_id,
      farm_id: record.farm_id,
      step_code: record.step_code,
      date: record.date,
      inseminator: record.inseminator,
      bull_name: record.bull_name,
      semen_batch_id: record.semen_batch_id,
      doses_used: record.doses_used || 1,
      diagnosis_result: record.diagnosis_result,
      notes: record.notes,
      created_at: record.created_at || new Date().toISOString(),
    });
  }

  /**
   * Carga seletiva pré-curral: Baixa dados específicos da fazenda e lotes
   */
  public async downloadFarmDataForCurral(
    farmId: string,
    seasonId?: string,
    lotIds?: string[],
    onProgress?: (progress: { step: string; percent: number }) => void
  ): Promise<{ animalsCount: number; lotsCount: number; batchesCount: number }> {
    const supabase = createClient();
    const updateProgress = (step: string, percent: number) => {
      if (onProgress) onProgress({ step, percent });
    };

    updateProgress('Conectando ao servidor...', 5);

    // 1. Fazenda e Estações
    updateProgress('Baixando dados da propriedade e estações...', 15);
    const { data: farmData } = await supabase
      .from('farms')
      .select('*')
      .eq('id', farmId)
      .single();

    if (farmData) {
      await offlineDb.farms.put(farmData as OfflineFarm);
      if (farmData.organization_id && typeof window !== 'undefined') {
        localStorage.setItem('iatf_current_org_id', farmData.organization_id);
      }
    }

    const { data: seasonsData } = await supabase
      .from('reproductive_seasons')
      .select('*')
      .eq('farm_id', farmId);

    if (seasonsData && seasonsData.length > 0) {
      await offlineDb.seasons.bulkPut(seasonsData as OfflineSeason[]);
    }

    // 1b. Raças, Categorias e Retiros/Propriedades da Fazenda
    updateProgress('Baixando raças, categorias e retiros...', 22);
    try {
      const [breedsRes, catsRes, propsRes] = await Promise.all([
        supabase.from('breeds').select('*'),
        supabase.from('animal_categories').select('*'),
        supabase.from('properties').select('*').eq('farm_id', farmId),
      ]);

      if (breedsRes.data && breedsRes.data.length > 0) {
        await offlineDb.breeds.bulkPut(breedsRes.data as OfflineBreed[]);
      }
      if (catsRes.data && catsRes.data.length > 0) {
        await offlineDb.categories.bulkPut(catsRes.data as OfflineCategory[]);
      }
      if (propsRes.data && propsRes.data.length > 0) {
        await offlineDb.properties.bulkPut(propsRes.data as OfflineProperty[]);
      }
    } catch (e) {
      console.warn('Aviso ao sincronizar raças/categorias para o curral:', e);
    }

    // 2. Lotes de IATF
    updateProgress('Baixando lotes selecionados...', 30);
    let lotQuery = supabase.from('iatf_lots').select('*').eq('farm_id', farmId);
    if (lotIds && lotIds.length > 0) {
      lotQuery = lotQuery.in('id', lotIds);
    } else if (seasonId && seasonId !== 'all') {
      lotQuery = lotQuery.eq('season_id', seasonId);
    }
    const { data: lotsData } = await lotQuery;
    const downloadedLots = (lotsData as OfflineLot[]) || [];
    if (downloadedLots.length > 0) {
      await offlineDb.lots.bulkPut(downloadedLots);
    }

    // 3. Vínculos de Animais nos Lotes (tabela correta: iatf_lot_animals)
    updateProgress('Baixando matrizes e fichas zootécnicas...', 50);
    const targetLotIds = downloadedLots.map((l) => l.id);
    let downloadedLotAnimalsCount = 0;

    if (targetLotIds.length > 0) {
      const { data: lotAnimalsData } = await supabase
        .from('iatf_lot_animals')
        .select(`
          *,
          animals (tag_number, reproductive_status, breeds(name), animal_categories(name), properties(name)),
          bulls (name),
          semen_batches (batch_number)
        `)
        .in('lot_id', targetLotIds);

      if (lotAnimalsData && lotAnimalsData.length > 0) {
        downloadedLotAnimalsCount = lotAnimalsData.length;
        await offlineDb.lot_animals.bulkPut(lotAnimalsData as unknown as OfflineLotAnimal[]);

        // Busca detalhes individuais dos animais
        const animalIds = Array.from(new Set(lotAnimalsData.map((la) => la.animal_id)));
        if (animalIds.length > 0) {
          const { data: animalsData } = await supabase
            .from('animals')
            .select('*')
            .in('id', animalIds);

          if (animalsData && animalsData.length > 0) {
            await offlineDb.animals.bulkPut(animalsData as OfflineAnimal[]);
          }
        }
      }
    }

    // 4. Protocolos Reprodutivos
    updateProgress('Baixando protocolos hormonais...', 70);
    const { data: protocolsData } = await supabase
      .from('protocols')
      .select('*, protocol_steps(*)');

    if (protocolsData && protocolsData.length > 0) {
      await offlineDb.protocols.bulkPut(protocolsData as OfflineProtocol[]);
    }

    // 5. Touros e Partidas de Sêmen
    updateProgress('Baixando reprodutores e estoque de sêmen...', 85);
    const { data: bullsData } = await supabase
      .from('bulls')
      .select('*, breeds(id, name)');

    if (bullsData && bullsData.length > 0) {
      await offlineDb.bulls.bulkPut(bullsData as OfflineBull[]);
    }

    const { data: semenBatchesData } = await supabase
      .from('semen_batches')
      .select('*, bulls(name, code)');

    const downloadedBatches = semenBatchesData || [];
    if (downloadedBatches.length > 0) {
      await offlineDb.semen_batches.bulkPut(downloadedBatches as unknown as OfflineSemenBatch[]);
    }

    updateProgress('Base local 100% pronta para o campo!', 100);

    return {
      animalsCount: downloadedLotAnimalsCount,
      lotsCount: downloadedLots.length,
      batchesCount: downloadedBatches.length,
    };
  }

  /**
   * Exporta a caixa-preta de auditoria local em formato JSON
   */
  public async exportBlackboxBackup(): Promise<string> {
    const logs = await offlineDb.audit_log.toArray();
    const queue = await offlineDb.sync_queue.toArray();
    const managements = await offlineDb.animal_managements.toArray();

    const backup = {
      exportedAt: new Date().toISOString(),
      managementsCount: managements.length,
      pendingQueueCount: queue.length,
      auditLogsCount: logs.length,
      managements,
      pendingQueue: queue,
      auditLogs: logs,
    };

    return JSON.stringify(backup, null, 2);
  }
}

export const syncEngine = new SyncEngine();
