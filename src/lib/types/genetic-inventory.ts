export type GeneticMaterialType = 'SEMEN' | 'EMBRYO';

export type SexingType = 'convencional' | 'femea' | 'macho';

export type PackageType = 
  | 'palheta_025' 
  | 'palheta_050' 
  | 'ampola' 
  | 'mini_tube' 
  | 'pellets' 
  | 'outro';

export type CryopreservationType = 'DT' | 'VT' | 'nao_aplicavel';

export type MovementType = 
  | 'INBOUND'
  | 'OUTBOUND'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'USAGE'
  | 'LOSS'
  | 'ADJUSTMENT_POSITIVE'
  | 'ADJUSTMENT_NEGATIVE'
  | 'REVERSAL';

export interface GeneticCenter {
  id: string;
  organization_id: string;
  name: string;
  short_name?: string | null;
  document_number?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GeneticClient {
  id: string;
  organization_id: string;
  farm_id: string;
  name: string;
  document_number?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SemenTank {
  id: string;
  organization_id: string;
  farm_id: string;
  number: string;
  name: string;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  capacity_notes?: string | null;
  current_nitrogen_level: number;
  minimum_nitrogen_level: number;
  status: 'ativo' | 'manutencao' | 'inativo';
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  total_doses?: number;
  canisters_count?: number;
  last_measurement_date?: string | null;
}

export interface TankCanister {
  id: string;
  organization_id: string;
  farm_id: string;
  tank_id: string;
  position_number: number;
  nickname?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  total_doses?: number;
}

export interface NitrogenMeasurement {
  id: string;
  organization_id: string;
  farm_id: string;
  tank_id: string;
  level_percent: number;
  measured_at: string;
  measured_by?: string | null;
  notes?: string | null;
  created_at: string;
  semen_tanks?: { name: string; number: string } | null;
}

export interface GeneticMaterial {
  id: string;
  organization_id: string;
  farm_id: string;
  type: GeneticMaterialType;
  sire_id?: string | null;
  donor_id?: string | null;
  donor_name?: string | null;
  donor_rgd?: string | null;
  breed_id?: string | null;
  sexing: SexingType;
  package_type: PackageType;
  cryopreservation: CryopreservationType;
  material_code?: string | null;
  description?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  bulls?: { id: string; name: string; code?: string | null; owner_central?: string | null } | null;
  animals?: { id: string; tag_number: string } | null;
  breeds?: { id: string; name: string } | null;
}

export interface GeneticMaterialBatch {
  id: string;
  organization_id: string;
  farm_id: string;
  material_id: string;
  center_id?: string | null;
  batch_number: string;
  rack_code?: string | null;
  manufactured_at?: string | null;
  expires_at?: string | null;
  cost_per_unit: number;
  supplier_name?: string | null;
  notes?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  genetic_materials?: GeneticMaterial;
  genetic_centers?: GeneticCenter | null;
}

export interface InventoryBalance {
  id: string;
  organization_id: string;
  farm_id: string;
  batch_id: string;
  tank_id: string;
  canister_id: string;
  owner_client_id?: string | null;
  quantity_available: number;
  last_movement_at: string;
  version: number;
  created_at: string;
  updated_at: string;
  genetic_material_batches?: {
    id: string;
    batch_number: string;
    rack_code?: string | null;
    cost_per_unit: number;
    supplier_name?: string | null;
    genetic_materials?: {
      id: string;
      type: GeneticMaterialType;
      material_code?: string | null;
      sexing: SexingType;
      package_type: PackageType;
      cryopreservation: CryopreservationType;
      donor_name?: string | null;
      donor_rgd?: string | null;
      bulls?: { name: string; code?: string | null } | null;
      animals?: { tag_number: string } | null;
      breeds?: { name: string } | null;
    };
    genetic_centers?: { name: string; short_name?: string | null } | null;
  };
  semen_tanks?: { id: string; name: string; number: string; current_nitrogen_level: number };
  semen_tank_canisters?: { id: string; position_number: number; nickname?: string | null };
  genetic_clients?: { id: string; name: string; document_number?: string | null } | null;
}

export interface InventoryMovement {
  id: string;
  organization_id: string;
  farm_id: string;
  movement_type: MovementType;
  material_type: GeneticMaterialType;
  batch_id: string;
  quantity: number;
  owner_client_id?: string | null;
  source_tank_id?: string | null;
  source_canister_id?: string | null;
  destination_tank_id?: string | null;
  destination_canister_id?: string | null;
  occurred_at: string;
  reason?: string | null;
  notes?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  transfer_group_id?: string | null;
  idempotency_key?: string | null;
  reversed_movement_id?: string | null;
  created_by?: string | null;
  created_at: string;
  genetic_material_batches?: {
    batch_number: string;
    rack_code?: string | null;
    genetic_materials?: {
      type: GeneticMaterialType;
      sexing: SexingType;
      package_type?: PackageType;
      cryopreservation?: CryopreservationType;
      donor_name?: string | null;
      donor_rgd?: string | null;
      bulls?: { name: string; code?: string | null } | null;
      animals?: { tag_number: string } | null;
      breeds?: { name: string } | null;
    };
    genetic_centers?: { name: string; short_name?: string | null } | null;
  };
  source_tank?: { name: string; number: string } | null;
  source_canister?: { position_number: number; nickname?: string | null } | null;
  dest_tank?: { name: string; number: string } | null;
  dest_canister?: { position_number: number; nickname?: string | null } | null;
  genetic_clients?: { name: string; document_number?: string | null } | null;
}

export interface WithdrawalReceipt {
  id: string;
  organization_id: string;
  farm_id: string;
  movement_id: string;
  receipt_number: string;
  file_path?: string | null;
  file_hash?: string | null;
  recipient_name?: string | null;
  recipient_document?: string | null;
  generated_at: string;
  generated_by?: string | null;
  genetic_inventory_movements?: InventoryMovement;
}

export interface InventoryDashboardMetrics {
  totalSemenDoses: number;
  totalEmbryoDoses: number;
  activeTanksCount: number;
  lowStockItemsCount: number;
  tanksBelowNitrogenCount: number;
  movementsLast30DaysCount: number;
  monthlyStats: {
    month: string;
    inbound: number;
    outbound: number;
  }[];
  tanksSummary: {
    tankId: string;
    tankName: string;
    tankNumber: string;
    currentNitrogen: number;
    minimumNitrogen: number;
    totalDoses: number;
    status: 'ativo' | 'manutencao' | 'inativo';
  }[];
}

export interface AnimalGeneticPosition {
  materialId: string;
  materialType: GeneticMaterialType;
  animalName: string;
  animalCode?: string | null;
  animalRgd?: string | null;
  breedName?: string | null;
  batchId: string;
  batchNumber: string;
  rackCode?: string | null;
  tankId: string;
  tankName: string;
  tankNumber: string;
  canisterId: string;
  canisterPosition: number;
  quantityAvailable: number;
  ownerClientName?: string | null;
  ownerClientId?: string | null;
  centerName?: string | null;
  sexing: SexingType;
}

export interface InboundPayload {
  batchId?: string;
  isNewMaterial: boolean;
  materialType: GeneticMaterialType;
  // If new material:
  sireId?: string;
  donorId?: string;
  donorName?: string;
  donorRgd?: string;
  breedId?: string;
  sexing?: SexingType;
  packageType?: PackageType;
  cryopreservation?: CryopreservationType;
  materialCode?: string;
  description?: string;
  centerId?: string;
  batchNumber?: string;
  rackCode?: string;
  costPerUnit?: number;
  supplierName?: string;
  manufacturedAt?: string;
  expiresAt?: string;
  // Target location:
  tankId: string;
  canisterId: string;
  ownerClientId?: string | null;
  quantity: number;
  reason: string;
  notes?: string;
  occurredAt?: string;
}

export interface OutboundPayload {
  batchId: string;
  materialType: GeneticMaterialType;
  tankId: string;
  canisterId: string;
  ownerClientId?: string | null;
  quantity: number;
  reason: string;
  notes?: string;
  referenceType?: string;
  referenceId?: string;
  recipientName: string;
  recipientDocument?: string;
  occurredAt?: string;
}

export interface TransferPayload {
  batchId: string;
  materialType: GeneticMaterialType;
  sourceTankId: string;
  sourceCanisterId: string;
  destTankId: string;
  destCanisterId: string;
  ownerClientId?: string | null;
  quantity: number;
  reason: string;
  notes?: string;
  occurredAt?: string;
}

export interface AdjustmentPayload {
  batchId: string;
  materialType: GeneticMaterialType;
  tankId: string;
  canisterId: string;
  ownerClientId?: string | null;
  quantity: number;
  isPositive: boolean;
  isLoss: boolean;
  reason: string;
  notes?: string;
}
