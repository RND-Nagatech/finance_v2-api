import TtFinanceDetail from '../models/TtFinanceDetail';
import TtSummaryV2, { SummaryPeriodType } from '../models/TtSummaryV2';
import type { ClientSession } from 'mongoose';

const MONTH_MAP: Record<string, number> = {
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

const SUMMARY_SOURCE = 'tt_finance_details';
const CALCULATION_VERSION = 1;

interface ParsedBulan {
  bulan: string;
  monthName: string;
  calendarYear: number;
  calendarMonth: number;
  tahunFiskal: string;
}

export interface SummaryV2Key {
  period_type: SummaryPeriodType;
  period_start: Date;
  tahun_fiskal: number;
  bulan_fiskal?: number;
  bulan_fiskal_label?: string;
  kategori: string;
  sub_kategori: string;
  akun: string;
}

function toUtcDate(yyyy: number, mmZeroBased: number, dd: number) {
  return new Date(Date.UTC(yyyy, mmZeroBased, dd, 0, 0, 0, 0));
}

function normalizeKeyText(value: any): string {
  return String(value || '').trim();
}

export function parseFinanceBulan(bulanInput?: any): ParsedBulan | null {
  const raw = String(bulanInput || '').trim();
  const match = raw.match(/([A-Z]+)\s*-\s*(\d{2,4})$/i);
  if (!match) return null;

  const monthName = match[1].toUpperCase();
  const calendarMonth = MONTH_MAP[monthName];
  if (!calendarMonth) return null;

  const calendarYear = match[2].length === 2 ? 2000 + parseInt(match[2], 10) : parseInt(match[2], 10);
  const tahunFiskal = calendarMonth >= 12 ? String(calendarYear + 1) : String(calendarYear);

  return {
    bulan: `${monthName}-${String(calendarYear).slice(2)}`,
    monthName,
    calendarYear,
    calendarMonth,
    tahunFiskal,
  };
}

export function shouldEnterSummaryV2(detail: any): boolean {
  return Boolean(
    detail &&
    detail.is_validated === true &&
    detail.status_deleted !== true &&
    detail.transaction_mode !== 'SPECIAL' &&
    detail.is_special_transaction !== true
  );
}

export function buildSummaryKeys(detail: any): SummaryV2Key[] {
  const parsed = parseFinanceBulan(detail?.bulan);
  const tanggal = String(detail?.tanggal || '').slice(0, 10);
  const kategori = normalizeKeyText(detail?.kategori);
  const subKategori = normalizeKeyText(detail?.sub_kategori);
  const akun = normalizeKeyText(detail?.akun);

  if (!parsed || !tanggal || !kategori || !subKategori || !akun) return [];

  const dailyDate = new Date(`${tanggal}T00:00:00.000Z`);
  if (Number.isNaN(dailyDate.getTime())) return [];

  const base = {
    tahun_fiskal: Number(parsed.tahunFiskal),
    kategori,
    sub_kategori: subKategori,
    akun,
  };

  return [
    {
      ...base,
      period_type: 'DAILY',
      period_start: dailyDate,
      bulan_fiskal: parsed.calendarMonth,
      bulan_fiskal_label: parsed.bulan,
    },
    {
      ...base,
      period_type: 'MONTHLY',
      period_start: toUtcDate(parsed.calendarYear, parsed.calendarMonth - 1, 1),
      bulan_fiskal: parsed.calendarMonth,
      bulan_fiskal_label: parsed.bulan,
    },
    {
      ...base,
      period_type: 'YEARLY',
      period_start: toUtcDate(Number(parsed.tahunFiskal), 0, 1),
    },
  ];
}

function uniqueKeys(keys: SummaryV2Key[]) {
  const seen = new Set<string>();
  return keys.filter((key) => {
    const fingerprint = [
      key.period_type,
      key.period_start.toISOString(),
      String(key.tahun_fiskal),
      key.kategori,
      key.sub_kategori,
      key.akun,
    ].join('|');
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function summaryFilter(key: SummaryV2Key) {
  return {
    period_type: key.period_type,
    period_start: key.period_start,
    tahun_fiskal: { $in: [key.tahun_fiskal, String(key.tahun_fiskal)] },
    kategori: key.kategori,
    sub_kategori: key.sub_kategori,
    akun: key.akun,
  };
}

function validDetailMatchForKey(key: SummaryV2Key) {
  const match: any = {
    kategori: key.kategori,
    sub_kategori: key.sub_kategori,
    akun: key.akun,
    status_deleted: { $ne: true },
    is_validated: true,
    transaction_mode: { $ne: 'SPECIAL' },
    is_special_transaction: { $ne: true },
  };

  if (key.period_type === 'DAILY') {
    match.tanggal = key.period_start.toISOString().slice(0, 10);
  }
  if (key.period_type === 'MONTHLY') {
    match.bulan = key.bulan_fiskal_label;
  }

  return match;
}

async function calculateTotalForKey(key: SummaryV2Key, session?: ClientSession) {
  const docs = await TtFinanceDetail.find(validDetailMatchForKey(key))
    .select('bulan nilai')
    .session(session || null)
    .lean();

  let total = 0;
  let count = 0;

  for (const doc of docs as any[]) {
    const parsed = parseFinanceBulan(doc.bulan);
    if (!parsed || Number(parsed.tahunFiskal) !== key.tahun_fiskal) continue;
    total += Number(doc.nilai || 0);
    count += 1;
  }

  return { total, count };
}

function buildSummaryDocument(key: SummaryV2Key, total: number, count: number, createdAt: Date, updatedAt: Date) {
  return {
    period_type: key.period_type,
    period_start: key.period_start,
    tahun_fiskal: key.tahun_fiskal,
    ...(key.period_type !== 'YEARLY'
      ? {
          bulan_fiskal: key.bulan_fiskal,
          bulan_fiskal_label: key.bulan_fiskal_label,
        }
      : {}),
    kategori: key.kategori,
    sub_kategori: key.sub_kategori,
    akun: key.akun,
    total_nilai: total,
    transaction_count: count,
    source: SUMMARY_SOURCE,
    calculation_version: CALCULATION_VERSION,
    calculated_at: updatedAt,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export async function rebuildSummaryV2ForKey(key: SummaryV2Key, session?: ClientSession) {
  const { total, count } = await calculateTotalForKey(key, session);
  const filter = summaryFilter(key);

  if (count <= 0 || total === 0) {
    await TtSummaryV2.deleteOne(filter).session(session || null);
    return { key, total_nilai: 0, transaction_count: 0, deleted: true };
  }

  const now = new Date();
  const existing = await TtSummaryV2.findOne(filter).select('created_at').session(session || null).lean();
  const createdAt = existing?.created_at ? new Date(existing.created_at) : now;
  await TtSummaryV2.findOneAndReplace(
    filter,
    buildSummaryDocument(key, total, count, createdAt, now),
    { upsert: true, new: true, session }
  );

  return { key, total_nilai: total, transaction_count: count, deleted: false };
}

export async function rebuildSummaryV2ForDetail(detail: any, session?: ClientSession) {
  const keys = uniqueKeys(buildSummaryKeys(detail));
  const results = [];
  for (const key of keys) {
    results.push(await rebuildSummaryV2ForKey(key, session));
  }
  return results;
}

export async function rebuildSummaryV2ForDetails(details: any[], session?: ClientSession) {
  const keys = uniqueKeys(details.flatMap((detail) => buildSummaryKeys(detail)));
  const results = [];
  for (const key of keys) {
    results.push(await rebuildSummaryV2ForKey(key, session));
  }
  return results;
}

type SummaryAccumulator = SummaryV2Key & {
  total_nilai: number;
  transaction_count: number;
};

function keyFingerprint(key: SummaryV2Key) {
  return [
    key.period_type,
    key.period_start.toISOString(),
    String(key.tahun_fiskal),
    key.kategori,
    key.sub_kategori,
    key.akun,
  ].join('|');
}

function createAccumulator(key: SummaryV2Key): SummaryAccumulator {
  return {
    ...key,
    total_nilai: 0,
    transaction_count: 0,
  };
}

export async function rebuildAllSummaryV2(session?: ClientSession) {
  const validMatch = {
    is_validated: true,
    status_deleted: { $ne: true },
    transaction_mode: { $ne: 'SPECIAL' },
    is_special_transaction: { $ne: true },
  };
  const details = await TtFinanceDetail.find(validMatch)
    .select('tanggal bulan kategori sub_kategori akun nilai')
    .session(session || null)
    .lean();

  const summaryMap = new Map<string, SummaryAccumulator>();
  let skippedInvalidKey = 0;

  for (const detail of details as any[]) {
    const keys = uniqueKeys(buildSummaryKeys(detail));
    if (keys.length === 0) {
      skippedInvalidKey += 1;
      continue;
    }

    keys.forEach((key) => {
      const fingerprint = keyFingerprint(key);
      const current = summaryMap.get(fingerprint) || createAccumulator(key);
      current.total_nilai += Number(detail.nilai || 0);
      current.transaction_count += 1;
      summaryMap.set(fingerprint, current);
    });
  }

  const now = new Date();
  const summaryDocs = Array.from(summaryMap.values())
    .filter((item) => item.transaction_count > 0 && item.total_nilai !== 0)
    .map((item) => buildSummaryDocument(item, item.total_nilai, item.transaction_count, now, now));

  const beforeSummaryCount = await TtSummaryV2.countDocuments({}).session(session || null);
  await TtSummaryV2.deleteMany({}).session(session || null);
  if (summaryDocs.length > 0) {
    await TtSummaryV2.insertMany(summaryDocs, {
      session,
      ordered: true,
    });
  }

  const postingApplied = await TtFinanceDetail.updateMany(
    validMatch,
    {
      $set: {
        posting_state: 'APPLIED',
        posting_version: CALCULATION_VERSION,
        posted_at: now,
        posting_error: '-',
      },
    },
    { session }
  );

  const postingNotApplied = await TtFinanceDetail.updateMany(
    {
      $or: [
        { is_validated: { $ne: true } },
        { status_deleted: true },
        { transaction_mode: 'SPECIAL' },
        { is_special_transaction: true },
      ],
    },
    {
      $set: {
        posting_state: 'NOT_APPLIED',
        posting_version: CALCULATION_VERSION,
        posted_at: '-',
        posting_error: '-',
      },
    },
    { session }
  );

  return {
    source_detail_count: details.length,
    summary_before_count: beforeSummaryCount,
    summary_after_count: summaryDocs.length,
    daily_count: summaryDocs.filter((item) => item.period_type === 'DAILY').length,
    monthly_count: summaryDocs.filter((item) => item.period_type === 'MONTHLY').length,
    yearly_count: summaryDocs.filter((item) => item.period_type === 'YEARLY').length,
    skipped_invalid_key: skippedInvalidKey,
    posting_applied_count: postingApplied.modifiedCount,
    posting_not_applied_count: postingNotApplied.modifiedCount,
    rebuilt_at: now,
  };
}

type ReconciliationStatus =
  | 'MATCH'
  | 'MISSING_SUMMARY'
  | 'SUMMARY_GREATER_THAN_DETAIL'
  | 'DETAIL_GREATER_THAN_SUMMARY'
  | 'DUPLICATE_SUMMARY';

type ReconciliationRow = {
  period_type: SummaryPeriodType;
  period_start: string;
  tahun_fiskal: number;
  bulan_fiskal?: number;
  bulan_fiskal_label?: string;
  kategori: string;
  sub_kategori: string;
  akun: string;
  detail_total: number;
  summary_total: number;
  selisih: number;
  detail_count: number;
  summary_count: number;
  status: ReconciliationStatus;
  summary_document_count: number;
};

function parseFingerprint(fingerprint: string) {
  const [period_type, period_start, tahun_fiskal, kategori, sub_kategori, akun] = fingerprint.split('|');
  return {
    period_type: period_type as SummaryPeriodType,
    period_start,
    tahun_fiskal: Number(tahun_fiskal),
    kategori,
    sub_kategori,
    akun,
  };
}

function keyPayloadFromSummaryDoc(doc: any): SummaryV2Key {
  return {
    period_type: doc.period_type,
    period_start: new Date(doc.period_start),
    tahun_fiskal: Number(doc.tahun_fiskal),
    bulan_fiskal: doc.bulan_fiskal,
    bulan_fiskal_label: doc.bulan_fiskal_label,
    kategori: doc.kategori,
    sub_kategori: doc.sub_kategori,
    akun: doc.akun,
  };
}

function reconciliationStatus(detailTotal: number, summaryTotal: number, summaryDocumentCount: number): ReconciliationStatus {
  if (summaryDocumentCount > 1) return 'DUPLICATE_SUMMARY';
  if (summaryDocumentCount === 0 && detailTotal !== 0) return 'MISSING_SUMMARY';
  if (summaryTotal > detailTotal) return 'SUMMARY_GREATER_THAN_DETAIL';
  if (detailTotal > summaryTotal) return 'DETAIL_GREATER_THAN_SUMMARY';
  return 'MATCH';
}

export async function reconcileSummaryV2(options?: { includeMatches?: boolean; limit?: number }) {
  const includeMatches = options?.includeMatches === true;
  const limit = Math.max(1, Math.min(Number(options?.limit || 500), 5000));
  const validMatch = {
    is_validated: true,
    status_deleted: { $ne: true },
    transaction_mode: { $ne: 'SPECIAL' },
    is_special_transaction: { $ne: true },
  };

  const [details, summaries] = await Promise.all([
    TtFinanceDetail.find(validMatch).select('tanggal bulan kategori sub_kategori akun nilai').lean(),
    TtSummaryV2.find({}).select('period_type period_start tahun_fiskal bulan_fiskal bulan_fiskal_label kategori sub_kategori akun total_nilai transaction_count').lean(),
  ]);

  const expected = new Map<string, SummaryAccumulator>();
  let skippedInvalidKey = 0;
  for (const detail of details as any[]) {
    const keys = uniqueKeys(buildSummaryKeys(detail));
    if (keys.length === 0) {
      skippedInvalidKey += 1;
      continue;
    }
    keys.forEach((key) => {
      const fingerprint = keyFingerprint(key);
      const current = expected.get(fingerprint) || createAccumulator(key);
      current.total_nilai += Number(detail.nilai || 0);
      current.transaction_count += 1;
      expected.set(fingerprint, current);
    });
  }

  const actual = new Map<string, { key: SummaryV2Key; total_nilai: number; transaction_count: number; document_count: number }>();
  for (const summary of summaries as any[]) {
    const key = keyPayloadFromSummaryDoc(summary);
    const fingerprint = keyFingerprint(key);
    const current = actual.get(fingerprint) || {
      key,
      total_nilai: 0,
      transaction_count: 0,
      document_count: 0,
    };
    current.total_nilai += Number(summary.total_nilai || 0);
    current.transaction_count += Number(summary.transaction_count || 0);
    current.document_count += 1;
    actual.set(fingerprint, current);
  }

  const fingerprints = new Set([...expected.keys(), ...actual.keys()]);
  const rows: ReconciliationRow[] = [];

  fingerprints.forEach((fingerprint) => {
    const expectedRow = expected.get(fingerprint);
    const actualRow = actual.get(fingerprint);
    const key = expectedRow || actualRow?.key;
    if (!key) return;
    const detailTotal = Number(expectedRow?.total_nilai || 0);
    const summaryTotal = Number(actualRow?.total_nilai || 0);
    const status = reconciliationStatus(detailTotal, summaryTotal, actualRow?.document_count || 0);
    if (!includeMatches && status === 'MATCH') return;

    rows.push({
      ...parseFingerprint(fingerprint),
      bulan_fiskal: key.bulan_fiskal,
      bulan_fiskal_label: key.bulan_fiskal_label,
      detail_total: detailTotal,
      summary_total: summaryTotal,
      selisih: summaryTotal - detailTotal,
      detail_count: Number(expectedRow?.transaction_count || 0),
      summary_count: Number(actualRow?.transaction_count || 0),
      summary_document_count: Number(actualRow?.document_count || 0),
      status,
    });
  });

  rows.sort((a, b) => Math.abs(b.selisih) - Math.abs(a.selisih));
  const statusCounts = rows.reduce((acc: Record<string, number>, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  return {
    checked_at: new Date(),
    source_detail_count: details.length,
    summary_document_count: summaries.length,
    skipped_invalid_key: skippedInvalidKey,
    mismatch_count: rows.filter((row) => row.status !== 'MATCH').length,
    status_counts: statusCounts,
    rows: rows.slice(0, limit),
    limit,
  };
}

export function deriveTahunFiskalFromBulanV2(bulan?: any): string | undefined {
  return parseFinanceBulan(bulan)?.tahunFiskal;
}
