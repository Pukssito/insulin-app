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

/** Patrones RegExp en orden de prioridad para mapear slot.id → emoji. */
const ICON_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/morning/i,    '☀'],
  [/afternoon/i,  '⛅'],
  [/night|evening/i, '☾'],
];

const DEFAULT_ICON = '⏱';

/**
 * Devuelve el emoji representativo de una franja en función de su id.
 * Si ningún patrón matchea, devuelve el icono genérico ⏱.
 */
export function iconForSlot(slotId: string): string {
  for (const [pattern, icon] of ICON_PATTERNS) {
    if (pattern.test(slotId)) return icon;
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
