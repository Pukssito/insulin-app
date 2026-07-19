import { InsulinBrand } from './insulin';

/**
 * Override configurable por el usuario para un slot generado por defecto.
 *
 * - Para slots de tipo `basal` (NPH mañana, NPH noche, basal prolongada):
 *   el usuario indica UNA hora (`timeMin`) porque la basal es un pinchazo
 *   en un momento del día, no un evento con duración. El sistema expande
 *   esa hora a un slot de 1h de ancho (H → H+1h) para mantener la
 *   consistencia del modelo `SlotConfig` (que siempre tiene startMin/endMin).
 *
 * - Para slots con rango (prandial/mix): el usuario define inicio y fin.
 *   Esto permite customizar, por ejemplo, "Cena 21-23h" porque en casa
 *   se cena más tarde de lo que asume el default cultural.
 *
 * - El campo `label` es opcional: si está, sustituye al label por defecto
 *   del slot (útil si el usuario quiere llamar a la basal "Lantus" en vez
 *   de "Basal noche" porque es como él la conoce).
 */
export interface SlotOverride {
  /** Hora única (en minutos desde medianoche) para slots de tipo basal. */
  timeMin?: number;
  /** Inicio del rango (en minutos) para slots con duración. */
  startMin?: number;
  /** Fin del rango (en minutos) para slots con duración. */
  endMin?: number;
  /** Etiqueta personalizada. Si no se indica, se mantiene la del slot por defecto. */
  label?: string;
}

export interface InsulinProfile {
  /** IDs de las marcas de insulina que el usuario ha elegido. */
  brandIds: string[];
  /**
   * Overrides opcionales por `slotId`. Si un slotId no aparece aquí,
   * se usan los valores por defecto generados por `buildSlotsFromBrands`.
   *
   * Diseñado para que la app sea usable por personas con horarios
   * diferentes a los defaults culturales (la madre se pone la basal
   * por la mañana, la tía por la noche, etc.).
   */
  slotOverrides?: Record<string, SlotOverride>;
}
