import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import PerjalananDinas from '../models/PerjalananDinas';
import PerjalananDinasDetail from '../models/PerjalananDinasDetail';
import PerjalananDinasDana from '../models/PerjalananDinasDana';
import Perusahaan from '../models/Perusahaan';
import Rekening from '../models/Rekening';
import Kategori from '../models/Kategori';
import SubKategori from '../models/SubKategori';
import Akun from '../models/Akun';
import TtFinanceDetail from '../models/TtFinanceDetail';
import { deriveTahunFiskalFromBulanV2 } from '../services/summaryV2Service';

type ReqUser = {
  id?: string;
  _id?: string;
  username?: string;
  name?: string;
  role?: string;
};

const OFFICE_ROLES = new Set(['admin', 'finance', 'corsec', 'superuser']);
const AUDIT_ROLES = new Set(['finance', 'corsec', 'superuser']);
const POST_ROLES = new Set(['finance', 'corsec', 'superuser']);

async function mutateRekeningForPerjalananLedger(params: {
  rekening_id: string;
  nominal: number;
  jenis: 'INJECT' | 'RETURN';
  tanggal?: Date;
  keterangan?: string;
  refId?: mongoose.Types.ObjectId;
}) {
  const rekening = await Rekening.findById(params.rekening_id);
  if (!rekening) throw httpError('Rekening tidak ditemukan', 404);
  const nominal = Math.abs(Number(params.nominal || 0));
  if (params.jenis === 'INJECT') {
    rekening.saldo = Number(rekening.saldo || 0) - nominal;
  } else {
    rekening.saldo = Number(rekening.saldo || 0) + nominal;
  }
  await rekening.save();
}

function httpError(message: string, statusCode: number) {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function getReqUser(req: Request): ReqUser {
  return ((req as any).user || {}) as ReqUser;
}

function getRole(req: Request): string {
  return String(getReqUser(req).role || 'user');
}

function getActorName(req: Request): string {
  const u = getReqUser(req);
  return String(u.name || u.username || u.id || u._id || 'system');
}

function getActorId(req: Request): string {
  const u = getReqUser(req);
  return String(u.id || u._id || u.username || '');
}

function isOfficeRole(req: Request): boolean {
  return OFFICE_ROLES.has(getRole(req));
}

function isAuditRole(req: Request): boolean {
  return AUDIT_ROLES.has(getRole(req));
}

function isPostingRole(req: Request): boolean {
  return POST_ROLES.has(getRole(req));
}

function ensureObjectId(id: string, field = 'id') {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw httpError(`${field} tidak valid`, 400);
  }
}

async function getHeaderOrThrow(id: string) {
  ensureObjectId(id, 'perjalanan_id');
  const header = await PerjalananDinas.findOne({ _id: id, status_deleted: { $ne: true } });
  if (!header) throw httpError('Perjalanan tidak ditemukan', 404);
  return header;
}

async function ensureHeaderAccess(req: Request, header: any, mode: 'read' | 'user-edit' | 'office') {
  const role = getRole(req);
  if (mode === 'office') {
    if (!isOfficeRole(req)) throw httpError('Unauthorized', 403);
    return;
  }
  if (role !== 'user') return;
  const actorId = getActorId(req);
  const actorUsername = String(getReqUser(req).username || '');
  const matchesUserId = actorId && String(header.user_id) === actorId;
  const matchesUsername = actorUsername && String(header.user_username || '') === actorUsername;
  if (!(matchesUserId || matchesUsername)) throw httpError('Unauthorized', 403);
  if (mode === 'user-edit' && !['BERJALAN', 'SEDANG_DIAUDIT'].includes(String(header.status))) {
    throw httpError('Perjalanan tidak dapat diedit', 400);
  }
}

function generateKodePerjalanan() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `PD-${stamp}-${rand}`;
}

function toYmd(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function deriveBulanLabelFromDate(dateInput: Date | string) {
  const d = typeof dateInput === 'string' ? new Date(`${dateInput}T00:00:00`) : dateInput;
  if (Number.isNaN(d.getTime())) throw httpError('Tanggal tidak valid', 400);
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${monthNames[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
}

function getRekeningBalanceDeltaForPendingDetail(doc: any): number {
  if (!doc || doc.is_validated === true || doc.status_deleted === true) return 0;
  if (String(doc.transaction_mode || '').toUpperCase() === 'FINANCE_ONLY') return 0;
  const kodeBank = String(doc.kode_bank || '').trim();
  const noRekening = String(doc.no_rekening || '').trim();
  if (!kodeBank || kodeBank === '-' || !noRekening || noRekening === '-') return 0;

  const nilai = Number(doc.nilai || 0);
  if (!Number.isFinite(nilai) || nilai === 0) return 0;
  const mutationDirection = String(doc.rekening_mutation_direction || '').toUpperCase();
  if (mutationDirection === 'IN') return nilai;
  if (mutationDirection === 'OUT') return -nilai;
  return String(doc.kategori || '').toUpperCase() === 'PENDAPATAN' ? nilai : -nilai;
}

async function applySaldoOnHoldForPendingDetail(doc: any) {
  if (!doc || doc.is_validated === true || doc.saldo_on_hold_applied === true) return false;
  const delta = getRekeningBalanceDeltaForPendingDetail(doc);
  if (delta === 0) return false;
  const result = await Rekening.updateOne(
    { kode_bank: doc.kode_bank, no_rekening: doc.no_rekening },
    { $inc: { saldo_on_hold: delta } }
  );
  if (result.matchedCount < 1) return false;
  doc.saldo_on_hold_applied = true;
  await doc.save();
  return true;
}

async function createInjectFinanceDetailDraft(params: {
  header: any;
  nominal: number;
  kategori: string;
  sub_kategori: string;
  akun: string;
  tanggal?: string;
  keterangan?: string;
  kode_perusahaan?: string;
  nama_perusahaan?: string;
  kode_bank?: string;
  no_rekening?: string;
  actor: string;
  now?: Date;
}) {
  const now = params.now || new Date();
  const tanggal = params.tanggal ? String(params.tanggal) : toYmd(now);
  const bulan = deriveBulanLabelFromDate(tanggal);
  const tahun_fiskal = deriveTahunFiskalFromBulanV2(bulan);
  if (!tahun_fiskal) throw httpError('Gagal menentukan tahun fiskal inject', 400);

  const detail = await TtFinanceDetail.create({
    tanggal,
    bulan,
    tahun_fiskal,
    kategori: params.kategori,
    sub_kategori: params.sub_kategori,
    akun: params.akun,
    nilai: Number(params.nominal),
    keterangan: (params.keterangan && String(params.keterangan).trim() !== ''
      ? String(params.keterangan)
      : `INJECT DANA PERJALANAN ${params.header.kode_perjalanan} - ${params.header.tujuan} - ${params.header.user_name}`
    ).toUpperCase(),
    created_by: params.actor,
    created_at: now,
    is_validated: false,
    kode_perusahaan: params.kode_perusahaan || '',
    nama_perusahaan: params.nama_perusahaan || '',
    kode_bank: params.kode_bank || '-',
    no_rekening: params.no_rekening || '-',
    perjalanan_dinas_id: params.header?._id,
    attachments: [],
  } as any);

  return { detail, tanggal, bulan, tahun_fiskal };
}

async function createRealisasiFinanceDetailDraft(params: {
  header: any;
  nominal: number;
  kategori?: string;
  sub_kategori?: string;
  akun?: string;
  actor: string;
  tanggal?: string;
  keterangan?: string;
  kode_perusahaan?: string;
  nama_perusahaan?: string;
  kode_bank?: string;
  no_rekening?: string;
  now?: Date;
}) {
  const now = params.now || new Date();
  const tanggal = params.tanggal ? String(params.tanggal) : toYmd(now);
  const bulan = deriveBulanLabelFromDate(tanggal);
  const tahun_fiskal = deriveTahunFiskalFromBulanV2(bulan);
  if (!tahun_fiskal) throw httpError('Gagal menentukan tahun fiskal realisasi', 400);

  const detail = await TtFinanceDetail.create({
    tanggal,
    bulan,
    tahun_fiskal,
    kategori: params.kategori || 'BIAYA',
    sub_kategori: params.sub_kategori || 'LAIN LAIN',
    akun: params.akun || 'REALISASI',
    nilai: Number(params.nominal),
    keterangan: (params.keterangan && String(params.keterangan).trim() !== ''
      ? String(params.keterangan)
      : `REALISASI DANA PERJALANAN ${params.header.kode_perjalanan} - ${params.header.tujuan} - ${params.header.user_name}`
    ).toUpperCase(),
    created_by: params.actor,
    created_at: now,
    is_validated: false,
    kode_perusahaan: params.kode_perusahaan || '',
    nama_perusahaan: params.nama_perusahaan || '',
    kode_bank: params.kode_bank || '-',
    no_rekening: params.no_rekening || '-',
    perjalanan_dinas_id: params.header?._id,
    attachments: [],
  } as any);

  return { detail, tanggal, bulan, tahun_fiskal };
}

type PostingTargetResolved = {
  kategori: string;
  sub_kategori: string;
  akun: string;
  perusahaan_id: string;
  rekening_id: string;
  kode_perusahaan: string;
  nama_perusahaan: string;
  kode_bank: string;
  no_rekening: string;
  tanggal_posting?: string;
};

async function resolvePostingTargetFromPayload(payload: any): Promise<PostingTargetResolved> {
  const kategori = String(payload?.kategori || '').trim();
  const sub_kategori = String(payload?.sub_kategori || '').trim();
  const akun = String(payload?.akun || '').trim();
  const perusahaan_id = String(payload?.perusahaan_id || '').trim();
  const rekening_id = String(payload?.rekening_id || '').trim();
  const tanggal_posting = String(payload?.tanggal_posting || '').trim();

  if (!perusahaan_id || !rekening_id || !kategori || !sub_kategori || !akun) {
    throw httpError('perusahaan_id, rekening_id, kategori, sub_kategori, akun wajib diisi', 400);
  }
  ensureObjectId(perusahaan_id, 'perusahaan_id');
  ensureObjectId(rekening_id, 'rekening_id');

  const [perusahaan, rekening, kategoriDoc, subKategoriDoc, akunDoc] = await Promise.all([
    Perusahaan.findById(perusahaan_id),
    Rekening.findById(rekening_id),
    Kategori.findOne({ kategori, status_aktv: { $ne: false } }),
    SubKategori.findOne({ sub_kategori, kategori, status_aktv: { $ne: false } }),
    Akun.findOne({ akun, sub_kategori, kategori, status_aktv: { $ne: false } }),
  ]);

  if (!perusahaan) throw httpError('Perusahaan tidak ditemukan', 400);
  if (!rekening) throw httpError('Rekening tidak ditemukan', 400);
  if (!kategoriDoc) throw httpError('Kategori tidak ditemukan atau tidak aktif', 400);
  if (!subKategoriDoc) throw httpError('Sub kategori tidak ditemukan atau tidak sesuai kategori', 400);
  if (!akunDoc) throw httpError('Akun tidak ditemukan atau tidak sesuai kategori/sub kategori', 400);

  return {
    kategori,
    sub_kategori,
    akun,
    perusahaan_id,
    rekening_id,
    kode_perusahaan: String((perusahaan as any).kode_perusahaan || ''),
    nama_perusahaan: String((perusahaan as any).nama_perusahaan || ''),
    kode_bank: String((rekening as any).kode_bank || ''),
    no_rekening: String((rekening as any).no_rekening || ''),
    tanggal_posting: tanggal_posting || undefined,
  };
}

function ensureTransaksiUploadDir() {
  const dir = path.join(process.cwd(), 'uploads', 'transaksi');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveUploadPathToDisk(uploadPath: string) {
  const normalized = String(uploadPath || '').replace(/\\/g, '/');
  if (!normalized.startsWith('/uploads/')) return null;
  const rel = normalized.replace(/^\/+/, '');
  return path.join(process.cwd(), rel);
}

function uniqueTransaksiAttachmentFilename(sourcePath: string) {
  const ext = path.extname(sourcePath) || '.bin';
  const base = path.basename(sourcePath, ext).replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 30) || 'lampiran';
  return `${base}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
}

async function mergePerjalananAttachmentsIntoTransaksi(perjalananId: string) {
  const [items, danaRows] = await Promise.all([
    PerjalananDinasDetail.find({ perjalanan_id: perjalananId, status_deleted: { $ne: true } }).lean(),
    PerjalananDinasDana.find({ perjalanan_id: perjalananId, voided: { $ne: true } }).lean(),
  ]);

  const itemAttachments = items.flatMap((it: any) => (it.attachments || []).map((a: any) => ({ ...a, source: 'item' as const })));
  const danaAttachments = danaRows.flatMap((d: any) => (d.attachments || []).map((a: any) => ({ ...a, source: (d.jenis || 'DANA').toLowerCase() as any })));
  const all = [...itemAttachments, ...danaAttachments];

  const transaksiDir = ensureTransaksiUploadDir();
  const seenSource = new Set<string>();
  const attachmentsForTransaksi: Array<{ path: string }> = [];
  let skippedMissing = 0;

  for (const att of all) {
    const srcPath = String(att?.path || '');
    if (!srcPath || seenSource.has(srcPath)) continue;
    seenSource.add(srcPath);
    const diskSrc = resolveUploadPathToDisk(srcPath);
    if (!diskSrc || !fs.existsSync(diskSrc)) {
      skippedMissing += 1;
      continue;
    }
    const destFilename = uniqueTransaksiAttachmentFilename(srcPath);
    const diskDest = path.join(transaksiDir, destFilename);
    fs.copyFileSync(diskSrc, diskDest);
    attachmentsForTransaksi.push({ path: `/uploads/transaksi/${destFilename}` });
  }

  return {
    attachments: attachmentsForTransaksi,
    counts: {
      item: itemAttachments.length,
      inject: danaRows.filter((d: any) => d.jenis === 'INJECT').reduce((sum: number, d: any) => sum + ((d.attachments || []).length || 0), 0),
      return: danaRows.filter((d: any) => d.jenis === 'RETURN').reduce((sum: number, d: any) => sum + ((d.attachments || []).length || 0), 0),
      merged: attachmentsForTransaksi.length,
      skipped_missing: skippedMissing,
    },
  };
}

async function mergePerjalananItemAttachmentsIntoTransaksi(perjalananId: string) {
  const items = await PerjalananDinasDetail.find({ perjalanan_id: perjalananId, status_deleted: { $ne: true } }).lean();
  const itemAttachments = items.flatMap((it: any) => (it.attachments || []).map((a: any) => ({ ...a, source: 'item' as const })));

  const transaksiDir = ensureTransaksiUploadDir();
  const seenSource = new Set<string>();
  const attachmentsForTransaksi: Array<{ path: string }> = [];
  let skippedMissing = 0;

  for (const att of itemAttachments) {
    const srcPath = String(att?.path || '');
    if (!srcPath || seenSource.has(srcPath)) continue;
    seenSource.add(srcPath);
    const diskSrc = resolveUploadPathToDisk(srcPath);
    if (!diskSrc || !fs.existsSync(diskSrc)) {
      skippedMissing += 1;
      continue;
    }
    const destFilename = uniqueTransaksiAttachmentFilename(srcPath);
    const diskDest = path.join(transaksiDir, destFilename);
    fs.copyFileSync(diskSrc, diskDest);
    attachmentsForTransaksi.push({ path: `/uploads/transaksi/${destFilename}` });
  }

  return {
    attachments: attachmentsForTransaksi,
    counts: {
      item: itemAttachments.length,
      merged: attachmentsForTransaksi.length,
      skipped_missing: skippedMissing,
    },
  };
}

async function computePerjalananSummary(perjalananId: string) {
  const [injectAgg, returnAgg, approvedAgg, transaksiAgg, itemStats] = await Promise.all([
    PerjalananDinasDana.aggregate([
      { $match: { perjalanan_id: new mongoose.Types.ObjectId(perjalananId), jenis: 'INJECT', voided: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$nominal' } } },
    ]),
    PerjalananDinasDana.aggregate([
      { $match: { perjalanan_id: new mongoose.Types.ObjectId(perjalananId), jenis: 'RETURN', voided: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$nominal' } } },
    ]),
    PerjalananDinasDetail.aggregate([
      { $match: { perjalanan_id: new mongoose.Types.ObjectId(perjalananId), status_deleted: { $ne: true }, audit_status: 'APPROVED' } },
      { $group: { _id: null, total: { $sum: '$nominal' } } },
    ]),
    PerjalananDinasDetail.aggregate([
      { $match: { perjalanan_id: new mongoose.Types.ObjectId(perjalananId), status_deleted: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$nominal' } } },
    ]),
    PerjalananDinasDetail.aggregate([
      { $match: { perjalanan_id: new mongoose.Types.ObjectId(perjalananId), status_deleted: { $ne: true } } },
      { $group: { _id: '$audit_status', count: { $sum: 1 } } },
    ]),
  ]);

  const total_inject = injectAgg[0]?.total || 0;
  const total_return = returnAgg[0]?.total || 0;
  const total_approved = approvedAgg[0]?.total || 0;
  const total_transaksi = transaksiAgg[0]?.total || 0;
  // Sisa dana perjalanan harus berkurang saat transaksi dibuat (bukan menunggu audit approve)
  const sisa_dana = total_inject - total_return - total_transaksi;

  const counts = itemStats.reduce<Record<string, number>>((acc, row: any) => {
    acc[String(row._id)] = row.count || 0;
    return acc;
  }, {});

  return {
    total_inject,
    total_return,
    total_approved,
    total_transaksi,
    sisa_dana,
    item_counts: {
      PENDING: counts.PENDING || 0,
      APPROVED: counts.APPROVED || 0,
      REVISI: counts.REVISI || 0,
    },
    total_items: (counts.PENDING || 0) + (counts.APPROVED || 0) + (counts.REVISI || 0),
  };
}

async function syncHeaderSummary(headerId: string) {
  const summary = await computePerjalananSummary(headerId);
  await PerjalananDinas.findByIdAndUpdate(headerId, {
    total_inject: summary.total_inject,
    total_return: summary.total_return,
    total_approved: summary.total_approved,
    sisa_dana: summary.sisa_dana,
  });
  return summary;
}

function canUserEditItem(headerStatus: string, _itemAuditStatus: string) {
  // Setelah user submit perjalanan ke audit, user tidak boleh edit lagi.
  return headerStatus === 'BERJALAN';
}

export const listPerjalananDinas = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, user_id, from, to, q, page = '1', limit = '10' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit || '10', 10) || 10));
    const filter: any = { status_deleted: { $ne: true } };

    if (status && status !== 'ALL') filter.status = status;
    if (user_id && user_id !== 'ALL') filter.user_id = user_id;
    if (from || to) {
      filter.tanggal_berangkat = {};
      if (from) filter.tanggal_berangkat.$gte = from;
      if (to) filter.tanggal_berangkat.$lte = to;
    }
    if (q && q.trim()) {
      const rx = new RegExp(q.trim(), 'i');
      filter.$or = [{ kode_perjalanan: rx }, { tujuan: rx }, { user_name: rx }, { catatan: rx }];
    }

    if (getRole(req) === 'user') {
      const actorId = getActorId(req);
      const actorUsername = String(getReqUser(req).username || '');
      const userScopeOr: any[] = [
        ...(actorId ? [{ user_id: actorId }] : []),
        ...(actorUsername ? [{ user_username: actorUsername }] : []),
      ];
      if (userScopeOr.length === 0) {
        return res.status(403).json({ message: 'Unauthorized' });
      }
      filter.$and = filter.$and || [];
      filter.$and.push({ $or: userScopeOr });
    }

    const total = await PerjalananDinas.countDocuments(filter);
    const rows = await PerjalananDinas.find(filter)
      .sort({ tanggal_berangkat: -1, created_at: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const data = await Promise.all(
      rows.map(async (row: any) => ({
        ...row,
        summary: await computePerjalananSummary(String(row._id)),
      }))
    );

    res.json({ data, page: pageNum, total, totalPages: Math.max(1, Math.ceil(total / limitNum)) });
  } catch (error) {
    next(error);
  }
};

export const createPerjalananDinas = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isOfficeRole(req)) return res.status(403).json({ message: 'Unauthorized' });
    const { user_id, user_name, user_username, tujuan, tanggal_berangkat, tanggal_pulang, catatan } = req.body || {};
    if (!user_id || !user_name || !tujuan || !tanggal_berangkat || !tanggal_pulang) {
      return res.status(400).json({ message: 'user_id, user_name, tujuan, tanggal_berangkat, tanggal_pulang wajib diisi' });
    }

    let kode_perjalanan = generateKodePerjalanan();
    while (await PerjalananDinas.exists({ kode_perjalanan })) {
      kode_perjalanan = generateKodePerjalanan();
    }

    const doc = await PerjalananDinas.create({
      kode_perjalanan,
      user_id: String(user_id),
      user_name: String(user_name),
      user_username: user_username ? String(user_username) : undefined,
      tujuan: String(tujuan),
      tanggal_berangkat: String(tanggal_berangkat),
      tanggal_pulang: String(tanggal_pulang),
      catatan: catatan ? String(catatan) : '',
      status: 'BERJALAN',
      created_by: getActorName(req),
      created_at: new Date(),
    });
    res.status(201).json(doc);
  } catch (error) {
    next(error);
  }
};

export const getPerjalananDinasDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = await getHeaderOrThrow(req.params.id);
    await ensureHeaderAccess(req, header, 'read');
    const summary = await syncHeaderSummary(String(header._id));
    res.json({ header: await PerjalananDinas.findById(header._id), summary });
  } catch (error) {
    next(error);
  }
};

export const updatePerjalananDinas = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isOfficeRole(req)) return res.status(403).json({ message: 'Unauthorized' });
    const header = await getHeaderOrThrow(req.params.id);
    if (String(header.status) === 'SELESAI') {
      return res.status(400).json({ message: 'Perjalanan selesai tidak dapat diedit' });
    }
    const allowed = ['tujuan', 'tanggal_berangkat', 'tanggal_pulang', 'catatan', 'user_id', 'user_name', 'user_username'] as const;
    for (const key of allowed) {
      if (req.body[key] !== undefined) (header as any)[key] = req.body[key];
    }
    header.updated_by = getActorName(req);
    header.updated_at = new Date();
    await header.save();
    res.json(header);
  } catch (error) {
    next(error);
  }
};

export const submitPerjalananAudit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = await getHeaderOrThrow(req.params.id);
    await ensureHeaderAccess(req, header, 'user-edit');
    if (String(header.status) !== 'BERJALAN') {
      return res.status(400).json({ message: 'Hanya perjalanan BERJALAN yang bisa disubmit ke audit' });
    }
    const itemCount = await PerjalananDinasDetail.countDocuments({ perjalanan_id: header._id, status_deleted: { $ne: true } });
    if (itemCount < 1) return res.status(400).json({ message: 'Minimal 1 transaksi item diperlukan' });
    header.status = 'SEDANG_DIAUDIT';
    header.updated_by = getActorName(req);
    header.updated_at = new Date();
    await header.save();
    res.json({ success: true, header });
  } catch (error) {
    next(error);
  }
};

export const finalizePerjalananAudit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isAuditRole(req)) return res.status(403).json({ message: 'Unauthorized' });
    const header = await getHeaderOrThrow(req.params.id);
    if (String(header.status) !== 'SEDANG_DIAUDIT') {
      return res.status(400).json({ message: 'Status perjalanan harus SEDANG_DIAUDIT' });
    }
    if (req.body?.audit_catatan_header !== undefined) {
      header.audit_catatan_header = String(req.body.audit_catatan_header || '');
    }
    const summary = await syncHeaderSummary(String(header._id));
    if (summary.total_items < 1) return res.status(400).json({ message: 'Minimal 1 item aktif diperlukan' });
    if (summary.item_counts.PENDING > 0 || summary.item_counts.REVISI > 0) {
      return res.status(400).json({ message: 'Semua item harus APPROVED sebelum finalisasi' });
    }
    header.status = 'SELESAI';
    header.audit_by = getActorName(req);
    header.audit_at = new Date();
    header.selesai_by = getActorName(req);
    header.selesai_at = new Date();
    header.updated_by = getActorName(req);
    header.updated_at = new Date();
    await header.save();
    res.json({ success: true, header, summary });
  } catch (error) {
    next(error);
  }
};

export const getPerjalananSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = await getHeaderOrThrow(req.params.id);
    await ensureHeaderAccess(req, header, 'read');
    const summary = await syncHeaderSummary(String(header._id));
    res.json(summary);
  } catch (error) {
    next(error);
  }
};

export const listPerjalananItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = await getHeaderOrThrow(req.params.id);
    await ensureHeaderAccess(req, header, 'read');
    const { audit_status } = req.query as Record<string, string>;
    const filter: any = { perjalanan_id: header._id, status_deleted: { $ne: true } };
    if (audit_status && audit_status !== 'ALL') filter.audit_status = audit_status;
    const items = await PerjalananDinasDetail.find(filter).sort({ tanggal_transaksi: 1, created_at: 1 });
    res.json(items);
  } catch (error) {
    next(error);
  }
};

export const createPerjalananItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = await getHeaderOrThrow(req.params.id);
    await ensureHeaderAccess(req, header, getRole(req) === 'user' ? 'user-edit' : 'read');
    if (getRole(req) !== 'user' && !isOfficeRole(req)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    if (String(header.status) !== 'BERJALAN') {
      return res.status(400).json({ message: 'Tambah item hanya saat status BERJALAN' });
    }

    const { tanggal_transaksi, nominal, keterangan } = req.body || {};
    if (!tanggal_transaksi || nominal === undefined || !keterangan) {
      return res.status(400).json({ message: 'tanggal_transaksi, nominal, keterangan wajib diisi' });
    }

    const item = await PerjalananDinasDetail.create({
      perjalanan_id: header._id,
      user_id: header.user_id,
      user_username: (header as any).user_username || '',
      user_name: header.user_name,
      tanggal_transaksi: String(tanggal_transaksi),
      nominal: Number(nominal),
      keterangan: String(keterangan),
      audit_status: 'PENDING',
      created_by: getActorName(req),
      created_at: new Date(),
      attachments: [],
    });

    await syncHeaderSummary(String(header._id));
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
};

export const updatePerjalananItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureObjectId(req.params.itemId, 'itemId');
    const header = await getHeaderOrThrow(req.params.id);
    const item = await PerjalananDinasDetail.findOne({ _id: req.params.itemId, perjalanan_id: header._id, status_deleted: { $ne: true } });
    if (!item) return res.status(404).json({ message: 'Item tidak ditemukan' });

    if (getRole(req) === 'user') {
      await ensureHeaderAccess(req, header, 'user-edit');
      if (!canUserEditItem(String(header.status), String(item.audit_status))) {
        return res.status(400).json({ message: 'Item tidak dapat diedit pada status saat ini' });
      }
    } else if (!isOfficeRole(req)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (req.body.tanggal_transaksi !== undefined) item.tanggal_transaksi = String(req.body.tanggal_transaksi);
    if (req.body.nominal !== undefined) item.nominal = Number(req.body.nominal);
    if (req.body.keterangan !== undefined) item.keterangan = String(req.body.keterangan);

    // Auditor dapat melakukan adjustment item langsung saat audit tanpa meminta revisi user.
    // Jika item diubah saat audit, kembalikan ke PENDING agar perlu review/approve ulang.
    if (isAuditRole(req) && String(header.status) === 'SEDANG_DIAUDIT') {
      item.audit_status = 'PENDING';
    }

    item.updated_by = getActorName(req);
    item.updated_at = new Date();
    await item.save();
    await syncHeaderSummary(String(header._id));
    res.json(item);
  } catch (error) {
    next(error);
  }
};

export const deletePerjalananItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureObjectId(req.params.itemId, 'itemId');
    const header = await getHeaderOrThrow(req.params.id);
    const item = await PerjalananDinasDetail.findOne({ _id: req.params.itemId, perjalanan_id: header._id, status_deleted: { $ne: true } });
    if (!item) return res.status(404).json({ message: 'Item tidak ditemukan' });

    if (getRole(req) === 'user') {
      await ensureHeaderAccess(req, header, 'user-edit');
      if (!canUserEditItem(String(header.status), String(item.audit_status))) {
        return res.status(400).json({ message: 'Item tidak dapat dihapus pada status saat ini' });
      }
    } else if (!isOfficeRole(req)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    item.status_deleted = true;
    item.deleted_by = getActorName(req);
    item.deleted_at = new Date();
    await item.save();
    await syncHeaderSummary(String(header._id));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const uploadPerjalananItemAttachments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureObjectId(req.params.itemId, 'itemId');
    const header = await getHeaderOrThrow(req.params.id);
    const item = await PerjalananDinasDetail.findOne({ _id: req.params.itemId, perjalanan_id: header._id, status_deleted: { $ne: true } });
    if (!item) return res.status(404).json({ message: 'Item tidak ditemukan' });
    const role = getRole(req);
    if (role === 'user') {
      await ensureHeaderAccess(req, header, 'user-edit');
      if (!canUserEditItem(String(header.status), String(item.audit_status))) {
        return res.status(400).json({ message: 'Item tidak dapat diupload bukti pada status saat ini' });
      }
    } else if (!isOfficeRole(req)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const files = (req.files || []) as Express.Multer.File[];
    if (!files.length) return res.status(400).json({ message: 'No files uploaded' });

    const attachments = files.map((file) => ({
      path: `/uploads/perjalanan-dinas/${file.filename}`,
      original_name: file.originalname,
      mime_type: file.mimetype,
      size: file.size,
    }));
    item.attachments = [...(item.attachments || []), ...(attachments as any)];
    item.updated_by = getActorName(req);
    item.updated_at = new Date();
    await item.save();
    res.json({ success: true, attachments: item.attachments });
  } catch (error) {
    next(error);
  }
};

export const deletePerjalananItemAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureObjectId(req.params.itemId, 'itemId');
    const { filename } = req.params;
    const header = await getHeaderOrThrow(req.params.id);
    const item = await PerjalananDinasDetail.findOne({ _id: req.params.itemId, perjalanan_id: header._id, status_deleted: { $ne: true } });
    if (!item) return res.status(404).json({ message: 'Item tidak ditemukan' });
    if (getRole(req) === 'user') {
      await ensureHeaderAccess(req, header, 'user-edit');
      if (!canUserEditItem(String(header.status), String(item.audit_status))) {
        return res.status(400).json({ message: 'Item tidak dapat diubah pada status saat ini' });
      }
    } else if (!isOfficeRole(req)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    item.attachments = (item.attachments || []).filter((att) => !att.path.includes(filename));
    item.updated_by = getActorName(req);
    item.updated_at = new Date();
    await item.save();

    const diskPath = path.join(process.cwd(), 'uploads', 'perjalanan-dinas', filename);
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    res.json({ success: true, attachments: item.attachments });
  } catch (error) {
    next(error);
  }
};

export const updatePerjalananItemAuditStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isAuditRole(req)) return res.status(403).json({ message: 'Unauthorized' });
    ensureObjectId(req.params.itemId, 'itemId');
    const header = await getHeaderOrThrow(req.params.id);
    if (String(header.status) !== 'SEDANG_DIAUDIT') {
      return res.status(400).json({ message: 'Audit item hanya saat status SEDANG_DIAUDIT' });
    }
    const item = await PerjalananDinasDetail.findOne({ _id: req.params.itemId, perjalanan_id: header._id, status_deleted: { $ne: true } });
    if (!item) return res.status(404).json({ message: 'Item tidak ditemukan' });

    const { audit_status, audit_catatan_item } = req.body || {};
    if (!['PENDING', 'APPROVED', 'REVISI'].includes(String(audit_status))) {
      return res.status(400).json({ message: 'audit_status tidak valid' });
    }
    item.audit_status = String(audit_status) as any;
    item.audit_catatan_item = audit_catatan_item ? String(audit_catatan_item) : '';
    item.audit_by = getActorName(req);
    item.audit_at = new Date();
    item.updated_by = getActorName(req);
    item.updated_at = new Date();
    await item.save();

    const summary = await syncHeaderSummary(String(header._id));
    res.json({ success: true, item, summary });
  } catch (error) {
    next(error);
  }
};

export const listPerjalananDana = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = await getHeaderOrThrow(req.params.id);
    await ensureHeaderAccess(req, header, 'read');
    const rows = await PerjalananDinasDana.find({ perjalanan_id: header._id, voided: { $ne: true } }).sort({ created_at: -1 });
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

async function createDanaLedger(req: Request, res: Response, jenis: 'INJECT' | 'RETURN') {
  if (!isOfficeRole(req)) return res.status(403).json({ message: 'Unauthorized' });
  const header = await getHeaderOrThrow(req.params.id);
  if (jenis === 'INJECT' && String(header.status) !== 'BERJALAN') {
    return res.status(400).json({ message: 'Inject hanya bisa saat status BERJALAN' });
  }
  if (jenis === 'RETURN' && !['SEDANG_DIAUDIT', 'SELESAI'].includes(String(header.status))) {
    return res.status(400).json({ message: 'Return hanya bisa saat status SEDANG_DIAUDIT atau SELESAI' });
  }

  const { nominal, rekening_id, keterangan, kategori, sub_kategori, akun, tanggal, perusahaan_id } = req.body || {};
  if (!nominal || !rekening_id) {
    return res.status(400).json({ message: 'nominal dan rekening_id wajib diisi' });
  }
  if (!tanggal) {
    return res.status(400).json({ message: 'tanggal wajib diisi' });
  }
  if (jenis === 'INJECT' && (!kategori || !sub_kategori || !akun)) {
    return res.status(400).json({ message: 'kategori, sub_kategori, akun wajib diisi untuk inject dana' });
  }
  if (jenis === 'INJECT' && !perusahaan_id) {
    return res.status(400).json({ message: 'perusahaan wajib dipilih untuk inject dana' });
  }
  const actionDate = new Date(`${String(tanggal)}T00:00:00`);
  if (Number.isNaN(actionDate.getTime())) {
    return res.status(400).json({ message: 'tanggal tidak valid' });
  }
  ensureObjectId(String(rekening_id), 'rekening_id');
  const rekening = await Rekening.findById(rekening_id);
  if (!rekening) return res.status(404).json({ message: 'Rekening tidak ditemukan' });
  let perusahaan: any = null;
  if (jenis === 'INJECT') {
    ensureObjectId(String(perusahaan_id), 'perusahaan_id');
    perusahaan = await Perusahaan.findById(String(perusahaan_id));
    if (!perusahaan) return res.status(404).json({ message: 'Perusahaan tidak ditemukan' });
  }

  const summaryBefore = await syncHeaderSummary(String(header._id));
  if (jenis === 'RETURN') {
    if (header.return_done) return res.status(400).json({ message: 'Return sudah pernah dilakukan' });
    const expected = Math.max(summaryBefore.sisa_dana, 0);
    if (expected <= 0) return res.status(400).json({ message: 'Tidak ada sisa dana untuk direturn' });
    if (Number(nominal) !== Number(expected)) {
      return res.status(400).json({ message: `Nominal return harus sama dengan sisa dana (${expected})` });
    }
  }

  const now = actionDate;
  const ledger = await PerjalananDinasDana.create({
    perjalanan_id: header._id,
    jenis,
    nominal: Number(nominal),
    rekening_id: rekening._id,
    kode_bank: rekening.kode_bank,
    no_rekening: rekening.no_rekening,
    nama_rekening_snapshot: rekening.nama_rekening,
    keterangan: keterangan ? String(keterangan) : '',
    attachments: [],
    created_by: getActorName(req),
    created_at: now,
    voided: false,
  });

  let injectDetail: any = null;
  if (jenis === 'INJECT') {
    try {
      const created = await createInjectFinanceDetailDraft({
        header,
        nominal: Number(nominal),
        kategori: String(kategori),
        sub_kategori: String(sub_kategori),
        akun: String(akun),
        tanggal: String(tanggal),
        keterangan: keterangan ? String(keterangan) : '',
        kode_perusahaan: perusahaan?.kode_perusahaan || '',
        nama_perusahaan: perusahaan?.nama_perusahaan || '',
        kode_bank: rekening.kode_bank || '-',
        no_rekening: rekening.no_rekening || '-',
        actor: getActorName(req),
        now,
      });
      injectDetail = created.detail;
      (ledger as any).tt_finance_detail_id = injectDetail._id;
      (ledger as any).transaksi_snapshot = {
        kategori: String(kategori),
        sub_kategori: String(sub_kategori),
        akun: String(akun),
        tanggal: created.tanggal,
        bulan: created.bulan,
        tahun_fiskal: created.tahun_fiskal,
      };
      await ledger.save();
      await applySaldoOnHoldForPendingDetail(injectDetail);
    } catch (err) {
      await PerjalananDinasDana.findByIdAndDelete(ledger._id);
      throw err;
    }
  }

  // Inject dana tidak boleh memutasi saldo rekening agar tidak double dengan validasi transaksi finance.
  if (jenis === 'RETURN') {
    try {
      await mutateRekeningForPerjalananLedger({
        rekening_id: String(rekening._id),
        nominal: Number(nominal),
        jenis,
        tanggal: actionDate,
        keterangan: `[PERJALANAN ${jenis}] ${header.kode_perjalanan} - ${header.tujuan} - ${header.user_name}`,
        refId: ledger._id as mongoose.Types.ObjectId,
      });
    } catch (err) {
      if (injectDetail?._id) await TtFinanceDetail.findByIdAndDelete(injectDetail._id);
      await PerjalananDinasDana.findByIdAndDelete(ledger._id);
      throw err;
    }
  }

  if (jenis === 'RETURN') {
    header.return_done = true;
    header.return_meta = {
      ledger_dana_id: ledger._id as mongoose.Types.ObjectId,
      return_amount: Number(nominal),
      return_at: actionDate,
      return_by: getActorName(req),
    };
    header.updated_by = getActorName(req);
    header.updated_at = new Date();
    await header.save();
  }

  const summary = await syncHeaderSummary(String(header._id));
  res.status(201).json({ ledger: await PerjalananDinasDana.findById(ledger._id), summary, tt_finance_detail_id: injectDetail?._id });
}

export const injectPerjalananDana = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await createDanaLedger(req, res, 'INJECT');
  } catch (error) {
    next(error);
  }
};

export const returnPerjalananDana = async (req: Request, res: Response, next: NextFunction) => {
  try {
    return res.status(410).json({ message: 'Fitur return dana dinonaktifkan. Gunakan flow posting transaksi.' });
  } catch (error) {
    next(error);
  }
};

export const uploadPerjalananDanaAttachments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isOfficeRole(req)) return res.status(403).json({ message: 'Unauthorized' });
    ensureObjectId(req.params.ledgerId, 'ledgerId');
    const header = await getHeaderOrThrow(req.params.id);
    const ledger = await PerjalananDinasDana.findOne({ _id: req.params.ledgerId, perjalanan_id: header._id, voided: { $ne: true } });
    if (!ledger) return res.status(404).json({ message: 'Ledger dana tidak ditemukan' });

    if (ledger.jenis === 'INJECT' && String(header.status) !== 'BERJALAN') {
      return res.status(400).json({ message: 'Attachment inject hanya dapat diupload saat status BERJALAN' });
    }
    if (ledger.jenis === 'RETURN' && !['SEDANG_DIAUDIT', 'SELESAI'].includes(String(header.status))) {
      return res.status(400).json({ message: 'Attachment return hanya dapat diupload saat status SEDANG_DIAUDIT atau SELESAI' });
    }

    const files = (req.files || []) as Express.Multer.File[];
    if (!files.length) return res.status(400).json({ message: 'No files uploaded' });

    const attachments = files.map((file) => ({
      path: `/uploads/perjalanan-dinas/${file.filename}`,
      original_name: file.originalname,
      mime_type: file.mimetype,
      size: file.size,
    }));
    (ledger as any).attachments = [...((ledger as any).attachments || []), ...attachments];
    await ledger.save();

    // Sinkronkan attachment inject langsung ke transaksi draft yang dibuat saat inject.
    if (String(ledger.jenis) === 'INJECT' && (ledger as any).tt_finance_detail_id) {
      const transaksi = await TtFinanceDetail.findById((ledger as any).tt_finance_detail_id);
      if (transaksi) {
        const transaksiDir = ensureTransaksiUploadDir();
        const copiedAttachments: Array<{ path: string }> = [];
        for (const att of attachments) {
          const src = resolveUploadPathToDisk(att.path);
          if (!src || !fs.existsSync(src)) continue;
          const filename = uniqueTransaksiAttachmentFilename(att.path);
          const dest = path.join(transaksiDir, filename);
          fs.copyFileSync(src, dest);
          copiedAttachments.push({ path: `/uploads/transaksi/${filename}` });
        }
        transaksi.attachments = [...(transaksi.attachments || []), ...copiedAttachments];
        transaksi.updated_by = getActorName(req);
        transaksi.updated_at = new Date();
        await transaksi.save();
      }
    }

    res.json({ success: true, attachments: (ledger as any).attachments, ledger });
  } catch (error) {
    next(error);
  }
};

export const deletePerjalananDanaAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isOfficeRole(req)) return res.status(403).json({ message: 'Unauthorized' });
    ensureObjectId(req.params.ledgerId, 'ledgerId');
    const { filename } = req.params;
    const header = await getHeaderOrThrow(req.params.id);
    const ledger = await PerjalananDinasDana.findOne({ _id: req.params.ledgerId, perjalanan_id: header._id, voided: { $ne: true } });
    if (!ledger) return res.status(404).json({ message: 'Ledger dana tidak ditemukan' });
    (ledger as any).attachments = ((ledger as any).attachments || []).filter((att: any) => !String(att.path || '').includes(filename));
    await ledger.save();

    const diskPath = path.join(process.cwd(), 'uploads', 'perjalanan-dinas', filename);
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    res.json({ success: true, attachments: (ledger as any).attachments, ledger });
  } catch (error) {
    next(error);
  }
};

export const postPerjalananToTtFinance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isPostingRole(req)) return res.status(403).json({ message: 'Unauthorized' });
    const header = await getHeaderOrThrow(req.params.id);
    if (String(header.status) !== 'SELESAI') {
      return res.status(400).json({ message: 'Posting hanya bisa setelah status SELESAI' });
    }
    if (header.posted_to_tt_finance) {
      return res.status(400).json({ message: 'Perjalanan sudah diposting ke tt_finance' });
    }

    const summary = await syncHeaderSummary(String(header._id));
    const latestInject = await PerjalananDinasDana.findOne({
      perjalanan_id: header._id,
      jenis: 'INJECT',
      voided: { $ne: true },
    }).sort({ created_at: -1, _id: -1 });
    if (!latestInject) {
      return res.status(400).json({ message: 'Tidak ada inject dana untuk dijadikan target posting transaksi' });
    }
    const sisaDana = Number(summary.sisa_dana || 0);

    let injectDetail: any = null;
    if ((latestInject as any).tt_finance_detail_id) {
      injectDetail = await TtFinanceDetail.findById((latestInject as any).tt_finance_detail_id);
    }

    // Compatibility untuk data lama sebelum inject membuat transaksi detail.
    if (!injectDetail) {
      const snap = (latestInject as any).transaksi_snapshot || {};
      if (!snap.kategori || !snap.sub_kategori || !snap.akun) {
        return res.status(400).json({ message: 'Inject terakhir belum punya transaksi terkait dan snapshot kategori tidak tersedia' });
      }
      const created = await createInjectFinanceDetailDraft({
        header,
        nominal: Number(latestInject.nominal || 0),
        kategori: String(snap.kategori),
        sub_kategori: String(snap.sub_kategori),
        akun: String(snap.akun),
        actor: getActorName(req),
      });
      injectDetail = created.detail;
      (latestInject as any).tt_finance_detail_id = injectDetail._id;
      (latestInject as any).transaksi_snapshot = {
        ...snap,
        tanggal: snap.tanggal || created.tanggal,
        bulan: snap.bulan || created.bulan,
        tahun_fiskal: snap.tahun_fiskal || created.tahun_fiskal,
      };
      await latestInject.save();
      await applySaldoOnHoldForPendingDetail(injectDetail);
    }
    await applySaldoOnHoldForPendingDetail(injectDetail);

    let postingDetail: any = null;
    let merged: any = null;
    let attachmentTarget: 'REALISASI' | 'INJECT' = 'INJECT';
    const now = new Date();

    let resolvedPostingTarget: PostingTargetResolved | null = null;
    if (sisaDana > 0) {
      resolvedPostingTarget = await resolvePostingTargetFromPayload(req.body || {});
      // Buat transaksi lawan (REALISASI) bernilai minus dari sisa dana.
      const nominalRealisasi = -Number(sisaDana);
      const realisasiTanggal = resolvedPostingTarget.tanggal_posting || (injectDetail as any)?.tanggal || toYmd(now);
      const createdRealisasi = await createRealisasiFinanceDetailDraft({
        header,
        nominal: nominalRealisasi,
        kategori: resolvedPostingTarget.kategori,
        sub_kategori: resolvedPostingTarget.sub_kategori,
        akun: resolvedPostingTarget.akun,
        actor: getActorName(req),
        tanggal: realisasiTanggal,
        kode_perusahaan: resolvedPostingTarget.kode_perusahaan,
        nama_perusahaan: resolvedPostingTarget.nama_perusahaan,
        kode_bank: resolvedPostingTarget.kode_bank || '-',
        no_rekening: resolvedPostingTarget.no_rekening || '-',
      });

      merged = await mergePerjalananAttachmentsIntoTransaksi(String(header._id));
      postingDetail = createdRealisasi.detail;
      postingDetail.attachments = merged.attachments;
      postingDetail.updated_by = getActorName(req);
      postingDetail.updated_at = new Date();
      await postingDetail.save();
      await applySaldoOnHoldForPendingDetail(postingDetail);
      attachmentTarget = 'REALISASI';
    } else {
      // Tidak membuat REALISASI saat sisa <= 0; sinkronkan lampiran item ke transaksi inject.
      merged = await mergePerjalananItemAttachmentsIntoTransaksi(String(header._id));
      injectDetail.attachments = [...(injectDetail.attachments || []), ...merged.attachments];
      injectDetail.updated_by = getActorName(req);
      injectDetail.updated_at = new Date();
      await injectDetail.save();
      await applySaldoOnHoldForPendingDetail(injectDetail);
      postingDetail = null;
      attachmentTarget = 'INJECT';
    }

    header.posted_to_tt_finance = true;
    header.posting_meta = {
      posting_mode: 'REALISASI_FROM_SISA',
      posted_at: new Date(),
      posted_by: getActorName(req),
      sisa_dana_at_posting: sisaDana,
      nilai_realisasi: postingDetail ? Number((postingDetail as any).nilai || 0) : null,
      tt_finance_detail_id: postingDetail ? (postingDetail._id as mongoose.Types.ObjectId) : undefined,
      inject_tt_finance_detail_id: injectDetail?._id || undefined,
      attachment_target: attachmentTarget,
      kategori: postingDetail ? (postingDetail as any).kategori : (injectDetail as any)?.kategori,
      sub_kategori: postingDetail ? (postingDetail as any).sub_kategori : (injectDetail as any)?.sub_kategori,
      akun: postingDetail ? (postingDetail as any).akun : (injectDetail as any)?.akun,
      bulan: postingDetail ? (postingDetail as any).bulan : (injectDetail as any)?.bulan,
      tanggal_posting: postingDetail ? (postingDetail as any).tanggal : (injectDetail as any)?.tanggal,
      tahun_fiskal: postingDetail ? (postingDetail as any).tahun_fiskal : (injectDetail as any)?.tahun_fiskal,
      nilai_posting: postingDetail ? Number((postingDetail as any).nilai || 0) : 0,
      posting_payload: resolvedPostingTarget ? {
        perusahaan_id: resolvedPostingTarget.perusahaan_id,
        rekening_id: resolvedPostingTarget.rekening_id,
        kategori: resolvedPostingTarget.kategori,
        sub_kategori: resolvedPostingTarget.sub_kategori,
        akun: resolvedPostingTarget.akun,
      } : undefined,
      attachment_merge_count: merged?.counts?.merged || 0,
      attachment_sources: merged.counts,
    };
    header.updated_by = getActorName(req);
    header.updated_at = new Date();
    await header.save();

    res.json({
      success: true,
      header,
      tt_finance_detail: postingDetail,
      inject_tt_finance_detail: injectDetail,
      attachment_merge: merged.counts,
      nilai_posting: postingDetail ? Number((postingDetail as any).nilai || 0) : 0,
      sisa_dana_at_posting: sisaDana,
      attachment_target: attachmentTarget,
      target_tt_finance_detail_id: postingDetail ? String((postingDetail as any)._id) : String((injectDetail as any)?._id || ''),
    });
  } catch (error) {
    next(error);
  }
};
