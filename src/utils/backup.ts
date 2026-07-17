import { DoseEntry, GlucoseEntry, NoteEntry } from '../models/models';
import { InsulinProfile } from '../models/profile';

/**
 * Versión actual del formato de backup. Si cambia el formato, se
 * incrementa este número y la app antigua NO podrá importar backups
 * nuevos. Cuando se hace un cambio incompatible, hay que implementar
 * una migración en `parseBackup` o rechazar la importación.
 */
export const BACKUP_VERSION = 1;

export interface BackupData {
  version: number;
  exportedAt: string;
  profile: InsulinProfile | null;
  entries: DoseEntry[];
  glucoseEntries: GlucoseEntry[];
  noteEntries: NoteEntry[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Serializa un backup a JSON formateado. Añade automáticamente
 * la versión y la fecha de exportación.
 *
 * NO valida: validación va aparte (`validateBackup`).
 */
export function serializeBackup(
  data: Omit<BackupData, 'version' | 'exportedAt'>,
): string {
  const full: BackupData = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profile: data.profile,
    entries: data.entries,
    glucoseEntries: data.glucoseEntries,
    noteEntries: data.noteEntries,
  };
  return JSON.stringify(full, null, 2);
}

/**
 * Parsea un string JSON. Devuelve `{ data }` si es JSON válido,
 * `{ error }` si no. NO valida la estructura: eso va aparte
 * (`validateBackup`).
 */
export function parseBackup(jsonString: string):
  | { data: unknown; error?: undefined }
  | { data?: undefined; error: string } {
  if (!jsonString || typeof jsonString !== 'string') {
    return { error: 'El contenido del backup está vacío' };
  }
  try {
    const data = JSON.parse(jsonString);
    return { data };
  } catch (e: any) {
    return { error: `JSON inválido: ${e?.message ?? 'error desconocido'}` };
  }
}

/**
 * Valida que un backup tenga la estructura esperada para esta
 * versión de la app. Devuelve `{ ok: true }` si todo está bien,
 * o `{ ok: false, errors: [...] }` con los problemas encontrados.
 *
 * Validación NO exhaustiva (no comprueba cada campo de cada entry);
 * solo lo mínimo para detectar corrupción o incompatibilidad grave.
 */
export function validateBackup(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null) {
    return { ok: false, errors: ['El backup no es un objeto'] };
  }
  const d = data as Record<string, unknown>;

  if (d.version !== BACKUP_VERSION) {
    errors.push(
      `Versión no soportada (${d.version}). Esta versión de la app espera ${BACKUP_VERSION}.`,
    );
  }
  if (typeof d.exportedAt !== 'string') {
    errors.push('"exportedAt" debe ser un string ISO');
  }
  if (d.profile !== null && typeof d.profile !== 'object') {
    errors.push('"profile" debe ser null o un objeto');
  }
  if (!Array.isArray(d.entries)) {
    errors.push('"entries" debe ser un array');
  }
  if (!Array.isArray(d.glucoseEntries)) {
    errors.push('"glucoseEntries" debe ser un array');
  }
  if (!Array.isArray(d.noteEntries)) {
    errors.push('"noteEntries" debe ser un array');
  }

  // Validación mínima de cada entry: debe tener los campos clave.
  if (Array.isArray(d.entries)) {
    d.entries.forEach((e: any, i: number) => {
      if (!e || typeof e !== 'object') {
        errors.push(`entries[${i}] no es un objeto`);
        return;
      }
      if (!e.dateYmd || !e.timeIso || !e.slotId || !e.type) {
        errors.push(`entries[${i}] falta dateYmd/timeIso/slotId/type`);
      }
    });
  }
  if (Array.isArray(d.glucoseEntries)) {
    d.glucoseEntries.forEach((e: any, i: number) => {
      if (!e || typeof e !== 'object') {
        errors.push(`glucoseEntries[${i}] no es un objeto`);
        return;
      }
      if (!e.dateYmd || !e.timeIso || !e.slotId || typeof e.value !== 'number') {
        errors.push(`glucoseEntries[${i}] falta dateYmd/timeIso/slotId/value`);
      }
    });
  }
  if (Array.isArray(d.noteEntries)) {
    d.noteEntries.forEach((e: any, i: number) => {
      if (!e || typeof e !== 'object') {
        errors.push(`noteEntries[${i}] no es un objeto`);
        return;
      }
      if (!e.dateYmd || !e.timeIso || !e.slotId || !e.text) {
        errors.push(`noteEntries[${i}] falta dateYmd/timeIso/slotId/text`);
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Atajo: parsea + valida en un solo paso. Devuelve `{ data }` si
 * todo OK, o `{ error }` con el primer problema encontrado.
 *
 * El `data` devuelto está tipado como `BackupData` pero el caller
 * debe tratarlo como tal solo si la validación pasó.
 */
export function parseAndValidateBackup(jsonString: string):
  | { data: BackupData; error?: undefined }
  | { data?: undefined; error: string } {
  const parsed = parseBackup(jsonString);
  if (parsed.error) return { error: parsed.error };
  const validation = validateBackup(parsed.data);
  if (!validation.ok) {
    return { error: `Backup inválido:\n• ${validation.errors.join('\n• ')}` };
  }
  return { data: parsed.data as BackupData };
}
