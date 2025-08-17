// Dispositivo físico donde se presenta la insulina
export type DeviceType = 'vial' | 'pen';

// Clasificación terapéutica principal
export type TherapyClass = 'prandial' | 'basal' | 'mix';

// Velocidad/acción farmacocinética
export type ActionSpeed = 'ultrarrapida' | 'rapida' | 'intermedia' | 'prolongada' | 'mixta';

export interface InsulinBrand {
  id: string;             // id único (slug)
  device: DeviceType;     // vial o pluma
  tradeName: string;      // nombre comercial (p.ej. "Fiasp")
  substance?: string;     // principio activo (aspart, lispro…)
  concentration?: string; // 100 U/mL, 200 U/mL, 300 U/mL...
  class: TherapyClass;    // prandial | basal | mix
  speed: ActionSpeed;     // ultrarrapida | rapida | intermedia | prolongada | mixta
  notes?: string;         // FlexTouch, KwikPen, etc.
}
