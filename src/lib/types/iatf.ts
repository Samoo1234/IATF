export interface Farm {
  id: string;
  name: string;
  owner_name: string;
  technical_responsible: string;
  city?: string;
  state?: string;
}

export interface Property {
  id: string;
  farm_id: string;
  name: string;
}

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

export interface ReproductiveSeason {
  id: string;
  organization_id?: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'closed';
  created_at?: string;
}

export interface ProtocolStep {
  code: string;
  name: string;
  day_offset: number;
  instruction: string;
}

export interface Protocol {
  id: string;
  name: string;
  description: string;
  steps: ProtocolStep[];
}

export interface Bull {
  id: string;
  name: string;
  code?: string;
  breed: string;
  owner_central?: string;
}

export interface SemenBatch {
  id: string;
  bull_id: string;
  bull_name: string;
  batch_number: string;
  initial_quantity: number;
  used_quantity: number;
  lost_quantity: number;
  current_stock: number;
}

export interface IATFLot {
  id: string;
  code: string;
  farm_name: string;
  property_name: string;
  protocol_name: string;
  start_date: string;
  ia_date: string;
  dg_date: string;
  planned_qty: number;
  worked_qty: number;
  inseminated_qty: number;
  pregnancies: number;
  empty: number;
  pregnancy_rate: number;
  responsible: string;
  status: 'concluido' | 'em_andamento' | 'planejado';
}

export interface LotAnimal {
  id: string;
  tag_number: string;
  category: string;
  breed: string;
  ecc_ia: number;
  bull_name: string;
  semen_batch: string;
  inseminator: string;
  pregnancy_status: 'Prenha' | 'Vazia' | 'Pendente';
  ecc_dg?: number;
  expected_parturition?: string;
  notes?: string;
}

export interface AnimalManagement {
  id: string;
  organization_id?: string;
  farm_id: string;
  animal_id: string;
  season_id?: string | null;
  protocol_id?: string | null;
  lot_id?: string | null;
  cycle_number: number;
  start_date: string;
  d7_date?: string | null;
  d9_date?: string | null;
  ia_date?: string | null;
  dg_date?: string | null;
  d0_executed_at?: string | null;
  d0_responsible?: string | null;
  d0_notes?: string | null;
  d9_executed_at?: string | null;
  d9_responsible?: string | null;
  d9_device_loss?: boolean;
  d9_notes?: string | null;
  ia_executed_at?: string | null;
  bull_id?: string | null;
  semen_batch_id?: string | null;
  inseminator_name?: string | null;
  ecc_ia?: number | null;
  ia_notes?: string | null;
  dg_executed_at?: string | null;
  pregnancy_status: 'pendente' | 'prenha' | 'vazia' | 'inconclusivo';
  ecc_dg?: number | null;
  expected_parturition_date?: string | null;
  dg_notes?: string | null;
  status: 'em_andamento' | 'concluido' | 'cancelado';
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  protocols?: { name: string; number_of_managements?: number } | null;
  bulls?: { name: string; code?: string | null } | null;
  semen_batches?: { batch_number: string } | null;
  reproductive_seasons?: { name: string } | null;
  iatf_lots?: { code: string } | null;
}

export interface ManagementEvent {
  id: string;
  lot_code: string;
  step_code: string;
  step_name: string;
  planned_date: string;
  execution_date?: string;
  start_time?: string;
  end_time?: string;
  animals_worked: number;
  responsible: string;
  status: 'concluido' | 'proximo' | 'atrasado';
  notes?: string;
}

export interface DashboardMetrics {
  total_animals: number;
  active_lots: number;
  total_inseminations: number;
  total_diagnoses: number;
  total_pregnancies: number;
  overall_pregnancy_rate: number;
  total_device_losses: number;
  pending_managements: number;
}
