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

export interface GlucoseEntry {
  dateYmd: string;
  timeIso: string;
  slotId: string;
  value: number; // mg/dL
}

export interface NoteEntry {
  dateYmd: string;
  timeIso: string;
  slotId: string;
  text: string;
}
