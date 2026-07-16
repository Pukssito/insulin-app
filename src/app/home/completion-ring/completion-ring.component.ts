import { Component, input, computed } from '@angular/core';

/**
 * Anillo SVG que muestra el progreso de la basal del día.
 * Componente dumb: recibe `done` y `expected`, calcula internamente
 * el porcentaje, la circunferencia y el offset del trazo.
 */
@Component({
  selector: 'app-completion-ring',
  standalone: true,
  template: `
    <div class="completion-ring" [class.is-done]="isDone()">
      <svg viewBox="0 0 50 50" class="ring-svg">
        <circle cx="25" cy="25" r="22" class="ring-bg" />
        <circle cx="25" cy="25" r="22" class="ring-fg"
                [attr.stroke-dasharray]="circumference"
                [attr.stroke-dashoffset]="dashoffset()"
                transform="rotate(-90 25 25)" />
      </svg>
      <div class="ring-text">
        <span class="ring-count">{{ done() }}</span>
        <span class="ring-total">/{{ expected() }}</span>
      </div>
    </div>
  `,
  styles: [`
    .completion-ring {
      position: relative;
      width: 64px;
      height: 64px;
    }
    .ring-svg { width: 100%; height: 100%; transform: rotate(0deg); }
    .ring-bg { fill: none; stroke: var(--ion-color-step-200, #e0e0e0); stroke-width: 4; }
    .ring-fg { fill: none; stroke: var(--ion-color-primary, #3880ff); stroke-width: 4; transition: stroke-dashoffset 0.4s ease; }
    .completion-ring.is-done .ring-fg { stroke: var(--ion-color-success, #2dd36f); }
    .ring-text {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 0.95rem; font-weight: 600;
    }
    .ring-count { color: var(--ion-color-primary, #3880ff); }
    .completion-ring.is-done .ring-count { color: var(--ion-color-success, #2dd36f); }
    .ring-total { color: var(--ion-color-medium, #92949c); font-weight: 400; margin-left: 1px; }
  `],
})
export class CompletionRingComponent {
  done = input.required<number>();
  expected = input.required<number>();

  // r=22, circumference = 2πr
  protected readonly circumference = 2 * Math.PI * 22;

  protected readonly completion = computed(() => {
    const exp = this.expected();
    if (exp === 0) return 0;
    return Math.min(this.done() / exp, 1);
  });

  protected readonly dashoffset = computed(() =>
    this.circumference * (1 - this.completion())
  );

  protected readonly isDone = computed(() => this.completion() === 1);
}
