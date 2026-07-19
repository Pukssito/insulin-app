import { SlotConfig } from 'src/models/models';
import { InsulinBrand } from '../models/insulin';
import { SlotOverride } from '../models/profile';


/**
 * Genera los slots por defecto a partir de las marcas de insulina elegidas.
 *
 * Si se pasa `overrides`, se aplican encima de los defaults generados.
 * Cada clave del override es un `slotId` y el valor indica cómo modificar
 * ese slot (rango nuevo, hora única para basales, label personalizado).
 *
 * Ver `validateSlotOverrides` para las reglas de validación.
 */
export function buildSlotsFromBrands(
  brands: InsulinBrand[],
  overrides?: Record<string, SlotOverride>,
): SlotConfig[] {
  const has = (pred: (b: InsulinBrand) => boolean) => brands.some(pred);
  const slots: SlotConfig[] = [];

  // PRANDIAL: ultrarrápida/rápida => bolus en comidas principales
  // (desayuno, comida, cena). Las etiquetas describen la franja
  // horaria: "Mañana" / "Tarde" / "Noche". El usuario puede
  // renombrar "Noche" si lo prefiere (ej. "Cena" si en su casa cenan
  // a las 21h) — pero el id interno 'evening' se mantiene por
  // retrocompatibilidad con los datos ya guardados en la app.
  if (has(b => b.class === 'prandial')) {
    slots.push({ id:'morning',   label:'Mañana', startMin: 6*60, endMin:12*60, kind:'bolus' });
    slots.push({ id:'afternoon', label:'Tarde',  startMin:12*60, endMin:18*60, kind:'bolus' });
    slots.push({ id:'evening',   label:'Noche',  startMin:18*60, endMin:23*60, kind:'bolus' });
  }

  // BASAL PROLONGADA: una dosis/día. El default es de noche (22-23h),
  // pero el usuario lo cambia en el Setup si se la pone a otra hora.
  // El label es neutro ("Basal") para que no diga "noche" si el usuario
  // la pone de día. El rango horario al lado ya da el contexto.
  if (has(b => b.class === 'basal' && b.speed === 'prolongada')) {
    slots.push({ id:'basal_night', label:'Basal', startMin:18*60, endMin:24*60-1, kind:'basal' });
  }

  // BASAL INTERMEDIA (NPH): típicamente 2 dosis. Labels neutros
  // ("NPH 1" / "NPH 2") para que no digan "mañana"/"noche" si el
  // usuario las cambia de hora. El rango al lado da el contexto.
  if (has(b => b.class === 'basal' && b.speed === 'intermedia')) {
    slots.push({ id:'nph_morning', label:'NPH 1', startMin:6*60, endMin:12*60, kind:'basal' });
    slots.push({ id:'nph_night',   label:'NPH 2', startMin:18*60, endMin:24*60-1, kind:'basal' });
  }

  // MEZCLAS: dos tomas (desayuno/comida)
  if (has(b => b.class === 'mix')) {
    slots.push({ id:'mix_morning',  label:'Mezcla mañana',  startMin:6*60, endMin:12*60, kind:'both' });
    slots.push({ id:'mix_afternoon',label:'Mezcla tarde',   startMin:12*60, endMin:18*60, kind:'both' });
  }

  // fallback por si no quedó nada (evita pantalla vacía)
  if (slots.length === 0) {
    slots.push({ id:'morning', label:'Mañana', startMin:6*60, endMin:12*60, kind:'both' });
  }

  return overrides ? applyOverrides(slots, overrides) : slots;
}

/**
 * Aplica overrides sobre una lista de slots. Slots sin override se quedan
 * como están. Los override de slotId desconocido se ignoran silenciosamente
 * (la validación se hace aparte con `validateSlotOverrides`).
 *
 * Para slots de tipo `basal`, el override usa `timeMin` (hora única)
 * y la expandimos a un slot de 1h de ancho (startMin = timeMin,
 * endMin = timeMin + 60). Esto mantiene la consistencia del modelo
 * `SlotConfig` (que siempre tiene startMin/endMin) sin obligar al
 * usuario a pensar en un "rango" para algo que es un pinchazo.
 */
function applyOverrides(
  slots: SlotConfig[],
  overrides: Record<string, SlotOverride>,
): SlotConfig[] {
  return slots.map(s => {
    const o = overrides[s.id];
    if (!o) return s;

    // Slots de tipo basal: el override indica UNA hora (timeMin)
    if (s.kind === 'basal' && o.timeMin !== undefined) {
      return {
        ...s,
        startMin: o.timeMin,
        endMin: o.timeMin + 60,
        label: o.label ?? s.label,
      };
    }

    // Slots con rango (prandial/mix): el override indica inicio y fin
    return {
      ...s,
      startMin: o.startMin ?? s.startMin,
      endMin: o.endMin ?? s.endMin,
      label: o.label ?? s.label,
    };
  });
}

/**
 * Valida que un objeto de overrides sea coherente con los slots
 * por defecto generados. Lanza Error con mensaje claro si algo no cuadra.
 *
 * Reglas:
 * - No se permite override de un slotId que no exista en los defaults.
 * - Slots de tipo `basal` requieren `timeMin` (no startMin/endMin).
 * - Slots con rango requieren `startMin` y `endMin`.
 * - `timeMin` debe estar en [0, 24*60).
 * - `endMin` debe ser > `startMin` y ambos en [0, 24*60).
 *
 * Esta función se llama antes de persistir el profile, para que un
 * backup corrupto o un override manipulado no rompa la UI.
 */
export function validateSlotOverrides(
  overrides: Record<string, SlotOverride> | undefined,
  defaultSlots: SlotConfig[],
): void {
  if (!overrides) return;
  const validIds = new Set(defaultSlots.map(s => s.id));

  for (const [slotId, o] of Object.entries(overrides)) {
    if (!validIds.has(slotId)) {
      throw new Error(`Override para slot inexistente: '${slotId}'`);
    }
    const slot = defaultSlots.find(s => s.id === slotId)!;

    if (slot.kind === 'basal') {
      if (o.timeMin === undefined) {
        throw new Error(
          `Slot basal '${slotId}' requiere timeMin (hora única). ` +
          `Usa startMin/endMin solo para slots de comida.`,
        );
      }
      if (o.timeMin < 0 || o.timeMin >= 24 * 60) {
        throw new Error(
          `timeMin fuera de rango en '${slotId}': ${o.timeMin} ` +
          `(debe estar entre 0 y ${24 * 60 - 1})`,
        );
      }
    } else {
      if (o.startMin === undefined || o.endMin === undefined) {
        throw new Error(
          `Slot '${slotId}' requiere startMin y endMin (es de tipo '${slot.kind}').`,
        );
      }
      if (o.endMin <= o.startMin) {
        throw new Error(
          `endMin debe ser mayor que startMin en '${slotId}': ` +
          `startMin=${o.startMin}, endMin=${o.endMin}`,
        );
      }
      if (o.startMin < 0 || o.endMin >= 24 * 60) {
        throw new Error(
          `Rango fuera de [0, 24h) en '${slotId}': ` +
          `startMin=${o.startMin}, endMin=${o.endMin}`,
        );
      }
    }
  }
}

// Changelog interno: añadir aquí cualquier cambio de comportamiento que
// pueda afectar a tests o a la app. Útil para diffs de PRs futuras.
// 2026-07-17 — añadida franja "Cena" (18-23h) para PRANDIAL. Antes 2 franjas.
// 2026-07-17 — configurado CI: branches ['**'] + workflow_dispatch + ruleset de main activa.
// 2026-07-17 — test de flujo PR: primera branch feature para validar el workflow de squash-merge.
// 2026-07-19 — slot-overrides: el usuario puede configurar el horario de cada
//   slot. Para basales, una hora única (timeMin) que se expande a 1h. Para
//   prandiales/mix, rango startMin/endMin. Validación previa al persistir.
