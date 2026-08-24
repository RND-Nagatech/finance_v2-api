import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';
import FiscalConfig from '../models/FiscalConfig';
import TtFinanceDetail from '../models/TtFinanceDetail';
import TtSummaryV2 from '../models/TtSummaryV2';
import Rekening from '../models/Rekening';
import Kategori from '../models/Kategori';
import SubKategori from '../models/SubKategori';
import Akun from '../models/Akun';
import Perusahaan from '../models/Perusahaan';
import Bank from '../models/Bank';
import { AuthRequest } from '../middleware/authMiddleware';
import { deriveTahunFiskalFromBulanV2, rebuildSummaryV2ForDetail, shouldEnterSummaryV2 } from '../services/summaryV2Service';
import {
  applyAssetMovementFromTransaction,
  isAssetSource,
  resolveAssetSnapshot,
  rollbackAssetMovementFromTransaction,
} from '../services/assetLedgerService';

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseRupiahSearch(input: string): number | null {
  if (!input) return null;
  const normalized = input
    .replace(/\s+/g, '')
    .replace(/^rp\.?/i, '')
    .replace(/[^0-9,.\-]/g, '');
  if (!normalized) return null;

  let numericStr = normalized;
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');
  if (hasComma && hasDot) {
    numericStr = normalized.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    numericStr = normalized.replace(',', '.');
  } else {
    numericStr = normalized.replace(/\./g, '');
  }

  const value = Number(numericStr);
  return Number.isFinite(value) ? value : null;
}

const SUMMARY_MONTH_NUMBER: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

function buildSummaryYearMatchValue(tahun: any) {
  const yearNumber = Number(tahun);
  return Number.isFinite(yearNumber) ? { $in: [yearNumber, String(tahun)] } : tahun;
}

function buildSummaryMonthQuery(tahun: any, bulan: any) {
  if (!bulan) return null;
  const raw = String(bulan).trim().toUpperCase();
  const monthCode = raw.slice(0, 3);
  const monthNumber = SUMMARY_MONTH_NUMBER[monthCode];
  if (!monthNumber) return { bulan_fiskal_label: raw };

  const explicitYear = raw.match(/-(\d{2,4})$/);
  const yearNumber = explicitYear
    ? Number(explicitYear[1].length === 2 ? `20${explicitYear[1]}` : explicitYear[1])
    : Number(tahun);
  const labelYear = monthCode === 'DEC' && !explicitYear && Number.isFinite(yearNumber) ? yearNumber - 1 : yearNumber;
  const label = Number.isFinite(labelYear) ? `${monthCode}-${String(labelYear).slice(-2)}` : raw;

  return {
    $or: [
      { bulan_fiskal: monthNumber },
      { bulan_fiskal_label: label },
      { bulan_fiskal_label: raw },
    ],
  };
}

type TransactionMode = 'NORMAL' | 'SPECIAL' | 'FINANCE_ONLY';

function parseSpecialTransactionFlag(value: any): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeTransactionMode(value: any, fallbackSpecial?: any): TransactionMode {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'SPECIAL' || v === 'FINANCE_ONLY' || v === 'NORMAL') return v as TransactionMode;
  if (parseSpecialTransactionFlag(fallbackSpecial)) return 'SPECIAL';
  return 'NORMAL';
}

function getTransactionMode(doc: any): TransactionMode {
  return normalizeTransactionMode(doc?.transaction_mode, doc?.is_special_transaction);
}

function isSpecialTransaction(doc: any): boolean {
  return getTransactionMode(doc) === 'SPECIAL';
}

function isFinanceOnlyTransaction(doc: any): boolean {
  return getTransactionMode(doc) === 'FINANCE_ONLY';
}

function shouldAffectRekening(doc: any): boolean {
  if (isAssetSource(doc)) return false;
  return !isFinanceOnlyTransaction(doc);
}

function getRekeningBalanceDelta(doc: any): number {
  if (!shouldAffectRekening(doc)) return 0;
  if (doc?.status_deleted === true) return 0;
  const kodeBank = String(doc?.kode_bank || '').trim();
  const noRekening = String(doc?.no_rekening || '').trim();
  if (!kodeBank || kodeBank === '-' || !noRekening || noRekening === '-') return 0;

  const nilai = Number(doc?.nilai || 0);
  if (!Number.isFinite(nilai) || nilai === 0) return 0;
  const mutationDirection = String(doc?.rekening_mutation_direction || '').toUpperCase();
  if (mutationDirection === 'IN') return nilai;
  if (mutationDirection === 'OUT') return -nilai;
  return doc?.kategori === 'PENDAPATAN' ? nilai : -nilai;
}

async function incrementRekeningBalance(doc: any, inc: { saldo?: number; saldo_on_hold?: number }, session: ClientSession) {
  const kodeBank = String(doc?.kode_bank || '').trim();
  const noRekening = String(doc?.no_rekening || '').trim();
  if (!kodeBank || kodeBank === '-' || !noRekening || noRekening === '-') return false;

  const cleanInc = Object.fromEntries(
    Object.entries(inc).filter(([, value]) => Number.isFinite(Number(value)) && Number(value) !== 0)
  );
  if (Object.keys(cleanInc).length === 0) return false;

  const result = await Rekening.updateOne(
    { kode_bank: kodeBank, no_rekening: noRekening },
    { $inc: cleanInc },
    { session }
  );
  return result.matchedCount > 0;
}

async function applySaldoOnHoldForPendingDetail(doc: any, session: ClientSession) {
  if (doc?.is_validated || doc?.saldo_on_hold_applied) return;
  const delta = getRekeningBalanceDelta(doc);
  if (delta === 0) return;
  const applied = await incrementRekeningBalance(doc, { saldo_on_hold: delta }, session);
  if (applied) doc.saldo_on_hold_applied = true;
}

async function releaseSaldoOnHoldForPendingDetail(doc: any, session: ClientSession) {
  if (!doc?.saldo_on_hold_applied) return;
  const delta = getRekeningBalanceDelta(doc);
  if (delta !== 0) {
    await incrementRekeningBalance(doc, { saldo_on_hold: -delta }, session);
  }
  doc.saldo_on_hold_applied = false;
}

function shouldAffectDashboard(doc: any): boolean {
  return !isSpecialTransaction(doc);
}

async function runMongoTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

const POSTING_VERSION = 1;

function buildPostingStatePatch(detail: any) {
  if (shouldEnterSummaryV2(detail)) {
    return {
      posting_state: 'APPLIED',
      posting_version: POSTING_VERSION,
      posted_at: new Date(),
      posting_error: '-',
    };
  }

  return {
    posting_state: 'NOT_APPLIED',
    posting_version: POSTING_VERSION,
    posted_at: '-',
    posting_error: '-',
  };
}

async function syncPostingStateForDetail(detail: any, session?: ClientSession) {
  const patch = buildPostingStatePatch(detail);
  await TtFinanceDetail.updateOne(
    { _id: detail._id },
    { $set: patch },
    { session }
  );
  Object.assign(detail, patch);
  return patch;
}

async function isFiscalYearClosed(tahunFiskal?: any, session?: ClientSession): Promise<boolean> {
  const year = Number(tahunFiskal);
  if (!year || Number.isNaN(year)) return false;
  const cfg = await FiscalConfig.findOne({ key: 'fiscal', 'closed_years.year': year }).session(session || null).lean();
  return Boolean(cfg);
}

async function rejectIfFiscalYearClosed(tahunFiskal?: any, session?: ClientSession) {
  if (await isFiscalYearClosed(tahunFiskal, session)) {
    throw new Error(`Tahun fiskal ${tahunFiskal} sudah ditutup dan tidak bisa diubah.`);
  }
}

function deriveTahunFiskalFromDetail(detail: any): string | undefined {
  return detail?.tahun_fiskal ? String(detail.tahun_fiskal) : deriveTahunFiskalFromBulanV2(detail?.bulan);
}

function parseImportBoolean(value: any, defaultValue = false): boolean {
  const rawValue = unwrapMongoExportValue(value);
  value = rawValue;
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'ya', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'tidak', 'n'].includes(normalized)) return false;
  return defaultValue;
}

function parseImportNumber(value: any): number | null {
  value = unwrapMongoExportValue(value);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value)
    .replace(/\s+/g, '')
    .replace(/^rp\.?/i, '')
    .replace(/[^0-9,.\-]/g, '');
  if (!normalized) return null;
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');
  let numericStr = normalized;
  if (hasComma && hasDot) numericStr = normalized.replace(/\./g, '').replace(',', '.');
  else if (hasComma) numericStr = normalized.replace(',', '.');
  else numericStr = normalized.replace(/\./g, '');
  const parsed = Number(numericStr);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseImportDate(value: any): any {
  value = unwrapMongoExportValue(value);
  if (value === undefined || value === null || value === '' || value === '-') return '-';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date;
}

function parseImportAttachments(value: any): any[] {
  value = unwrapMongoExportValue(value);
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? { path: item } : unwrapMongoExportDocument(item)))
      .filter((item) => item && item.path);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '-') return [];
    try {
      const parsed = JSON.parse(trimmed);
      return parseImportAttachments(parsed);
    } catch {
      return trimmed.split('|').map((path) => ({ path: path.trim() })).filter((item) => item.path);
    }
  }
  return [];
}

function unwrapMongoExportValue(value: any): any {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Date) return value;
  if ('$oid' in value) return value.$oid;
  if ('$date' in value) return value.$date;
  if ('$numberInt' in value) return Number(value.$numberInt);
  if ('$numberLong' in value) return Number(value.$numberLong);
  if ('$numberDouble' in value) return Number(value.$numberDouble);
  if ('$numberDecimal' in value) return Number(value.$numberDecimal);
  return value;
}

function unwrapMongoExportDocument(row: any): any {
  if (!row || typeof row !== 'object') return row;
  if (Array.isArray(row)) return row.map(unwrapMongoExportDocument);
  const unwrapped = unwrapMongoExportValue(row);
  if (unwrapped !== row) return unwrapped;

  return Object.entries(row).reduce((result: any, [key, value]) => {
    result[key] = Array.isArray(value)
      ? value.map(unwrapMongoExportDocument)
      : unwrapMongoExportValue(value) === value
        ? unwrapMongoExportDocument(value)
        : unwrapMongoExportValue(value);
    return result;
  }, {});
}

function normalizeMasterValue(value: any): string {
  return String(value || '').trim().toUpperCase();
}

function makeMasterKey(...parts: any[]): string {
  return parts.map(normalizeMasterValue).join('||');
}

function getObjectIdString(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value.$oid) return String(value.$oid);
  if (typeof value.toHexString === 'function') return value.toHexString();
  if (value._id && value._id !== value) return getObjectIdString(value._id);
  return String(value);
}

function splitKodePerusahaan(value: any): string[] {
  return String(value || '')
    .split(',')
    .map(normalizeMasterValue)
    .filter(Boolean);
}

async function buildImportMasterLookup() {
  const activeFilter = { status_aktv: true };

  const [kategoriList, subKategoriList, akunList, perusahaanList, bankList, rekeningList] = await Promise.all([
    Kategori.find(activeFilter).select('kategori').lean(),
    SubKategori.find(activeFilter).select('kategori sub_kategori').lean(),
    Akun.find(activeFilter).select('kategori sub_kategori akun').lean(),
    Perusahaan.find({}).select('kode_perusahaan nama_perusahaan').lean(),
    Bank.find({}).select('kode_bank nama_bank').lean(),
    Rekening.find({}).select('kode_perusahaan kode_bank no_rekening perusahaan_id perusahaan_ids').lean(),
  ]);

  const perusahaanById = new Map(
    perusahaanList.map((item: any) => [getObjectIdString(item._id), normalizeMasterValue(item.kode_perusahaan)])
  );
  const rekeningPerusahaanKeys = new Set<string>();
  rekeningList.forEach((item: any) => {
    const kodeBank = normalizeMasterValue(item.kode_bank);
    const noRekening = normalizeMasterValue(item.no_rekening);
    splitKodePerusahaan(item.kode_perusahaan).forEach((kodePerusahaan) => {
      rekeningPerusahaanKeys.add(makeMasterKey(kodePerusahaan, kodeBank, noRekening));
    });
    (item.perusahaan_ids || []).forEach((perusahaanId: any) => {
      const kodePerusahaan = perusahaanById.get(getObjectIdString(perusahaanId));
      if (kodePerusahaan) {
        rekeningPerusahaanKeys.add(makeMasterKey(kodePerusahaan, kodeBank, noRekening));
      }
    });
    const primaryKodePerusahaan = perusahaanById.get(getObjectIdString(item.perusahaan_id));
    if (primaryKodePerusahaan) {
      rekeningPerusahaanKeys.add(makeMasterKey(primaryKodePerusahaan, kodeBank, noRekening));
    }
  });

  return {
    kategori: new Set(kategoriList.map((item: any) => normalizeMasterValue(item.kategori))),
    subKategori: new Set(subKategoriList.map((item: any) => makeMasterKey(item.kategori, item.sub_kategori))),
    akun: new Set(akunList.map((item: any) => makeMasterKey(item.kategori, item.sub_kategori, item.akun))),
    perusahaan: new Set(perusahaanList.map((item: any) => normalizeMasterValue(item.kode_perusahaan))),
    bank: new Set(bankList.map((item: any) => normalizeMasterValue(item.kode_bank))),
    rekening: new Set(rekeningList.map((item: any) => makeMasterKey(item.kode_bank, item.no_rekening))),
    rekeningPerusahaan: rekeningPerusahaanKeys,
  };
}

function validateImportMasterReferences(normalized: any, masterLookup: Awaited<ReturnType<typeof buildImportMasterLookup>>): string[] {
  const errors: string[] = [];
  const kategori = normalizeMasterValue(normalized.kategori);
  const subKategori = normalizeMasterValue(normalized.sub_kategori);
  const akun = normalizeMasterValue(normalized.akun);
  const kodePerusahaan = normalizeMasterValue(normalized.kode_perusahaan);
  const kodeBank = normalizeMasterValue(normalized.kode_bank);
  const noRekening = normalizeMasterValue(normalized.no_rekening);
  const isDeletedArchive = normalized.status_deleted === true;
  const hasKodeBank = Boolean(kodeBank && kodeBank !== '-');
  const hasNoRekening = Boolean(noRekening && noRekening !== '-');

  if (isDeletedArchive) {
    return errors;
  }

  if (kategori && !masterLookup.kategori.has(kategori)) {
    errors.push(`master kategori "${kategori}" belum ada atau tidak aktif`);
  }

  if (kategori && subKategori && !masterLookup.subKategori.has(makeMasterKey(kategori, subKategori))) {
    errors.push(`master sub kategori "${subKategori}" belum ada atau tidak aktif untuk kategori "${kategori}"`);
  }

  if (kategori && subKategori && akun && !masterLookup.akun.has(makeMasterKey(kategori, subKategori, akun))) {
    errors.push(`master akun "${akun}" belum ada atau tidak aktif untuk sub kategori "${subKategori}"`);
  }

  if (!kodePerusahaan || kodePerusahaan === '-') {
    errors.push('kode_perusahaan wajib diisi dan harus ada di master perusahaan');
  } else if (kodePerusahaan && kodePerusahaan !== '-' && !masterLookup.perusahaan.has(kodePerusahaan)) {
    errors.push(`master perusahaan "${kodePerusahaan}" belum ada`);
  }

  if (hasKodeBank !== hasNoRekening) {
    errors.push('kode_bank dan no_rekening harus sama-sama diisi atau sama-sama "-" untuk data legacy tanpa rekening');
  }

  if (hasKodeBank && hasNoRekening) {
    if (!masterLookup.bank.has(kodeBank)) {
      errors.push(`master bank "${kodeBank}" belum ada`);
    }

    if (!masterLookup.rekening.has(makeMasterKey(kodeBank, noRekening))) {
      errors.push(`master rekening "${kodeBank} / ${noRekening}" belum ada`);
    } else if (
      kodePerusahaan &&
      kodePerusahaan !== '-' &&
      !masterLookup.rekeningPerusahaan.has(makeMasterKey(kodePerusahaan, kodeBank, noRekening))
    ) {
      errors.push(`master rekening "${kodeBank} / ${noRekening}" belum terhubung ke perusahaan "${kodePerusahaan}"`);
    }
  }

  return errors;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values.map((item) => item.trim());
}

function parseCsvContent(content: string): any[] {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length <= 1) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((row: any, header, idx) => {
      row[header] = values[idx] ?? '';
      return row;
    }, {});
  });
}

function parseImportRows(file: Express.Multer.File): any[] {
  const filename = String(file.originalname || '').toLowerCase();
  const content = file.buffer.toString('utf8');
  if (filename.endsWith('.json')) {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.data)) return parsed.data;
    if (Array.isArray(parsed?.documents)) return parsed.documents;
    throw new Error('File JSON harus berupa array atau memiliki field data/documents array.');
  }
  if (filename.endsWith('.csv')) return parseCsvContent(content);
  throw new Error('Format file belum didukung. Gunakan .json atau .csv.');
}

function normalizeImportRow(row: any, rowNumber: number, actor: string) {
  row = unwrapMongoExportDocument(row);
  const errors: string[] = [];
  const tanggal = String(row.tanggal || '').slice(0, 10);
  const bulan = String(row.bulan || '').trim().toUpperCase().replace(/\s*-\s*/g, '-');
  const kategori = String(row.kategori || '').trim().toUpperCase();
  const subKategori = String(row.sub_kategori || row.subKategori || '').trim().toUpperCase();
  const akun = String(row.akun || '').trim().toUpperCase();
  const nilai = parseImportNumber(row.nilai);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) errors.push('tanggal wajib format YYYY-MM-DD');
  if (!/^[A-Z]{3}-\d{2}$/.test(bulan)) errors.push('bulan wajib format JAN-25');
  if (!kategori) errors.push('kategori wajib diisi');
  if (!subKategori) errors.push('sub_kategori wajib diisi');
  if (!akun) errors.push('akun wajib diisi');
  if (nilai === null) errors.push('nilai wajib number');

  const tahunFiskal = row.tahun_fiskal ? String(row.tahun_fiskal) : deriveTahunFiskalFromBulanV2(bulan);
  if (!tahunFiskal) errors.push('tahun_fiskal tidak dapat ditentukan');

  const transactionMode = normalizeTransactionMode(row.transaction_mode, row.is_special_transaction);
  const isValidated = parseImportBoolean(row.is_validated, false);
  const statusDeleted = parseImportBoolean(row.status_deleted, false);
  const statusFinal = parseImportBoolean(row.status_final, true);
  const createdAt = parseImportDate(row.created_at);

  const importId = row._id || row.id;
  const normalized: any = {
    ...(importId && mongoose.Types.ObjectId.isValid(String(importId)) ? { _id: new mongoose.Types.ObjectId(String(importId)) } : {}),
    is_validated: isValidated,
    tanggal,
    bulan,
    tahun_fiskal: tahunFiskal,
    kategori,
    sub_kategori: subKategori,
    akun,
    nilai: nilai ?? 0,
    keterangan: row.keterangan && String(row.keterangan).trim() !== '' ? String(row.keterangan).trim().toUpperCase() : '-',
    created_by: String(row.created_by || row.input_by || actor || 'IMPORT').trim(),
    created_at: createdAt === '-' ? new Date() : createdAt,
    updated_by: row.updated_by || undefined,
    updated_at: parseImportDate(row.updated_at) === '-' ? undefined : parseImportDate(row.updated_at),
    deleted_by: row.deleted_by || undefined,
    deleted_at: parseImportDate(row.deleted_at) === '-' ? undefined : parseImportDate(row.deleted_at),
    status_deleted: statusDeleted,
    status_final: statusFinal,
    kode_perusahaan: String(row.kode_perusahaan || '').trim() || '-',
    nama_perusahaan: String(row.nama_perusahaan || '').trim() || '-',
    kode_bank: String(row.kode_bank || '').trim() || '-',
    no_rekening: String(row.no_rekening || '').trim() || '-',
    source_type: 'REKENING',
    is_special_transaction: transactionMode === 'SPECIAL',
    transaction_mode: transactionMode,
    attachments: parseImportAttachments(row.attachments),
    validated_at: isValidated ? parseImportDate(row.validated_at) : '-',
    validator_notes: row.validator_notes && String(row.validator_notes).trim() !== '' ? String(row.validator_notes) : '-',
    validator_notes_at: isValidated ? parseImportDate(row.validator_notes_at) : '-',
    validator_notes_by: isValidated ? String(row.validator_notes_by || actor || 'IMPORT') : '-',
    posting_state: 'NOT_APPLIED',
    posting_version: POSTING_VERSION,
    posted_at: '-',
    posting_error: '-',
  };

  return { rowNumber, normalized, errors };
}

async function processImportRows(rows: any[], actor: string, startRow = 1) {
  const masterLookup = await buildImportMasterLookup();
  const report = {
    total: rows.length,
    success: 0,
    skipped: 0,
    failed: 0,
    summary_rebuilt: 0,
    errors: [] as Array<{ row: number; reason: string; data?: any }>,
    successes: [] as Array<{ row: number; id: string }>,
    skips: [] as Array<{ row: number; reason: string; id?: string }>,
  };

  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = startRow + index;
    const { normalized, errors } = normalizeImportRow(rows[index], rowNumber, actor);
    const validationErrors = [
      ...errors,
      ...(errors.length === 0 ? validateImportMasterReferences(normalized, masterLookup) : []),
    ];

    if (validationErrors.length > 0) {
      report.failed += 1;
      report.errors.push({ row: rowNumber, reason: validationErrors.join('; '), data: rows[index] });
      continue;
    }

    try {
      const importResult = await runMongoTransaction(async (session) => {
        if (normalized._id) {
          const exists = await TtFinanceDetail.exists({ _id: normalized._id }).session(session);
          if (exists) {
            return { type: 'skipped' as const, id: String(normalized._id), summaryRebuilt: false };
          }
        }

        const [doc] = await TtFinanceDetail.create([normalized], { session });
        let summaryRebuilt = false;

        if (!doc.is_validated) {
          await applySaldoOnHoldForPendingDetail(doc, session);
          if (doc.isModified('saldo_on_hold_applied')) {
            await doc.save({ session });
          }
        }

        if (shouldEnterSummaryV2(doc)) {
          await rebuildSummaryV2ForDetail(doc, session);
          await syncPostingStateForDetail(doc, session);
          summaryRebuilt = true;
        }

        return { type: 'success' as const, id: String(doc._id), summaryRebuilt };
      });

      if (importResult.type === 'skipped') {
        report.skipped += 1;
        report.skips.push({ row: rowNumber, reason: 'dokumen sudah pernah diimport', id: importResult.id });
      } else {
        report.success += 1;
        report.successes.push({ row: rowNumber, id: importResult.id });
        if (importResult.summaryRebuilt) report.summary_rebuilt += 1;
      }
    } catch (error: any) {
      report.failed += 1;
      const reason = error?.code === 11000
        ? `duplicate key ${JSON.stringify(error?.keyValue || {})}`
        : error?.message || 'Gagal insert dokumen';
      report.errors.push({ row: rowNumber, reason, data: rows[index] });
    }
  }

  return report;
}

// Validasi data hasil attachment (hanya superuser/corsec)
export const validateAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as any; // diasumsikan sudah ada middleware auth, req.user terisi
    if (!user || (user.role !== 'superuser' && user.role !== 'corsec')) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    const { id, validator_notes } = req.body;
    if (!id) return res.status(400).json({ message: 'ID is required' });

    const result = await runMongoTransaction(async (session) => {
      const doc = await TtFinanceDetail.findById(id).session(session);
      if (!doc) return { status: 404, body: { message: 'Transaksi detail not found' } };

      if (doc.status_final === false) {
        return { status: 400, body: { message: 'Transaksi belum final dan tidak bisa divalidasi.' } };
      }

      const docFiscalYear = deriveTahunFiskalFromDetail(doc);
      if (await isFiscalYearClosed(docFiscalYear, session)) {
        return { status: 400, body: { message: `Tahun fiskal ${docFiscalYear} sudah ditutup dan tidak bisa divalidasi.` } };
      }

      if (doc.is_validated) {
        if (shouldEnterSummaryV2(doc)) {
          await rebuildSummaryV2ForDetail(doc, session);
        }
        await syncPostingStateForDetail(doc, session);
        return { status: 200, body: { success: true, message: 'Transaksi sudah divalidasi. Summary v2 sudah disinkronkan.' } };
      }

      const saldoDelta = getRekeningBalanceDelta(doc);
      if (saldoDelta !== 0) {
        await incrementRekeningBalance(
          doc,
          {
            saldo: saldoDelta,
            saldo_on_hold: doc.saldo_on_hold_applied ? -saldoDelta : 0,
          },
          session
        );
      }

      const validatorBy = user?.username || user?.email || user?._id || 'SYSTEM';
      const validatorAt = new Date();
      await applyAssetMovementFromTransaction(doc, String(validatorBy), session);
      doc.is_validated = true;
      doc.saldo_on_hold_applied = false;
      doc.validator_notes = validator_notes && String(validator_notes).trim() !== '' ? String(validator_notes) : '-';
      doc.validator_notes_by = validatorBy;
      doc.validator_notes_at = validatorAt;
      doc.validated_at = validatorAt;
      await doc.save({ session });

      if (shouldEnterSummaryV2(doc)) {
        await rebuildSummaryV2ForDetail(doc, session);
      }
      await syncPostingStateForDetail(doc, session);

      return { status: 200, body: { success: true, message: 'Validasi berhasil' } };
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
};



export const deleteTransaksi = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const deleted_by = req.body?.deleted_by || req.query?.deleted_by || 'SYSTEM';
    const secret_code = req.body?.secret_code || req.query?.secret_code || '';
    // Find detail
    const detail = await TtFinanceDetail.findById(id);
    if(!detail) return res.status(404).json({ message: 'Transaksi detail not found' });
    const detailFiscalYear = deriveTahunFiskalFromDetail(detail);
    if (await isFiscalYearClosed(detailFiscalYear)) {
      return res.status(400).json({ message: `Tahun fiskal ${detailFiscalYear} sudah ditutup dan transaksi tidak bisa dihapus.` });
    }
    const user = req.user as any;
    const userRole = String(user?.role || '').toLowerCase();
    const deleteActor = String(user?.username || user?.name || user?.email || user?._id || deleted_by || 'SYSTEM');
    if (detail.status_deleted === true) {
      return res.json({ success: true, message: 'Transaksi sudah soft deleted', detail });
    }
    if (detail.is_validated) {
      if (!user || userRole !== 'superuser') {
        return res.status(403).json({ message: 'Hanya superuser yang bisa menghapus transaksi tervalidasi.' });
      }

      const expectedSecret = process.env.DELETE_VALIDATED_SECRET_CODE || '';
      if (!expectedSecret) {
        return res.status(500).json({ message: 'Secret code untuk hapus transaksi tervalidasi belum dikonfigurasi.' });
      }

      if (String(secret_code) !== expectedSecret) {
        return res.status(403).json({ message: 'Secret code tidak valid.' });
      }
    } else if (!['superuser', 'finance'].includes(userRole)) {
      return res.status(403).json({ message: 'Hanya finance atau superuser yang bisa menghapus transaksi belum valid.' });
    }

    const deletedDetail = await runMongoTransaction(async (session) => {
      const txDetail = await TtFinanceDetail.findById(id).session(session);
      if (!txDetail) throw new Error('Transaksi detail not found');
      if (txDetail.status_deleted === true) return txDetail;

      const saldoDelta = getRekeningBalanceDelta(txDetail);
      if (txDetail.is_validated && saldoDelta !== 0) {
        await incrementRekeningBalance(txDetail, { saldo: -saldoDelta }, session);
      } else if (!txDetail.is_validated) {
        await releaseSaldoOnHoldForPendingDetail(txDetail, session);
      }
      if (txDetail.is_validated) {
        await rollbackAssetMovementFromTransaction(txDetail, deleteActor, session);
      }

      // Soft delete: set status_deleted, deleted_at, deleted_by
      txDetail.status_deleted = true;
      txDetail.deleted_at = new Date();
      txDetail.deleted_by = deleteActor;
      await txDetail.save({ session });

      await rebuildSummaryV2ForDetail(txDetail, session);
      await syncPostingStateForDetail(txDetail, session);
      return txDetail;
    });

    res.json({ success: true, message: 'Transaksi soft deleted', detail: deletedDetail });
  } catch (error) {
    next(error);
  }
};
// Upload attachments for transaksi
export const uploadAttachments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ message: 'No files uploaded' });

    const doc = await TtFinanceDetail.findById(id);
    if (!doc) return res.status(404).json({ message: 'Transaksi not found' });
    const fiscalYear = deriveTahunFiskalFromDetail(doc);
    if (await isFiscalYearClosed(fiscalYear)) {
      return res.status(400).json({ message: `Tahun fiskal ${fiscalYear} sudah ditutup dan lampiran tidak bisa diubah.` });
    }

    const newAttachments = files.map(file => ({
      path: `/uploads/transaksi/${file.filename}`
    }));
    doc.attachments = [...(doc.attachments || []), ...newAttachments];
    doc.updated_at = new Date();
    await doc.save();



    res.json({ success: true, attachments: doc.attachments });
  } catch (error) {
    next(error);
  }
};

// Delete attachment from transaksi
export const deleteAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, filename } = req.params;
    const doc = await TtFinanceDetail.findById(id);
    if (!doc) return res.status(404).json({ message: 'Transaksi not found' });
    const fiscalYear = deriveTahunFiskalFromDetail(doc);
    if (await isFiscalYearClosed(fiscalYear)) {
      return res.status(400).json({ message: `Tahun fiskal ${fiscalYear} sudah ditutup dan lampiran tidak bisa diubah.` });
    }

    // Filter out the attachment to be deleted
    const filteredAttachments = (doc.attachments || []).filter(att => !att.path.includes(filename));
    doc.attachments = filteredAttachments;
    doc.updated_at = new Date();
    await doc.save();

    res.json({ success: true, attachments: doc.attachments });
  } catch (error) {
    next(error);
  }
};


export const createTransaksi = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { kategori, sub_kategori, akun, bulan, nilai, input_by, tahun_fiskal, tanggal, keterangan, kode_perusahaan, nama_perusahaan, kode_bank, no_rekening, is_special_transaction, transaction_mode, status_final, split_dana, source_type, asset_id, asset_qty } = req.body;
    if (!kategori || !sub_kategori || !akun || !bulan || nilai === undefined) {
      return res.status(400).json({ message: 'kategori, sub_kategori, akun, bulan, nilai required' });
    }
    // --- Fiscal year validation ---
    // Get fiscal year from bulan or tahun_fiskal
    let fiscalYearInput = tahun_fiskal;
    if (!fiscalYearInput && bulan) {
      const match = bulan.match(/([A-Z]+)\s*-\s*(\d{2,4})$/i);
      if (match) {
        const bulanStr = match[1].toUpperCase();
        let tahunNum = match[2].length === 2 ? 2000 + parseInt(match[2]) : parseInt(match[2]);
        const bulanMap: Record<string, number> = {
          JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
          JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12
        };
        const bulanAngka = bulanMap[bulanStr] || 1;
        fiscalYearInput = bulanAngka >= 12 ? (tahunNum + 1) : tahunNum;
      }
    }
    // Get active year from FiscalConfig
    const fiscalConfig = await FiscalConfig.findOne({ key: 'fiscal' });
    const activeYear = fiscalConfig?.active_year ? Number(fiscalConfig.active_year) : null;
    if (activeYear !== null && Number(fiscalYearInput) > activeYear) {
      return res.status(400).json({ message: `Tahun fiskal ${fiscalYearInput} melebihi tahun aktif ${activeYear}. Input/edit ditolak.` });
    }
    if (await isFiscalYearClosed(fiscalYearInput)) {
      return res.status(400).json({ message: `Tahun fiskal ${fiscalYearInput} sudah ditutup. Input ditolak.` });
    }
    // Otomatis ambil tahun fiskal dari bulan jika tidak dikirim
    let tahunFiskal = tahun_fiskal;
    if (!tahunFiskal && bulan) {
      // Format bulan: "APR - 25" → bulan=APR, tahun=25
      const match = bulan.match(/([A-Z]+)\s*-\s*(\d{2,4})$/i);
      if (match) {
        const bulanStr = match[1].toUpperCase();
        let tahunNum = match[2].length === 2 ? 2000 + parseInt(match[2]) : parseInt(match[2]);
        // Map bulan ke angka
        const bulanMap: Record<string, number> = {
          JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
          JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12
        };
        const bulanAngka = bulanMap[bulanStr] || 1;
        // Aturan fiskal: Desember (12) → tahun fiskal = tahun+1, Jan–Nov → tahun fiskal = tahun
        tahunFiskal = bulanAngka >= 12 ? (tahunNum + 1).toString() : tahunNum.toString();
      }
    }
    if (!tahunFiskal) {
      return res.status(400).json({ message: 'tahun_fiskal tidak ditemukan dari bulan' });
    }
    const transactionMode = normalizeTransactionMode(transaction_mode, is_special_transaction);
    const splitDana = Array.isArray(split_dana) ? split_dana : [];
    const totalSplitDana = splitDana.reduce((sum: number, item: any) => sum + Number(item?.nominal || 0), 0);
    if (splitDana.length > 0) {
      if (!kode_bank || !no_rekening) {
        return res.status(400).json({ message: 'Rekening sumber wajib dipilih untuk split dana.' });
      }
      if (totalSplitDana <= 0) {
        return res.status(400).json({ message: 'Total split dana harus lebih besar dari 0.' });
      }
      if (totalSplitDana > Number(nilai || 0)) {
        return res.status(400).json({ message: 'Total split dana tidak boleh melebihi nilai transaksi sumber.' });
      }
      const invalidSplit = splitDana.find((item: any) =>
        !item?.kode_bank ||
        !item?.no_rekening ||
        !item?.keluar_kategori ||
        !item?.keluar_sub_kategori ||
        !item?.keluar_akun ||
        !item?.masuk_kategori ||
        !item?.masuk_sub_kategori ||
        !item?.masuk_akun ||
        Number(item?.nominal || 0) <= 0 ||
        (String(item.kode_bank) === String(kode_bank) && String(item.no_rekening) === String(no_rekening))
      );
      if (invalidSplit) {
        return res.status(400).json({ message: 'Setiap split wajib punya rekening tujuan berbeda, nominal, dan kategori/sub kategori/akun keluar-masuk.' });
      }
    }

    // Simpan detail transaksi ke tt_finance_detail
    // tanggal HARUS diambil dari input (bukan tanggal input), dan WAJIB ADA
    if (!tanggal) {
      return res.status(400).json({ message: 'tanggal (tanggal transaksi) wajib diisi' });
    }
    const sourceType = String(source_type || 'REKENING').toUpperCase() === 'ASSET' ? 'ASSET' : 'REKENING';
    let assetSnapshot: Awaited<ReturnType<typeof resolveAssetSnapshot>> | null = null;
    if (sourceType === 'ASSET') {
      const qty = Number(asset_qty || 0);
      if (!asset_id || !Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ message: 'asset_id dan asset_qty wajib diisi untuk transaksi asset.' });
      }
      assetSnapshot = await resolveAssetSnapshot(String(asset_id));
    }
    const hasSplitDana = splitDana.length > 0;
    const sourceTransactionMode = hasSplitDana ? 'SPECIAL' : transactionMode;
    const detail = new TtFinanceDetail({
      tanggal: tanggal,
      bulan,
      kategori,
      sub_kategori,
      akun,
      nilai,
      keterangan: keterangan && keterangan.trim() !== '' ? keterangan.toUpperCase() : '-',
      created_by: input_by,
      created_at: new Date(),
      kode_perusahaan: kode_perusahaan || '',
      nama_perusahaan: nama_perusahaan || '',
      kode_bank: sourceType === 'ASSET' ? '-' : (kode_bank && kode_bank.trim() !== '' ? kode_bank : '-'),
      no_rekening: sourceType === 'ASSET' ? '-' : (no_rekening && no_rekening.trim() !== '' ? no_rekening : '-'),
      source_type: sourceType,
      asset_id: sourceType === 'ASSET' ? assetSnapshot?.asset._id : undefined,
      asset_code: sourceType === 'ASSET' ? assetSnapshot?.asset_code : undefined,
      asset_name: sourceType === 'ASSET' ? assetSnapshot?.asset_name : undefined,
      asset_qty: sourceType === 'ASSET' ? Number(asset_qty) : undefined,
      asset_unit: sourceType === 'ASSET' ? assetSnapshot?.unit : undefined,
      asset_unit_price_snapshot: sourceType === 'ASSET' ? assetSnapshot?.current_price : undefined,
      status_final: status_final === undefined ? true : Boolean(status_final),
      tahun_fiskal,
      is_special_transaction: sourceTransactionMode === 'SPECIAL',
      transaction_mode: sourceTransactionMode,
      rekening_mutation_direction: hasSplitDana ? 'IN' : undefined,
      posting_state: 'NOT_APPLIED',
      posting_version: POSTING_VERSION,
      posted_at: '-',
      posting_error: '-',
    });

    const splitDetails: any[] = [];
    await runMongoTransaction(async (session) => {
      await detail.save({ session });
      await applySaldoOnHoldForPendingDetail(detail, session);
      if (detail.isModified('saldo_on_hold_applied')) {
        await detail.save({ session });
      }

      for (const item of splitDana) {
        const nominal = Number(item.nominal || 0);
        const targetLabel = [item.kode_bank, item.no_rekening].filter(Boolean).join(' - ');
        const splitBase = {
          tanggal,
          bulan,
          created_by: input_by,
          created_at: new Date(),
          source_type: 'REKENING',
          status_final: status_final === undefined ? true : Boolean(status_final),
          tahun_fiskal,
          is_special_transaction: true,
          transaction_mode: 'SPECIAL',
          posting_state: 'NOT_APPLIED',
          posting_version: POSTING_VERSION,
          posted_at: '-',
          posting_error: '-',
        };

        const keluar = new TtFinanceDetail({
          ...splitBase,
          rekening_mutation_direction: 'OUT',
          kategori: String(item.keluar_kategori || '').toUpperCase(),
          sub_kategori: String(item.keluar_sub_kategori || '').toUpperCase(),
          akun: String(item.keluar_akun || '').toUpperCase(),
          nilai: nominal,
          keterangan: `SPLIT DANA KE ${String(targetLabel || item.nama_rekening || '').toUpperCase()}`,
          kode_perusahaan: kode_perusahaan || '',
          nama_perusahaan: nama_perusahaan || '',
          kode_bank,
          no_rekening,
        });

        const masuk = new TtFinanceDetail({
          ...splitBase,
          is_special_transaction: false,
          transaction_mode: 'NORMAL',
          rekening_mutation_direction: 'IN',
          kategori: String(item.masuk_kategori || '').toUpperCase(),
          sub_kategori: String(item.masuk_sub_kategori || '').toUpperCase(),
          akun: String(item.masuk_akun || '').toUpperCase(),
          nilai: nominal,
          keterangan: item.keterangan && String(item.keterangan).trim() !== ''
            ? String(item.keterangan).toUpperCase()
            : `SPLIT DANA DARI ${String(kode_bank || '')} - ${String(no_rekening || '')}`,
          kode_perusahaan: item.kode_perusahaan || '',
          nama_perusahaan: item.nama_perusahaan || '',
          kode_bank: item.kode_bank,
          no_rekening: item.no_rekening,
        });

        for (const splitDetail of [keluar, masuk]) {
          await splitDetail.save({ session });
          await applySaldoOnHoldForPendingDetail(splitDetail, session);
          if (splitDetail.isModified('saldo_on_hold_applied')) {
            await splitDetail.save({ session });
          }
          splitDetails.push(splitDetail);
        }
      }

      const sisaSplitDana = Number(nilai || 0) - totalSplitDana;
      if (hasSplitDana && sisaSplitDana > 0) {
        const remainder = new TtFinanceDetail({
          tanggal,
          bulan,
          kategori,
          sub_kategori,
          akun,
          nilai: sisaSplitDana,
          keterangan: keterangan && keterangan.trim() !== ''
            ? `${keterangan.toUpperCase()} - SISA SPLIT DANA`
            : 'SISA SPLIT DANA',
          created_by: input_by,
          created_at: new Date(),
          kode_perusahaan: kode_perusahaan || '',
          nama_perusahaan: nama_perusahaan || '',
          kode_bank: '-',
          no_rekening: '-',
          source_type: 'REKENING',
          status_final: status_final === undefined ? true : Boolean(status_final),
          tahun_fiskal,
          is_special_transaction: false,
          transaction_mode: 'FINANCE_ONLY',
          posting_state: 'NOT_APPLIED',
          posting_version: POSTING_VERSION,
          posted_at: '-',
          posting_error: '-',
        });
        await remainder.save({ session });
        splitDetails.push(remainder);
      }
    });

    res.json({ ...detail.toObject(), split_details: splitDetails.map((item) => item.toObject()) });
  } catch (error) {
    next(error);
  }
};

export const listTransaksi = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tahun, bulan, kategori, sub_kategori, akun, input_by, page = '1', limit = '10', flatten = '0', sortKategori, q, special_type } = req.query as any;
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const doFlatten = String(flatten) === '1' || String(flatten).toLowerCase() === 'true';
    const filter: any = {};
    if (tahun) filter.tahun_fiskal = buildSummaryYearMatchValue(tahun);
    if (kategori && kategori !== 'ALL') filter.kategori = kategori;
    if (sub_kategori && sub_kategori !== 'ALL') filter.sub_kategori = sub_kategori;
    if (akun && akun !== 'ALL') filter.akun = akun;
    if (input_by && input_by !== 'ALL') {
      return res.json({ data: [], total: 0, totalNilai: 0, page: pageNum, totalPages: 1 });
    }
    if (special_type && special_type !== 'NORMAL' && special_type !== 'ALL') {
      return res.json({ data: [], total: 0, totalNilai: 0, page: pageNum, totalPages: 1 });
    }

    if (doFlatten) {
      const monthlyFilter: any = { ...filter, period_type: 'MONTHLY' };
      const monthQuery = buildSummaryMonthQuery(tahun, bulan);
      if (monthQuery) Object.assign(monthlyFilter, monthQuery);

      const sortStage: any = {};
      if (sortKategori === 'asc') sortStage.kategori = 1;
      else if (sortKategori === 'desc') sortStage.kategori = -1;
      sortStage.akun = 1;
      sortStage.sub_kategori = 1;
      sortStage.bulan_fiskal = 1;
      sortStage.bulan_fiskal_label = 1;

      const qText = q && String(q).trim() !== '' ? String(q).trim() : '';
      const qRegex = qText ? escapeRegex(qText) : '';
      const qAmount = qText ? parseRupiahSearch(qText) : null;
      const searchMatchStage = qText
        ? [{
            $match: {
              $or: [
                { kategori: { $regex: qRegex, $options: 'i' } },
                { sub_kategori: { $regex: qRegex, $options: 'i' } },
                { akun: { $regex: qRegex, $options: 'i' } },
                { bulan_fiskal_label: { $regex: qRegex, $options: 'i' } },
                ...(qAmount !== null ? [{ total_nilai: qAmount }] : []),
              ],
            },
          }]
        : [];
      const pipeline: any[] = [
        { $match: monthlyFilter },
        ...searchMatchStage,
        {
          $project: {
            kategori: 1,
            sub_kategori: 1,
            akun: 1,
            tahun_fiskal: 1,
            bulan: '$bulan_fiskal_label',
            nilai: '$total_nilai',
            parentId: '$_id',
            transaction_count: 1,
            source: 1,
          },
        },
        { $sort: sortStage },
        {
          $facet: {
            pagedResults: [
              { $skip: (pageNum - 1) * limitNum },
              { $limit: limitNum },
            ],
            totalCount: [
              { $count: 'count' }
            ],
            totalSum: [
              { $group: { _id: null, sum: { $sum: '$nilai' } } }
            ]
          }
        }
      ];

      const aggRes = await TtSummaryV2.aggregate(pipeline).allowDiskUse(true).exec();
      const paged = aggRes[0]?.pagedResults || [];
      const total = (aggRes[0]?.totalCount && aggRes[0].totalCount[0] && aggRes[0].totalCount[0].count) || 0;
      const totalSum = (aggRes[0]?.totalSum && aggRes[0].totalSum[0] && aggRes[0].totalSum[0].sum) || 0;
      const totalPages = Math.ceil(total / limitNum) || 1;
      return res.json({ data: paged, total, totalNilai: totalSum, page: pageNum, totalPages });
    }

    const yearlyFilter: any = { ...filter, period_type: 'YEARLY' };
    const searchFilter = (() => {
      if (q && String(q).trim() !== '') {
        const qText = String(q).trim();
        const rx = new RegExp(escapeRegex(qText), 'i');
        const amount = parseRupiahSearch(qText);
        return { $or: [
          { kategori: rx },
          { sub_kategori: rx },
          { akun: rx },
          ...(amount !== null ? [{ total_nilai: amount }] : []),
        ] };
      }
      return {};
    })();
    const finalFilter = Object.keys(searchFilter).length ? { $and: [yearlyFilter, searchFilter] } : yearlyFilter;

    const total = await TtSummaryV2.countDocuments(finalFilter);
    const totalPages = Math.ceil(total / limitNum) || 1;
    const sumAgg = await TtSummaryV2.aggregate([
      { $match: finalFilter },
      { $group: { _id: null, sum: { $sum: '$total_nilai' } } }
    ]).exec();
    const totalSum = sumAgg[0]?.sum || 0;

    const sortObj: any = {};
    if (sortKategori === 'asc') sortObj.kategori = 1;
    else if (sortKategori === 'desc') sortObj.kategori = -1;
    sortObj.akun = 1;
    sortObj.sub_kategori = 1;
    sortObj._id = 1; // Stable tiebreaker

    const list = await TtSummaryV2.find(finalFilter)
      .sort(sortObj)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();
    res.json({ data: list, total, totalNilai: totalSum, page: pageNum, totalPages });
  } catch (error) {
    next(error);
  }
};

export const updateTransaksi = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { kategori, sub_kategori, akun, bulan, nilai, input_by, tahun_fiskal, tanggal, keterangan, kode_perusahaan, nama_perusahaan, kode_bank, no_rekening, is_special_transaction, transaction_mode, status_final, rekening_mutation_direction, source_type, asset_id, asset_qty } = req.body;
    // Cari detail transaksi di tt_finance_detail
    const detail = await TtFinanceDetail.findById(id);
    if (!detail) return res.status(404).json({ message: 'Transaksi detail not found' });
    if (detail.is_validated) {
      return res.status(400).json({ message: 'Transaksi sudah divalidasi, tidak bisa diedit.' });
    }
    const oldFiscalYear = deriveTahunFiskalFromDetail(detail);
    if (await isFiscalYearClosed(oldFiscalYear)) {
      return res.status(400).json({ message: `Tahun fiskal ${oldFiscalYear} sudah ditutup dan transaksi tidak bisa diedit.` });
    }
    // --- Fiscal year validation for update ---
    // Determine fiscal year from new bulan or tahun_fiskal
    let fiscalYearInput = tahun_fiskal;
    let bulanInput = bulan || detail.bulan;
    if (!fiscalYearInput && bulanInput) {
      const match = bulanInput.match(/([A-Z]+)\s*-\s*(\d{2,4})$/i);
      if (match) {
        const bulanStr = match[1].toUpperCase();
        let tahunNum = match[2].length === 2 ? 2000 + parseInt(match[2]) : parseInt(match[2]);
        const bulanMap: Record<string, number> = {
          JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
          JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12
        };
        const bulanAngka = bulanMap[bulanStr] || 1;
        fiscalYearInput = bulanAngka >= 12 ? (tahunNum + 1) : tahunNum;
      }
    }
    // Get active year from FiscalConfig
    const fiscalConfig = await FiscalConfig.findOne({ key: 'fiscal' });
    const activeYear = fiscalConfig?.active_year ? Number(fiscalConfig.active_year) : null;
    if (activeYear !== null && Number(fiscalYearInput) > activeYear) {
      return res.status(400).json({ message: `Tahun fiskal ${fiscalYearInput} melebihi tahun aktif ${activeYear}. Input/edit ditolak.` });
    }
    if (await isFiscalYearClosed(fiscalYearInput)) {
      return res.status(400).json({ message: `Tahun fiskal ${fiscalYearInput} sudah ditutup. Edit ditolak.` });
    }

    const newTransactionMode = normalizeTransactionMode(
      transaction_mode ?? detail.transaction_mode,
      is_special_transaction ?? detail.is_special_transaction
    );
    const newSourceType = String(source_type || detail.source_type || 'REKENING').toUpperCase() === 'ASSET' ? 'ASSET' : 'REKENING';
    let assetSnapshot: Awaited<ReturnType<typeof resolveAssetSnapshot>> | null = null;
    if (newSourceType === 'ASSET') {
      const qty = Number(asset_qty !== undefined ? asset_qty : detail.asset_qty || 0);
      const targetAssetId = asset_id || detail.asset_id;
      if (!targetAssetId || !Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ message: 'asset_id dan asset_qty wajib diisi untuk transaksi asset.' });
      }
      assetSnapshot = await resolveAssetSnapshot(String(targetAssetId));
    }

    // Hitung tahun fiskal dari bulan baru
    let tahunFiskal = tahun_fiskal;
    if (!tahunFiskal) {
      tahunFiskal = deriveTahunFiskalFromBulanV2(bulan || detail.bulan);
    }
    if (!tahunFiskal) {
      return res.status(400).json({ message: 'Gagal menentukan tahun_fiskal untuk transaksi baru.' });
    }

    // 2. Create new detail (like add)
    const newDetail = new TtFinanceDetail({
      tanggal: tanggal || detail.tanggal,
      bulan: bulan || detail.bulan,
      kategori: kategori || detail.kategori,
      sub_kategori: sub_kategori || detail.sub_kategori,
      akun: akun || detail.akun,
      nilai: nilai !== undefined ? nilai : detail.nilai,
      keterangan: keterangan && keterangan.trim() !== '' ? keterangan.toUpperCase() : '-',
      created_by: input_by || detail.created_by,
      created_at: new Date(),
      kode_perusahaan: kode_perusahaan || '',
      nama_perusahaan: nama_perusahaan || '',
      kode_bank: newSourceType === 'ASSET' ? '-' : (kode_bank && kode_bank.trim() !== '' ? kode_bank : '-'),
      no_rekening: newSourceType === 'ASSET' ? '-' : (no_rekening && no_rekening.trim() !== '' ? no_rekening : '-'),
      source_type: newSourceType,
      asset_id: newSourceType === 'ASSET' ? assetSnapshot?.asset._id : undefined,
      asset_code: newSourceType === 'ASSET' ? assetSnapshot?.asset_code : undefined,
      asset_name: newSourceType === 'ASSET' ? assetSnapshot?.asset_name : undefined,
      asset_qty: newSourceType === 'ASSET' ? Number(asset_qty !== undefined ? asset_qty : detail.asset_qty || 0) : undefined,
      asset_unit: newSourceType === 'ASSET' ? assetSnapshot?.unit : undefined,
      asset_unit_price_snapshot: newSourceType === 'ASSET' ? assetSnapshot?.current_price : undefined,
      status_final: status_final === undefined ? (detail.status_final !== false) : Boolean(status_final),
      tahun_fiskal: tahunFiskal,
      is_special_transaction: newTransactionMode === 'SPECIAL',
      transaction_mode: newTransactionMode,
      rekening_mutation_direction: rekening_mutation_direction || detail.rekening_mutation_direction,
      attachments: detail.attachments && detail.attachments.length > 0 ? [...detail.attachments] : [],
      posting_state: 'NOT_APPLIED',
      posting_version: POSTING_VERSION,
      posted_at: '-',
      posting_error: '-',
    });
    await runMongoTransaction(async (session) => {
      await releaseSaldoOnHoldForPendingDetail(detail, session);

      // 1. Soft delete old detail
      detail.status_deleted = true;
      detail.deleted_at = new Date();
      detail.deleted_by = input_by || 'SYSTEM';
      Object.assign(detail, buildPostingStatePatch({ ...detail.toObject(), status_deleted: true }));
      await detail.save({ session });

      await newDetail.save({ session });
      await applySaldoOnHoldForPendingDetail(newDetail, session);
      if (newDetail.isModified('saldo_on_hold_applied')) {
        await newDetail.save({ session });
      }
    });

    res.json({ old_detail: detail, new_detail: newDetail });
  } catch (error) {
    next(error);
  }
};

// Batch insert transaksi - menerima array of transaksi objects
export const batchCreateTransaksi = async (req: Request, res: Response, next: NextFunction) => {
    // Get active year from FiscalConfig (sekali saja)
    const fiscalConfig = await FiscalConfig.findOne({ key: 'fiscal' });
    const activeYear = fiscalConfig?.active_year ? Number(fiscalConfig.active_year) : null;
  try {
    const transaksiArray = req.body;

    // Validasi input harus berupa array
    if (!Array.isArray(transaksiArray)) {
      return res.status(400).json({ message: 'Input harus berupa array of transaksi objects' });
    }

    // Validasi array tidak kosong
    if (transaksiArray.length === 0) {
      return res.status(400).json({ message: 'Array transaksi tidak boleh kosong' });
    }

    const results = {
      success: [] as any[],
      errors: [] as any[],
      total: transaksiArray.length,
      successCount: 0,
      errorCount: 0
    };

    // Process each transaksi item
    for (let i = 0; i < transaksiArray.length; i++) {
      const item = transaksiArray[i];
      const itemIndex = i + 1;

      try {
        const {
          kategori,
          sub_kategori,
          akun,
          bulan,
          nilai,
          input_by,
          tahun_fiskal,
          tanggal,
          keterangan,
          kode_perusahaan,
          nama_perusahaan,
          kode_bank,
          no_rekening,
          is_special_transaction,
          transaction_mode,
          status_final,
        } = item;

        // Validasi required fields
        if (!kategori || !sub_kategori || !akun || !bulan || nilai === undefined) {
          results.errors.push({
            index: itemIndex,
            data: item,
            error: 'kategori, sub_kategori, akun, bulan, nilai required'
          });
          results.errorCount++;
          continue;
          // ...existing code...
        }
        if (!tanggal) {
          results.errors.push({
            index: itemIndex,
            data: item,
            error: 'tanggal (tanggal transaksi) wajib diisi'
          });
          results.errorCount++;
          continue;
        }

        // Derive tahun fiskal dari input atau dari bulan (DEC -> tahun+1; lainnya -> tahun)
        let tahunFiskal: string | undefined = tahun_fiskal;
        if (!tahunFiskal && bulan) {
          const match = String(bulan).match(/([A-Z]+)\s*-\s*(\d{2,4})$/i);
          if (match) {
            const bulanStr = match[1].toUpperCase();
            let tahunNum = match[2].length === 2 ? 2000 + parseInt(match[2]) : parseInt(match[2]);
            const bulanMap: Record<string, number> = {
              JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
              JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12
            };
            const bulanAngka = bulanMap[bulanStr] || 1;
            tahunFiskal = bulanAngka >= 12 ? (tahunNum + 1).toString() : tahunNum.toString();
          }
        }
        if (!tahunFiskal) {
          throw new Error('tahun_fiskal tidak dapat ditentukan dari bulan');
        }
        await rejectIfFiscalYearClosed(tahunFiskal);

        const transactionMode = normalizeTransactionMode(transaction_mode, is_special_transaction);
        const doc = new TtFinanceDetail({
          tanggal,
          bulan,
          kategori,
          sub_kategori,
          akun,
          nilai,
          keterangan: keterangan && String(keterangan).trim() !== '' ? String(keterangan).toUpperCase() : '-',
          created_by: input_by || 'system',
          created_at: new Date(),
          kode_perusahaan: kode_perusahaan || '',
          nama_perusahaan: nama_perusahaan || '',
          kode_bank: kode_bank && String(kode_bank).trim() !== '' ? kode_bank : '-',
          no_rekening: no_rekening && String(no_rekening).trim() !== '' ? no_rekening : '-',
          source_type: 'REKENING',
          status_final: status_final === undefined ? true : Boolean(status_final),
          tahun_fiskal: tahunFiskal,
          is_special_transaction: transactionMode === 'SPECIAL',
          transaction_mode: transactionMode,
          posting_state: 'NOT_APPLIED',
          posting_version: POSTING_VERSION,
          posted_at: '-',
          posting_error: '-',
        });

        await runMongoTransaction(async (session) => {
          await doc.save({ session });
          await applySaldoOnHoldForPendingDetail(doc, session);
          if (doc.isModified('saldo_on_hold_applied')) {
            await doc.save({ session });
          }
        });
        results.success.push({
          index: itemIndex,
          data: item,
          result: doc
        });
        results.successCount++;

      } catch (itemError) {
        results.errors.push({
          index: itemIndex,
          data: item,
          error: itemError instanceof Error ? itemError.message : 'Unknown error'
        });
        results.errorCount++;
      }
    }

    // Return summary
    const statusCode = results.errorCount === 0 ? 200 : results.errorCount === results.total ? 400 : 207; // 207 = Multi-Status

    res.status(statusCode).json({
      message: `Batch insert completed. Success: ${results.successCount}, Errors: ${results.errorCount}`,
      results
    });

  } catch (error) {
    next(error);
  }
};

export const importTtFinanceDetails = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: 'File import wajib diupload.' });

    const actor = String(req.user?.username || req.user?.email || req.user?.name || 'IMPORT');
    let rows: any[];
    try {
      rows = parseImportRows(file);
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error?.message || 'File import tidak valid.',
      });
    }

    const report = await processImportRows(rows, actor);

    return res.json({
      success: true,
      message: `Import selesai. Sukses ${report.success}, skip ${report.skipped}, gagal ${report.failed}.`,
      report,
    });
  } catch (error) {
    next(error);
  }
};

export const importTtFinanceDetailsBatch = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const startRow = Number(req.body?.startRow || 1);
    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Rows import wajib berupa array dan tidak boleh kosong.' });
    }

    const actor = String(req.user?.username || req.user?.email || req.user?.name || 'IMPORT');
    const report = await processImportRows(rows, actor, Number.isFinite(startRow) ? startRow : 1);

    return res.json({
      success: true,
      message: `Batch selesai. Sukses ${report.success}, skip ${report.skipped}, gagal ${report.failed}.`,
      report,
    });
  } catch (error) {
    next(error);
  }
};

// Get saldo rekening saat ini
export const getSaldoRekening = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { kode_bank, no_rekening } = req.query;

    if (!kode_bank || !no_rekening) {
      return res.status(400).json({ message: 'kode_bank dan no_rekening diperlukan' });
    }

    const rekening = await Rekening.findOne({
      kode_bank: kode_bank,
      no_rekening: no_rekening
    }).populate('bank_id', 'nama_bank');

    if (!rekening) {
      return res.status(404).json({ message: 'Rekening tidak ditemukan' });
    }

    res.json({
      kode_bank: rekening.kode_bank,
      no_rekening: rekening.no_rekening,
      saldo: rekening.saldo,
      saldo_on_hold: rekening.saldo_on_hold || 0,
      saldo_display: Number(rekening.saldo || 0) + Number(rekening.saldo_on_hold || 0),
      nama_rekening: rekening.nama_rekening,
      nama_bank: rekening.bank_id ? (rekening.bank_id as any).nama_bank : rekening.kode_bank
    });
  } catch (error) {
    next(error);
  }
};

// Update validator notes (hanya superuser/corsec)
export const updateValidatorNotes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as any; // diasumsikan sudah ada middleware auth, req.user terisi
    if (!user || (user.role !== 'superuser' && user.role !== 'corsec')) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    const { id, validator_notes } = req.body;
    if (!id) return res.status(400).json({ message: 'ID is required' });
    const doc = await TtFinanceDetail.findById(id);
    if (!doc) return res.status(404).json({ message: 'Transaksi detail not found' });
    const fiscalYear = deriveTahunFiskalFromDetail(doc);
    if (await isFiscalYearClosed(fiscalYear)) {
      return res.status(400).json({ message: `Tahun fiskal ${fiscalYear} sudah ditutup dan catatan validator tidak bisa diubah.` });
    }

    doc.validator_notes = validator_notes || '';
    doc.validator_notes_by = user?.username || user?.email || user?._id || '';
    doc.validator_notes_at = new Date();
    await doc.save();
    res.json({ success: true, message: 'Validator notes berhasil diperbarui', validator_notes_by: doc.validator_notes_by, validator_at: doc.validator_notes_at });
  } catch (error) {
    next(error);
  }
};

export const updateStatusFinal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as any;
    const userRole = String(user?.role || '').toLowerCase();
    if (!user || !['superuser', 'corsec', 'finance'].includes(userRole)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    const { status_final } = req.body || {};
    if (status_final === undefined) {
      return res.status(400).json({ message: 'status_final wajib diisi.' });
    }

    const doc = await TtFinanceDetail.findById(id);
    if (!doc) return res.status(404).json({ message: 'Transaksi detail not found' });
    if (doc.status_deleted === true) {
      return res.status(400).json({ message: 'Transaksi yang sudah dihapus tidak bisa diubah status finalnya.' });
    }
    if (doc.is_validated === true) {
      return res.status(400).json({ message: 'Transaksi sudah divalidasi dan status final tidak bisa diubah.' });
    }

    const fiscalYear = deriveTahunFiskalFromDetail(doc);
    if (await isFiscalYearClosed(fiscalYear)) {
      return res.status(400).json({ message: `Tahun fiskal ${fiscalYear} sudah ditutup dan status final tidak bisa diubah.` });
    }

    doc.status_final = Boolean(status_final);
    doc.updated_by = user?.username || user?.name || user?.email || user?._id || 'SYSTEM';
    doc.updated_at = new Date();
    await doc.save();

    res.json({
      success: true,
      message: doc.status_final ? 'Transaksi ditandai final.' : 'Transaksi ditandai belum final.',
      data: {
        id: doc._id,
        status_final: doc.status_final,
      },
    });
  } catch (error) {
    next(error);
  }
};
