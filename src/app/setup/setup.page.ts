import { Component, ViewChild, ElementRef } from '@angular/core';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

import { InsulinBrand } from '../../models/insulin';
import { InsulinStore } from '../../service/insulin.store';
import { Notifications } from '../../service/notifications.service';
import { SlotConfig } from '../../models/models';
import { SlotOverride } from '../../models/profile';
import { buildSlotsFromBrands } from '../../utils/slot-rules';
import {
  serializeBackup,
  parseAndValidateBackup,
} from '../../utils/backup';
import { formatRange } from '../../utils/date-utils';

/**
 * Identificador de paso del wizard. Algunos pasos solo aparecen si el
 * perfil del usuario tiene ciertas clases de insulina:
 * - 'brands'   : siempre (paso 1)
 * - 'basal'    : solo si hay basal prolongada
 * - 'nph-morning' / 'nph-night' : solo si hay NPH
 * - 'review'   : siempre (paso final)
 */
type Step = 'brands' | 'basal' | 'nph-morning' | 'nph-night' | 'review';

@Component({
  standalone: true,
  selector: 'app-setup',
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './setup.page.html',
  styleUrls: ['./setup.page.scss'],
})
export class SetupPage {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  /* ============================================================
   *  Estado del wizard
   * ============================================================ */

  /** Paso actual del wizard. */
  step: Step = 'brands';

  /** Pestaña activa en la lista de marcas. */
  tab: 'pen' | 'vial' = 'pen';

  /** Texto de búsqueda. */
  q = '';

  /** IDs de las marcas seleccionadas. */
  selected = new Set<string>();

  /**
   * Hora de la basal prolongada.
   * Estado: ISO string (lo que ion-datetime con presentation="time" espera).
   * Por defecto, las 22:00 de hoy.
   */
  basalTime = this.defaultTimeIso(22, 0);

  /**
   * Hora de la NPH de la mañana.
   * Por defecto, las 08:00 de hoy.
   */
  nphMorning = this.defaultTimeIso(8, 0);

  /**
   * Hora de la NPH de la noche.
   * Por defecto, las 22:00 de hoy.
   */
  nphNight = this.defaultTimeIso(22, 0);

  /**
   * Overrides personalizados para slots con rango (prandial/mix).
   * Se va rellenando a medida que el usuario edita slots en el review.
   * Las basales se manejan con `basalTime` / `nphMorning` / `nphNight`
   * porque es una hora única, no un rango.
   */
  rangeOverrides: Record<string, { startMin: number; endMin: number; label?: string }> = {};

  /* ============================================================
   *  Modal de edición de slot
   * ============================================================ */

  /** Slot que se está editando en el modal. null = modal cerrado. */
  editingSlot: SlotConfig | null = null;

  /** Valor temporal del startMin en el modal (en minutos). */
  editingStartMin = 0;

  /** Valor temporal del endMin en el modal (en minutos). */
  editingEndMin = 0;

  /* ============================================================
   *  Catálogo
   * ============================================================ */

  all: InsulinBrand[] = [];

  constructor(
    private store: InsulinStore,
    private notifications: Notifications,
    private router: Router,
    private alert: AlertController,
    private toast: ToastController,
  ) {
    this.all = this.store.getCatalog();
    this.preloadFromExistingProfile();
  }

  /**
   * Si ya hay un profile guardado (usuario en modo edición), pre-rellena
   * los campos del wizard con los valores actuales. Si no hay profile
   * (onboarding), los defaults ya están en las propiedades de la clase.
   */
  private preloadFromExistingProfile() {
    const profile = this.store.profile();
    if (!profile) return;

    this.selected = new Set(profile.brandIds);

    const overrides = profile.slotOverrides ?? {};

    // Basal prolongada
    const basalOv = overrides['basal_night'];
    if (basalOv?.timeMin !== undefined) {
      this.basalTime = this.minToIso(basalOv.timeMin);
    }

    // NPH
    const nphMorningOv = overrides['nph_morning'];
    if (nphMorningOv?.timeMin !== undefined) {
      this.nphMorning = this.minToIso(nphMorningOv.timeMin);
    }
    const nphNightOv = overrides['nph_night'];
    if (nphNightOv?.timeMin !== undefined) {
      this.nphNight = this.minToIso(nphNightOv.timeMin);
    }

    // Resto de slots (prandial/mix): guardamos los overrides de rango
    for (const [slotId, ov] of Object.entries(overrides)) {
      if (ov.startMin !== undefined && ov.endMin !== undefined) {
        this.rangeOverrides[slotId] = {
          startMin: ov.startMin,
          endMin: ov.endMin,
          label: ov.label,
        };
      }
    }
  }

  /**
   * Genera un ISO string para una hora (h, m) del día de hoy.
   * Usado como default y para reconstruir el ISO a partir de minutos
   * cuando pre-cargamos un profile existente.
   */
  private defaultTimeIso(h: number, m: number): string {
    const today = new Date().toISOString().slice(0, 10);
    return `${today}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  }

  /* ============================================================
   *  Pasos del wizard
   * ============================================================ */

  /**
   * Devuelve la lista de pasos a mostrar, en orden, omitiendo los que
   * no aplican al perfil actual del usuario. Esto es lo que hace que
   * el wizard se adapte dinámicamente.
   */
  get steps(): Step[] {
    const result: Step[] = ['brands'];
    if (this.hasBasalProlonged) result.push('basal');
    if (this.hasNph) {
      result.push('nph-morning');
      result.push('nph-night');
    }
    result.push('review');
    return result;
  }

  get currentStepIndex(): number {
    return this.steps.indexOf(this.step);
  }

  get isFirstStep(): boolean { return this.currentStepIndex === 0; }
  get isLastStep(): boolean { return this.currentStepIndex === this.steps.length - 1; }

  get progressLabel(): string {
    return `Paso ${this.currentStepIndex + 1} de ${this.steps.length}`;
  }

  /**
   * Adelanta al siguiente paso. El botón "Siguiente" o "Empezar" del
   * footer usa `isLastStep` para cambiar la etiqueta.
   */
  next() {
    if (this.isLastStep) {
      this.save();
      return;
    }
    const nextStep = this.steps[this.currentStepIndex + 1];
    this.step = nextStep;
  }

  /** Retrocede al paso anterior. */
  prev() {
    if (this.isFirstStep) return;
    const prevStep = this.steps[this.currentStepIndex - 1];
    this.step = prevStep;
  }

  /* ============================================================
   *  Helpers de marcas y clasificación
   * ============================================================ */

  listForTab() {
    const q = this.q.toLowerCase().trim();
    return this.all
      .filter(b => b.device === this.tab)
      .filter(b => !q || b.tradeName.toLowerCase().includes(q));
  }

  toggle(id: string) {
    this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id);
  }

  /**
   * Marcas seleccionadas resueltas como InsulinBrand completas.
   * Útil para calcular hasBasal / hasNph y para construir los overrides.
   */
  get selectedBrands(): InsulinBrand[] {
    return this.all.filter(b => this.selected.has(b.id));
  }

  get hasBasalProlonged(): boolean {
    return this.selectedBrands.some(b => b.class === 'basal' && b.speed === 'prolongada');
  }

  get hasNph(): boolean {
    return this.selectedBrands.some(b => b.class === 'basal' && b.speed === 'intermedia');
  }

  /* ============================================================
   *  Preview de slots para el paso "review"
   * ============================================================ */

  /**
   * Slots finales que se generarán al guardar, ya con los overrides
   * aplicados. Es lo que se muestra en la lista del paso final.
   */
  previewSlots(): SlotConfig[] {
    const overrides = this.buildOverrides();
    return buildSlotsFromBrands(this.selectedBrands, overrides);
  }

  /**
   * Construye el objeto de overrides a partir del estado actual del wizard.
   * Une las basales (con timeMin) con los rangos personalizados.
   */
  private buildOverrides(): Record<string, SlotOverride> {
    const ov: Record<string, SlotOverride> = { ...this.rangeOverrides };

    if (this.hasBasalProlonged) {
      ov['basal_night'] = { timeMin: this.isoToMin(this.basalTime) };
    }
    if (this.hasNph) {
      ov['nph_morning'] = { timeMin: this.isoToMin(this.nphMorning) };
      ov['nph_night'] = { timeMin: this.isoToMin(this.nphNight) };
    }
    return ov;
  }

  formatSlotTime(s: SlotConfig): string {
    return formatRange(s.startMin, s.endMin);
  }

  /* ============================================================
   *  Modal de edición de slot (para prandiales/mix)
   * ============================================================ */

  openSlotEditor(s: SlotConfig) {
    // Las basales no se editan en este modal: se editan en su paso del wizard.
    if (s.kind === 'basal') return;

    this.editingSlot = s;
    this.editingStartMin = s.startMin;
    this.editingEndMin = s.endMin;
  }

  closeSlotEditor() {
    this.editingSlot = null;
  }

  saveSlotEdit() {
    if (!this.editingSlot) return;

    // Validación inline: endMin > startMin
    if (this.editingEndMin <= this.editingStartMin) {
      this.presentError('La hora final debe ser posterior a la inicial.');
      return;
    }
    if (this.editingStartMin < 0 || this.editingEndMin >= 24 * 60) {
      this.presentError('Las horas deben estar entre 00:00 y 23:59.');
      return;
    }

    this.rangeOverrides[this.editingSlot.id] = {
      startMin: this.editingStartMin,
      endMin: this.editingEndMin,
    };
    this.closeSlotEditor();
  }

  /* ============================================================
   *  Conversores ISO <-> minutos (públicos para usar en el template)
   *
   *  ion-datetime con presentation="time" trabaja con strings ISO 8601
   *  (ej. '2026-07-19T08:30:00+02:00'). Estos helpers convierten entre
   *  ese formato y los minutos desde medianoche, que es lo que usamos
   *  como state para `editingStartMin` y `editingEndMin`.
   * ============================================================ */

  minToIso(min: number): string {
    if (!min) return '';
    // Usamos la fecha de hoy como "ancla" para que ion-datetime no
    // proteste por min/max. No afecta a la hora, que es lo que nos importa.
    const today = new Date().toISOString().slice(0, 10);
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${today}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  }

  isoToMin(iso: string): number {
    if (!iso) return 0;
    // Extraer HH:mm directamente del string ISO
    const match = iso.match(/T(\d{2}):(\d{2})/);
    if (!match) return 0;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }

  /* ============================================================
   *  Guardar el profile
   * ============================================================ */

  async save() {
    const overrides = this.buildOverrides();
    try {
      await this.store.setProfileByIds(Array.from(this.selected), overrides);
    } catch (err: any) {
      await this.presentError(err?.message ?? 'No se pudo guardar la configuración');
      return;
    }
    // Buen momento para pedir permiso de notificaciones: el usuario
    // acaba de hacer una acción significativa (configurar su insulina).
    await this.notifications.requestPermission();
    this.router.navigateByUrl('/home');
  }

  /* =======================
   *  BACKUP / RESTORE
   * ======================= */

  /**
   * Genera un JSON con todos los datos, lo escribe en un archivo
   * temporal y abre el share sheet nativo de Android para que la
   * madre lo mande por WhatsApp, email, etc.
   */
  async onExportData() {
    try {
      const json = serializeBackup(this.store.exportAll());
      const today = new Date().toISOString().slice(0, 10);
      const filename = `insulin-app-backup-${today}.json`;

      // encoding: Encoding.UTF8 es OBLIGATORIO: sin él, la versión web
      // del plugin intenta "adivinar" si el data es base64 y casca
      // con "The supplied data is not valid base64 content" cuando
      // el JSON tiene acentos, llaves, etc.
      const writeResult = await Filesystem.writeFile({
        path: filename,
        data: json,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      await Share.share({
        title: 'Copia de seguridad',
        text: 'Datos de insulin-app',
        files: [writeResult.uri],
        dialogTitle: 'Compartir datos',
      });
    } catch (err: any) {
      if (err?.message?.includes('canceled') || err?.message?.includes('cancelled')) {
        return;
      }
      await this.presentError(err?.message ?? 'No se pudo exportar');
    }
  }

  onImportDataClick() {
    this.fileInput.nativeElement.click();
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const result = parseAndValidateBackup(text);
      if (result.error || !result.data) {
        await this.presentError(result.error ?? 'Backup no válido');
        input.value = '';
        return;
      }

      const confirm = await this.alert.create({
        header: 'Importar datos',
        message: `Vas a reemplazar TODOS los datos actuales con los del backup (${result.data.entries.length} entradas, ${result.data.glucoseEntries.length} glucosas, ${result.data.noteEntries.length} notas). Esta acción no se puede deshacer. ¿Continuar?`,
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          {
            text: 'Reemplazar',
            role: 'destructive',
            handler: async () => {
              await this.store.replaceAll({
                profile: result.data!.profile,
                entries: result.data!.entries,
                glucoseEntries: result.data!.glucoseEntries,
                noteEntries: result.data!.noteEntries,
              });
              // Re-leemos el profile para que el wizard muestre la nueva config
              this.preloadFromExistingProfile();
              await this.presentSuccess(
                `Datos importados: ${result.data!.entries.length} entradas, ${result.data!.glucoseEntries.length} glucosas, ${result.data!.noteEntries.length} notas.`,
              );
            },
          },
        ],
      });
      await confirm.present();
    } catch (err: any) {
      await this.presentError(err?.message ?? 'No se pudo leer el archivo');
    } finally {
      input.value = '';
    }
  }

  private async presentError(message: string) {
    const t = await this.toast.create({
      message,
      duration: 4000,
      position: 'top',
      color: 'danger',
    });
    await t.present();
  }

  private async presentSuccess(message: string) {
    const t = await this.toast.create({
      message,
      duration: 3000,
      position: 'top',
      color: 'success',
    });
    await t.present();
  }
}
