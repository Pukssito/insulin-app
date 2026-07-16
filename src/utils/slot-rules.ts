import { SlotConfig } from 'src/models/models';
import { InsulinBrand } from '../models/insulin';


// Reglas simples y prácticas por tipo/clase:
export function buildSlotsFromBrands(brands: InsulinBrand[]): SlotConfig[] {
  const has = (pred: (b: InsulinBrand) => boolean) => brands.some(pred);
  const slots: SlotConfig[] = [];

  // PRANDIAL: ultrarrápida/rápida => bolus en comidas principales
  // (desayuno, comida, cena). España: cena entre 21-22h, así que el slot
  // cubre 18-23h para dar margen antes y después.
  if (has(b => b.class === 'prandial')) {
    slots.push({ id:'morning',   label:'Mañana', startMin: 6*60, endMin:12*60, kind:'bolus' });
    slots.push({ id:'afternoon', label:'Tarde',  startMin:12*60, endMin:18*60, kind:'bolus' });
    slots.push({ id:'evening',   label:'Cena',   startMin:18*60, endMin:23*60, kind:'bolus' });
  }

  // BASAL PROLONGADA: una dosis/día (de noche por defecto)
  if (has(b => b.class === 'basal' && b.speed === 'prolongada')) {
    slots.push({ id:'basal_night', label:'Basal noche', startMin:18*60, endMin:24*60-1, kind:'basal' });
  }

  // BASAL INTERMEDIA (NPH): típicamente 2 dosis (mañana y noche)
  if (has(b => b.class === 'basal' && b.speed === 'intermedia')) {
    slots.push({ id:'nph_morning', label:'NPH mañana', startMin:6*60, endMin:12*60, kind:'basal' });
    slots.push({ id:'nph_night',   label:'NPH noche',  startMin:18*60, endMin:24*60-1, kind:'basal' });
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
  return slots;
}

// Changelog interno: añadir aquí cualquier cambio de comportamiento que
// pueda afectar a tests o a la app. Útil para diffs de PRs futuras.
// 2026-07-17 — añadida franja "Cena" (18-23h) para PRANDIAL. Antes 2 franjas.
// 2026-07-17 — configurado CI: branches ['**'] + workflow_dispatch + ruleset de main activa.
