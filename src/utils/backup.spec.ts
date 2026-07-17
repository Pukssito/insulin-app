import { describe, it, expect } from 'vitest';
import {
  BACKUP_VERSION,
  serializeBackup,
  parseBackup,
  validateBackup,
  parseAndValidateBackup,
  BackupData,
} from './backup';

// Helper: backup mínimo válido
const validBackup = (): Omit<BackupData, 'version' | 'exportedAt'> => ({
  profile: { brandIds: ['fiasp-pen', 'lantus-vial'] },
  entries: [
    { dateYmd: '2026-07-16', timeIso: '2026-07-16T08:00:00.000Z', slotId: 'morning', type: 'bolus', units: 2 },
    { dateYmd: '2026-07-16', timeIso: '2026-07-16T08:05:00.000Z', slotId: 'morning', type: 'basal', units: 1 },
  ],
  glucoseEntries: [
    { dateYmd: '2026-07-16', timeIso: '2026-07-16T09:00:00.000Z', slotId: 'morning', value: 120 },
  ],
  noteEntries: [
    { dateYmd: '2026-07-16', timeIso: '2026-07-16T12:00:00.000Z', slotId: 'afternoon', text: 'comida pesada' },
  ],
});

describe('serializeBackup', () => {
  it('añade automáticamente la versión y la fecha de exportación', () => {
    const json = serializeBackup(validBackup());
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(BACKUP_VERSION);
    expect(parsed.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('preserva los datos tal cual', () => {
    const input = validBackup();
    const json = serializeBackup(input);
    const parsed = JSON.parse(json);
    expect(parsed.profile).toEqual(input.profile);
    expect(parsed.entries).toEqual(input.entries);
    expect(parsed.glucoseEntries).toEqual(input.glucoseEntries);
    expect(parsed.noteEntries).toEqual(input.noteEntries);
  });

  it('acepta profile null (usuario sin perfil configurado)', () => {
    const json = serializeBackup({ ...validBackup(), profile: null });
    const parsed = JSON.parse(json);
    expect(parsed.profile).toBeNull();
  });

  it('genera JSON formateado (con saltos de línea)', () => {
    const json = serializeBackup(validBackup());
    expect(json).toContain('\n');
  });
});

describe('parseBackup', () => {
  it('parsea JSON válido y devuelve data', () => {
    const json = serializeBackup(validBackup());
    const result = parseBackup(json);
    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
  });

  it('devuelve error con JSON inválido', () => {
    const result = parseBackup('{ malformed json');
    expect(result.data).toBeUndefined();
    expect(result.error).toMatch(/JSON inválido/);
  });

  it('devuelve error si el contenido está vacío', () => {
    expect(parseBackup('').error).toMatch(/vacío/);
  });

  it('devuelve error si el contenido no es string', () => {
    expect(parseBackup(null as any).error).toMatch(/vacío/);
    expect(parseBackup(undefined as any).error).toMatch(/vacío/);
  });
});

describe('validateBackup', () => {
  it('pasa con un backup válido recién serializado', () => {
    const json = serializeBackup(validBackup());
    const parsed = parseBackup(json);
    const validation = validateBackup(parsed.data);
    expect(validation.ok).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it('rechaza si la versión no coincide', () => {
    const data: any = { ...validBackup(), version: 99, exportedAt: 'x' };
    const validation = validateBackup(data);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join(' ')).toMatch(/Versión no soportada/);
  });

  it('rechaza si falta la versión', () => {
    const data: any = { ...validBackup(), exportedAt: 'x' };
    const validation = validateBackup(data);
    expect(validation.ok).toBe(false);
  });

  it('rechaza si exportedAt no es string', () => {
    const data: any = { ...validBackup(), version: 1, exportedAt: 12345 };
    const validation = validateBackup(data);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join(' ')).toMatch(/exportedAt/);
  });

  it('rechaza si profile no es null ni objeto', () => {
    const data: any = { ...validBackup(), version: 1, exportedAt: 'x', profile: 'invalid' };
    const validation = validateBackup(data);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join(' ')).toMatch(/profile/);
  });

  it('rechaza si entries no es array', () => {
    const data: any = { ...validBackup(), version: 1, exportedAt: 'x', entries: 'not array' };
    const validation = validateBackup(data);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join(' ')).toMatch(/entries/);
  });

  it('rechaza entries con campos faltantes', () => {
    const data: any = {
      ...validBackup(),
      version: 1,
      exportedAt: 'x',
      entries: [{ dateYmd: '2026-07-16' }], // faltan campos
    };
    const validation = validateBackup(data);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join(' ')).toMatch(/entries\[0\]/);
  });

  it('rechaza glucoseEntries sin value numérico', () => {
    const data: any = {
      ...validBackup(),
      version: 1,
      exportedAt: 'x',
      glucoseEntries: [{ dateYmd: 'x', timeIso: 'y', slotId: 'z', value: 'no number' }],
    };
    const validation = validateBackup(data);
    expect(validation.ok).toBe(false);
  });

  it('rechaza noteEntries sin text', () => {
    const data: any = {
      ...validBackup(),
      version: 1,
      exportedAt: 'x',
      noteEntries: [{ dateYmd: 'x', timeIso: 'y', slotId: 'z' }], // sin text
    };
    const validation = validateBackup(data);
    expect(validation.ok).toBe(false);
  });

  it('rechaza si el dato no es objeto (null, número, string)', () => {
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup(42).ok).toBe(false);
    expect(validateBackup('hola').ok).toBe(false);
  });

  it('rechaza si una entry no es un objeto', () => {
    const data: any = {
      ...validBackup(),
      version: 1,
      exportedAt: 'x',
      entries: ['not an object', { dateYmd: 'x', timeIso: 'y', slotId: 'z', type: 'bolus' }],
    };
    const validation = validateBackup(data);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join(' ')).toMatch(/entries\[0\]/);
  });
});

describe('parseAndValidateBackup (atajo)', () => {
  it('devuelve data si todo OK', () => {
    const json = serializeBackup(validBackup());
    const result = parseAndValidateBackup(json);
    expect(result.data).toBeDefined();
    expect(result.data?.version).toBe(BACKUP_VERSION);
    expect(result.data?.entries.length).toBe(2);
  });

  it('devuelve error de parseo si JSON inválido', () => {
    const result = parseAndValidateBackup('{ bad');
    expect(result.error).toMatch(/JSON inválido/);
  });

  it('devuelve error de validación si versión incorrecta', () => {
    const json = JSON.stringify({ ...validBackup(), version: 99, exportedAt: 'x' });
    const result = parseAndValidateBackup(json);
    expect(result.error).toMatch(/Backup inválido/);
    expect(result.error).toMatch(/Versión no soportada/);
  });

  it('lista múltiples errores separados por salto de línea', () => {
    const json = JSON.stringify({
      version: 1,
      exportedAt: 'x',
      profile: null,
      entries: 'not array',
      glucoseEntries: [],
      noteEntries: [],
    });
    const result = parseAndValidateBackup(json);
    expect(result.error).toMatch(/entries/);
  });
});

describe('roundtrip completo', () => {
  it('serialize → parse → validate preserva todos los datos', () => {
    const original = validBackup();
    const json = serializeBackup(original);
    const result = parseAndValidateBackup(json);
    expect(result.error).toBeUndefined();
    expect(result.data?.profile).toEqual(original.profile);
    expect(result.data?.entries).toEqual(original.entries);
    expect(result.data?.glucoseEntries).toEqual(original.glucoseEntries);
    expect(result.data?.noteEntries).toEqual(original.noteEntries);
  });
});
