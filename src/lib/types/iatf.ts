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

export interface ReproductiveSeason {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'closed';
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
