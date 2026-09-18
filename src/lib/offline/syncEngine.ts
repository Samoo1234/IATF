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
  type OfflineGeneticBatch,
  type OfflineGeneticTank,
  type OfflineManagementRecord
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
  private isOnline = typeof window !== 'undefined' ? navigator.onLine : true;
  private lastSyncAt: Date | null = null;
  private lastError: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.notify();
        this.syncNow();
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notify();
      });

      // Periodic check every 60s when online
      setInterval(() => {
        if (this.isOnline && !this.isSyncing) {
          this.syncNow();
        }
      }, 60000);
    }
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
      isOnline: this.isOnline,
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
    payload: Record<string, unknown> = {}
  ): Promise<number | undefined> {
    const item: SyncQueueItem = {
      action,
      table,
      record_id: recordId,
      farm_id: farmId,
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

      for (const item of pendingItems) {
        try {
          // Atualiza status para processing
          await offlineDb.sync_queue.update(item.id!, { status: 'processing' });

          if (item.action === 'insert' || item.action === 'update') {
            // Upsert inteligente
            const { error } = await supabase
              .from(item.table)
              .upsert(item.payload, { onConflict: 'id' });

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
            const { error } = await supabase.rpc(item.table, item.payload);
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
    } catch (globalErr: unknown) {
      this.lastError = globalErr instanceof Error ? globalErr.message : String(globalErr);
    } finally {
      this.isSyncing = false;
      this.notify();
    }

    return { synced, failed };
  }

  /**
   * Realiza a baixa imediata no estoque de sêmen offline no IndexedDB
   */
  public async decrementLocalSemenBatch(batchId: string, doses = 1): Promise<boolean> {
    try {
      const batch = await offlineDb.genetic_batches.get(batchId);
      if (batch) {
        const newDoses = Math.max(0, (batch.current_doses || 0) - doses);
        await offlineDb.genetic_batches.update(batchId, {
          current_doses: newDoses,
          updated_at: new Date().toISOString(),
        });
        return true;
      }
    } catch (e) {
      console.warn('[SyncEngine] Falha ao dar baixa local no sêmen:', e);
    }
    return false;
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
    }

    const { data: seasonsData } = await supabase
      .from('reproductive_seasons')
      .select('*')
      .eq('farm_id', farmId);

    if (seasonsData) {
      await offlineDb.seasons.bulkPut(seasonsData as OfflineSeason[]);
    }

    // 2. Lotes de IATF
    updateProgress('Baixando lotes selecionados...', 35);
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

    // 3. Vínculos de Animais nos Lotes
    updateProgress('Baixando matrizes e fichas zootécnicas...', 55);
    const targetLotIds = downloadedLots.map((l) => l.id);
    let downloadedAnimals: OfflineAnimal[] = [];

    if (targetLotIds.length > 0) {
      const { data: lotAnimalsData } = await supabase
        .from('lot_animals')
        .select('*')
        .in('lot_id', targetLotIds);

      if (lotAnimalsData && lotAnimalsData.length > 0) {
        await offlineDb.lot_animals.bulkPut(lotAnimalsData as OfflineLotAnimal[]);

        // Busca detalhes individuais dos animais desses lotes
        const animalIds = Array.from(new Set(lotAnimalsData.map((la) => la.animal_id)));
        if (animalIds.length > 0) {
          const { data: animalsData } = await supabase
            .from('animals')
            .select('*')
            .in('id', animalIds);

          if (animalsData) {
            downloadedAnimals = animalsData as OfflineAnimal[];
            await offlineDb.animals.bulkPut(downloadedAnimals);
          }
        }
      }
    }

    // 4. Protocolos Reprodutivos
    updateProgress('Baixando protocolos hormonais...', 75);
    const { data: protocolsData } = await supabase
      .from('protocols')
      .select('*');

    if (protocolsData) {
      await offlineDb.protocols.bulkPut(protocolsData as OfflineProtocol[]);
    }

    // 5. Estoque de Sêmen da Fazenda (Botijões e Doses)
    updateProgress('Baixando estoque de sêmen e botijões...', 90);
    const { data: tanksData } = await supabase
      .from('genetic_tanks')
      .select('*')
      .eq('farm_id', farmId);

    if (tanksData) {
      await offlineDb.genetic_tanks.bulkPut(tanksData as OfflineGeneticTank[]);
    }

    const { data: batchesData } = await supabase
      .from('genetic_batches')
      .select('*')
      .eq('farm_id', farmId);

    const downloadedBatches = (batchesData as OfflineGeneticBatch[]) || [];
    if (downloadedBatches.length > 0) {
      await offlineDb.genetic_batches.bulkPut(downloadedBatches);
    }

    updateProgress('Base local 100% pronta para o campo!', 100);

    return {
      animalsCount: downloadedAnimals.length,
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
