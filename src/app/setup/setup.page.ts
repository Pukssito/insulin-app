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
import {
  serializeBackup,
  parseAndValidateBackup,
} from '../../utils/backup';

@Component({
  standalone: true,
  selector: 'app-setup',
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './setup.page.html',
  styleUrls: ['./setup.page.scss'],
})
export class SetupPage {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  tab: 'pen' | 'vial' = 'pen';
  q = '';
  all: InsulinBrand[] = [];
  selected = new Set<string>();

  constructor(
    private store: InsulinStore,
    private notifications: Notifications,
    private router: Router,
    private alert: AlertController,
    private toast: ToastController,
  ) {
    this.all = this.store.getCatalog();
  }

  listForTab() {
    const q = this.q.toLowerCase().trim();
    return this.all
      .filter(b => b.device === this.tab)
      .filter(b => !q || b.tradeName.toLowerCase().includes(q));
  }

  toggle(id: string) {
    this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id);
  }

  async save() {
    await this.store.setProfileByIds(Array.from(this.selected));
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

      // Escribimos el archivo en el directorio de caché.
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

      // Abrimos el share sheet nativo
      await Share.share({
        title: 'Copia de seguridad',
        text: 'Datos de insulin-app',
        files: [writeResult.uri],
        dialogTitle: 'Compartir datos',
      });
    } catch (err: any) {
      // El usuario cancela el share sheet también puede lanzar error
      // con message "Share canceled" — no lo tratamos como error real.
      if (err?.message?.includes('canceled') || err?.message?.includes('cancelled')) {
        return;
      }
      await this.presentError(err?.message ?? 'No se pudo exportar');
    }
  }

  /** Dispara el file picker nativo (selector de archivos del sistema) */
  onImportDataClick() {
    this.fileInput.nativeElement.click();
  }

  /** Lee el archivo seleccionado, valida y pide confirmación antes de reemplazar */
  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const result = parseAndValidateBackup(text);
      if (result.error || !result.data) {
        await this.presentError(result.error ?? 'Backup no válido');
        input.value = ''; // reseteamos para permitir re-selección
        return;
      }

      // Pedimos confirmación antes de machacar los datos
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
      input.value = ''; // reseteamos para permitir re-selección
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
