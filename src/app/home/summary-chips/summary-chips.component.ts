import { Component, input, computed } from '@angular/core';

/**
 * Chips de resumen: total de bolus del día y glucosa media.
 * Componente dumb: recibe los valores, decide si mostrarlos y
 * aplica la clase CSS según el rango de la glucosa.
 *
 * Reglas de glucosa (idénticas al CSS previo):
 *   < 70  → glucose-low
 *   > 180 → glucose-high
 *   resto → glucose-normal
 */
@Component({
  selector: 'app-summary-chips',
  standalone: true,
  template: `
    @if (totalBolus() > 0) {
      <div class="summary-chip">
        <span class="chip-glyph-inline">🔥</span>
        <span>{{ totalBolus() }}U bolus</span>
      </div>
    }
    @if (avgGlucose() !== null) {
      <div class="summary-chip" [class]="glucoseClass()">
        <span class="chip-glyph-inline">💧</span>
        <span>Media {{ avgGlucose() }} mg/dL</span>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }
    .summary-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 999px;
      background: var(--ion-color-step-100, #f4f4f4);
      font-size: 0.85rem; font-weight: 500;
    }
    .summary-chip.glucose-low    { background: #ffe0e0; color: #b00020; }
    .summary-chip.glucose-high   { background: #fff4cc; color: #8a6d00; }
    .summary-chip.glucose-normal { background: #e0f5e9; color: #1b5e20; }
    .chip-glyph-inline { font-size: 1rem; }
  `],
})
export class SummaryChipsComponent {
  totalBolus = input.required<number>();
  avgGlucose = input<number | null>(null);

  protected readonly glucoseClass = computed(() => {
    const v = this.avgGlucose();
    if (v == null) return '';
    if (v < 70) return 'glucose-low';
    if (v > 180) return 'glucose-high';
    return 'glucose-normal';
  });
}
