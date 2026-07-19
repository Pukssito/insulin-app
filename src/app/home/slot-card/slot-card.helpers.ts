import { SlotConfig } from '../../../models/models';
import { formatRange } from '../../../utils/date-utils';

/**
 * Funciones puras usadas por <app-slot-card>. Se extrajeron aquí
 * para poder testearlas sin cargar el módulo de Stencil/Ionic
 * (que rompe en jsdom). El componente las invoca desde sus getters
 * y métodos; la lógica vive aquí.
 */

// ============================================================
//  Identidad visual: icono del slot
// ============================================================

/** Icono para slots de tipo basal: cronómetro (momento del día, no comida). */
const BASAL_ICON = '⏱';

/** Icono por defecto si un slot de comida no matchea ningún patrón. */
const DEFAULT_ICON = '◌';

/**
 * Patrones RegExp en orden de prioridad para mapear slot.id → emoji.
 * Solo se aplican a slots con comida (bolus/mix). Los slots de tipo
 * `basal` se tratan aparte: como el usuario puede configurarlos a
 * cualquier hora del día (no solo de noche), el icono debe ser neutro
 * y NO asumir un momento concreto.
 */
const ICON_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/morning/i,    '☀'],
  [/afternoon/i,  '⛅'],
  [/night|evening/i, '☾'],
];

/**
 * Devuelve el emoji representativo de una franja.
 *
 * - Slots de tipo `basal` → `⏱` (cronómetro). El usuario puede
 *   configurarlos a cualquier hora, así que no asumimos sol ni luna.
 * - Slots con comida (bolus/mix) → se mapean por id (morning/afternoon/evening).
 * - Si no hay match → `◌` (icono neutro).
 */
export function iconForSlot(slot: SlotConfig): string {
  // Las basales ahora son configurables: la madre puede ponerse la
  // suya a las 10:00 (de día) y la tía a las 22:00 (de noche). El
  // icono de luna era engañoso porque el id seguía siendo 'basal_night'
  // aunque la hora real fuese diurna. Cronómetro = "momento del día".
  if (slot.kind === 'basal') return BASAL_ICON;

  for (const [pattern, icon] of ICON_PATTERNS) {
    if (pattern.test(slot.id)) return icon;
  }
  return DEFAULT_ICON;
}

// ============================================================
//  Rango horario
// ============================================================

/** Formatea la franja como HH:MM–HH:MM (delegado a formatRange). */
export function timeRangeForSlot(slot: SlotConfig): string {
  return formatRange(slot.startMin, slot.endMin);
}

// ============================================================
//  Clase CSS según valor de glucosa
// ============================================================

export type GlucoseClass = '' | 'glucose-low' | 'glucose-normal' | 'glucose-high';

/**
 * Mapea un valor de glucosa a la clase CSS que se le aplica.
 *  null     → ''           (sin valor)
 *  < 70     → glucose-low
 *  ≤ 180    → glucose-normal
 *  > 180    → glucose-high
 *
 * Los umbrales siguen las convenciones habituales de la app
 * (70-180 mg/dL = rango objetivo).
 */
export function glucoseClassFor(value: number | null): GlucoseClass {
  if (value == null) return '';
  if (value < 70) return 'glucose-low';
  if (value > 180) return 'glucose-high';
  return 'glucose-normal';
}

// ============================================================
//  Pills visuales del bolus
// ============================================================

/** Máximo de pills que se muestran en el visual del slot. */
export const BOLUS_PILLS_MAX = 15;

/**
 * Devuelve un array de índices 0..min(sum, max)-1.
 * Se usa en el template con *ngFor="let i of bolusArray()" para
 * renderizar una píldora por bolus hasta el máximo.
 */
export function bolusPillsFor(sum: number, max: number = BOLUS_PILLS_MAX): number[] {
  return Array.from({ length: Math.min(sum, max) }, (_, i) => i);
}

/** Cantidad de bolus que exceden el máximo visible. */
export function bolusOverflowFor(sum: number, max: number = BOLUS_PILLS_MAX): number {
  return Math.max(0, sum - max);
}

// ============================================================
//  Trim de notas
// ============================================================

/**
 * Limpia el texto de una nota. Devuelve `null` si el resultado
 * está vacío (no se debe emitir/guardar), o el texto trimeado
 * en caso contrario. Acepta null/undefined sin lanzar.
 */
export function trimNoteText(text: string | null | undefined): string | null {
  const trimmed = (text ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}
