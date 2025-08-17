export type DoseType = 'basal' | 'bolus' | 'both';

export interface SlotConfig {
  id: string;
  label: string;
  startMin: number;
  endMin: number;
  kind: DoseType;
}

export interface DoseEntry {
  dateYmd: string;
  timeIso: string;
  slotId: string;
  type: 'basal' | 'bolus';
  units: number;
  note?: string;
}
