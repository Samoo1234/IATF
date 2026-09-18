import Dexie, { type Table } from 'dexie';

export interface OfflineFarm {
  id: string;
  organization_id?: string;
  name: string;
  code?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface OfflineSeason {
  id: string;
  farm_id?: string;
  name: string;
  status: 'active' | 'closed';
  start_date?: string;
  end_date?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface OfflineLot {
  id: string;
  farm_id: string;
  season_id?: string;
  code: string;
  name: string;
  protocol_id?: string;
  status?: string;
  females_count?: number;
  inseminated_count?: number;
  pregnant_count?: number;
  updated_at?: string;
  [key: string]: unknown;
}

export interface OfflineAnimal {
  id: string;
  farm_id: string;
  ear_tag: string;
  name?: string;
  category?: string;
  breed?: string;
  status?: string;
  lot_id?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface OfflineLotAnimal {
  id: string;
  lot_id: string;
  animal_id: string;
  farm_id?: string;
  status?: string;
  current_step?: string;
  is_pregnant?: boolean | null;
  updated_at?: string;
  [key: string]: unknown;
}

export interface OfflineProtocol {
  id: string;
  organization_id?: string;
  name: string;
  description?: string;
  steps?: unknown;
  updated_at?: string;
  [key: string]: unknown;
}

export interface OfflineBull {
  id: string;
  farm_id?: string;
  name: string;
  code?: string;
  breed?: string;
  central?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface OfflineGeneticTank {
  id: string;
  farm_id: string;
  name: string;
  serial_number?: string;
  canisters_count?: number;
  status?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface OfflineGeneticCanister {
  id: string;
  tank_id: string;
  number: number;
  color?: string;
  capacity?: number;
  updated_at?: string;
  [key: string]: unknown;
}

export interface OfflineGeneticBatch {
  id: string;
  farm_id: string;
  canister_id?: string;
  tank_id?: string;
  bull_name: string;
  bull_breed?: string;
  batch_number?: string;
  current_doses: number;
  updated_at?: string;
  [key: string]: unknown;
}

export interface OfflineManagementRecord {
  id: string;
  lot_id: string;
  animal_id: string;
  farm_id?: string;
  step_code: string;
  date: string;
  inseminator?: string;
  bull_name?: string;
  semen_batch_id?: string;
  doses_used?: number;
  diagnosis_result?: 'prenhe' | 'prenha' | 'vazia' | 'duvidosa' | 'inconclusivo' | null;
  notes?: string;
  created_at: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface SyncQueueItem {
  id?: number;
  action: 'insert' | 'update' | 'delete' | 'custom_rpc';
  table: string;
  record_id?: string;
  farm_id?: string;
  payload: Record<string, unknown>;
  created_at: string;
  status: 'pending' | 'processing' | 'failed' | 'synced';
  retry_count: number;
  last_error?: string;
}

export interface AuditLogItem {
  id?: number;
  timestamp: string;
  action: string;
  table: string;
  description: string;
  payload?: unknown;
}

export class IATFOfflineDatabase extends Dexie {
  farms!: Table<OfflineFarm, string>;
  seasons!: Table<OfflineSeason, string>;
  lots!: Table<OfflineLot, string>;
  animals!: Table<OfflineAnimal, string>;
  lot_animals!: Table<OfflineLotAnimal, string>;
  protocols!: Table<OfflineProtocol, string>;
  bulls!: Table<OfflineBull, string>;
  genetic_tanks!: Table<OfflineGeneticTank, string>;
  genetic_canisters!: Table<OfflineGeneticCanister, string>;
  genetic_batches!: Table<OfflineGeneticBatch, string>;
  animal_managements!: Table<OfflineManagementRecord, string>;
  sync_queue!: Table<SyncQueueItem, number>;
  audit_log!: Table<AuditLogItem, number>;

  constructor() {
    super('IATF_Master_Offline_DB');
    this.version(1).stores({
      farms: 'id, organization_id, name',
      seasons: 'id, farm_id, status',
      lots: 'id, farm_id, season_id, code, status',
      animals: 'id, farm_id, ear_tag, status, category',
      lot_animals: 'id, lot_id, animal_id, farm_id',
      protocols: 'id, organization_id, name',
      bulls: 'id, farm_id, name, code',
      genetic_tanks: 'id, farm_id, status',
      genetic_canisters: 'id, tank_id, number',
      genetic_batches: 'id, farm_id, canister_id, bull_name, current_doses',
      animal_managements: 'id, lot_id, animal_id, farm_id, step_code, date',
      sync_queue: '++id, status, table, action, farm_id, created_at',
      audit_log: '++id, timestamp, action, table',
    });
  }
}

export const offlineDb = new IATFOfflineDatabase();
