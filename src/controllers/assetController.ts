import mongoose from 'mongoose';
import { Request, Response } from 'express';
import Asset from '../models/Asset';
import AssetType from '../models/AssetType';
import AssetLedger from '../models/AssetLedger';
import AssetTypePriceHistory from '../models/AssetTypePriceHistory';
import AssetTransfer from '../models/AssetTransfer';
import Perusahaan from '../models/Perusahaan';
import Rekening from '../models/Rekening';

function actor(req: Request) {
  const user: any = (req as any).user;
  return String(user?.username || user?.name || user?.email || 'SYSTEM');
}

function normalizeCode(input: any) {
  return String(input || '').trim().toUpperCase().replace(/\s+/g, '_');
}

async function generateAssetCode() {
  const last = await Asset.findOne({ asset_code: /^AST\d+$/ }).sort({ asset_code: -1 }).lean();
  const lastNumber = Number(String((last as any)?.asset_code || '').replace(/\D/g, '')) || 0;
  return `AST${String(lastNumber + 1).padStart(5, '0')}`;
}

async function resolvePerusahaan(perusahaanId?: string) {
  if (!perusahaanId || perusahaanId === 'none') return null;
  const perusahaan = await Perusahaan.findById(perusahaanId);
  if (!perusahaan) throw new Error('Perusahaan tidak ditemukan.');
  return perusahaan;
}

export const listAssetTypes = async (_req: Request, res: Response) => {
  try {
    const data = await AssetType.find({ status_aktv: { $ne: false } }).sort({ code: 1 }).lean();
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ message: 'Gagal mengambil jenis asset.', error: err?.message });
  }
};

export const createAssetType = async (req: Request, res: Response) => {
  try {
    const code = normalizeCode(req.body?.code);
    const name = String(req.body?.name || '').trim().toUpperCase();
    const unit = String(req.body?.unit || '').trim();
    const current_price = Number(req.body?.current_price || 0);
    if (!code || !name || !unit) return res.status(400).json({ message: 'code, name, dan unit wajib diisi.' });
    if (!Number.isFinite(current_price) || current_price < 0) return res.status(400).json({ message: 'Harga sekarang tidak valid.' });
    const data = await AssetType.create({ code, name, unit, current_price, input_by: actor(req), input_date: new Date(), update_date: new Date() });
    return res.status(201).json({ success: true, data });
  } catch (err: any) {
    const duplicate = err?.code === 11000;
    return res.status(duplicate ? 400 : 500).json({ message: duplicate ? 'Kode jenis asset sudah digunakan.' : 'Gagal membuat jenis asset.', error: err?.message });
  }
};

export const updateAssetType = async (req: Request, res: Response) => {
  try {
    const code = normalizeCode(req.body?.code);
    const name = String(req.body?.name || '').trim().toUpperCase();
    const unit = String(req.body?.unit || '').trim();
    const current_price = Number(req.body?.current_price || 0);
    if (!code || !name || !unit) return res.status(400).json({ message: 'code, name, dan unit wajib diisi.' });
    if (!Number.isFinite(current_price) || current_price < 0) return res.status(400).json({ message: 'Harga sekarang tidak valid.' });
    const data = await AssetType.findById(req.params.id);
    if (!data || data.status_aktv === false) return res.status(404).json({ message: 'Jenis asset tidak ditemukan.' });
    data.code = code;
    data.name = name;
    data.unit = unit;
    data.current_price = current_price;
    data.update_by = actor(req);
    data.update_date = new Date();
    await data.save();
    return res.json({ success: true, data });
  } catch (err: any) {
    const duplicate = err?.code === 11000;
    return res.status(duplicate ? 400 : 500).json({ message: duplicate ? 'Kode jenis asset sudah digunakan.' : 'Gagal update jenis asset.', error: err?.message });
  }
};

export const deleteAssetType = async (req: Request, res: Response) => {
  try {
    const data = await AssetType.findById(req.params.id);
    if (!data || data.status_aktv === false) return res.status(404).json({ message: 'Jenis asset tidak ditemukan.' });
    const used = await Asset.exists({ asset_type_id: data._id, status_aktv: { $ne: false } });
    if (used) return res.status(400).json({ message: 'Jenis asset sedang dipakai, silahkan ganti terlebih dahulu dan ulangi lagi.' });
    data.status_aktv = false;
    data.update_by = actor(req);
    data.update_date = new Date();
    await data.save();
    return res.json({ success: true, data, message: 'Jenis asset berhasil dihapus.' });
  } catch (err: any) {
    return res.status(500).json({ message: 'Gagal hapus jenis asset.', error: err?.message });
  }
};

export const updateAssetTypeCurrentPrice = async (req: Request, res: Response) => {
  try {
    const current_price = Number(req.body?.current_price);
    const keterangan = String(req.body?.keterangan || '').trim();
    if (!Number.isFinite(current_price) || current_price < 0) {
      return res.status(400).json({ message: 'Harga sekarang tidak valid.' });
    }
    const data = await AssetType.findById(req.params.id);
    if (!data || data.status_aktv === false) return res.status(404).json({ message: 'Jenis asset tidak ditemukan.' });
    const oldPrice = Number(data.current_price || 0);
    data.current_price = current_price;
    data.update_by = actor(req);
    data.update_date = new Date();
    await data.save();
    await AssetTypePriceHistory.create({
      asset_type_id: data._id,
      code: data.code,
      name: data.name,
      unit: data.unit,
      old_price: oldPrice,
      new_price: current_price,
      changed_by: actor(req),
      changed_at: new Date(),
      keterangan,
    });
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ message: 'Gagal update harga sekarang.', error: err?.message });
  }
};

export const listAssetTypePriceHistory = async (req: Request, res: Response) => {
  try {
    const assetTypeId = String(req.query?.asset_type_id || '').trim();
    const filter = assetTypeId ? { asset_type_id: assetTypeId } : {};
    const data = await AssetTypePriceHistory.find(filter).sort({ changed_at: -1 }).limit(300).lean();
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ message: 'Gagal mengambil history harga asset.', error: err?.message });
  }
};

export const listAssets = async (req: Request, res: Response) => {
  try {
    const includeInactive = String(req.query?.include_inactive || '') === '1';
    const filter = includeInactive ? {} : { status_aktv: { $ne: false } };
    const rows = await Asset.find(filter).populate('asset_type_id').populate('perusahaan_id').sort({ asset_code: 1 }).lean();
    const data = rows.map((asset: any) => {
      const type = asset.asset_type_id || {};
      const qty = Number(asset.qty || 0);
      const hargaBeli = Number(asset.harga_beli_per_unit || 0);
      const hargaSekarang = Number(type.current_price || 0);
      return {
        ...asset,
        asset_type: type,
        unit: type.unit || '',
        current_price: hargaSekarang,
        total_harga_beli: qty * hargaBeli,
        total_harga_sekarang: qty * hargaSekarang,
        growth_nominal: qty * hargaSekarang - qty * hargaBeli,
        growth_percent: qty * hargaBeli > 0 ? ((qty * hargaSekarang - qty * hargaBeli) / (qty * hargaBeli)) * 100 : 0,
      };
    });
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ message: 'Gagal mengambil asset.', error: err?.message });
  }
};

export const createAsset = async (req: Request, res: Response) => {
  try {
    const asset_type_id = String(req.body?.asset_type_id || '').trim();
    const asset_name = String(req.body?.asset_name || '').trim().toUpperCase();
    const qty = Number(req.body?.qty || 0);
    const harga_beli_per_unit = Number(req.body?.harga_beli_per_unit || 0);
    if (!asset_type_id || !asset_name) return res.status(400).json({ message: 'Jenis asset dan nama asset wajib diisi.' });
    if (!Number.isFinite(qty) || qty < 0 || !Number.isFinite(harga_beli_per_unit) || harga_beli_per_unit < 0) {
      return res.status(400).json({ message: 'Qty dan harga beli harus valid.' });
    }
    const assetType = await AssetType.findById(asset_type_id);
    if (!assetType || assetType.status_aktv === false) return res.status(400).json({ message: 'Jenis asset tidak ditemukan atau tidak aktif.' });
    const perusahaan = await resolvePerusahaan(req.body?.perusahaan_id);
    const data = await Asset.create({
      asset_code: req.body?.asset_code ? normalizeCode(req.body.asset_code) : await generateAssetCode(),
      asset_name,
      asset_type_id,
      perusahaan_id: perusahaan?._id || null,
      kode_perusahaan: (perusahaan as any)?.kode_perusahaan || '',
      nama_perusahaan: (perusahaan as any)?.nama_perusahaan || '',
      qty,
      harga_beli_per_unit,
      input_by: actor(req),
      input_date: new Date(),
      update_date: new Date(),
    });
    if (qty > 0) {
      await AssetLedger.create({
        asset_id: data._id,
        asset_code: data.asset_code,
        asset_name: data.asset_name,
        movement_type: 'ADJUSTMENT',
        qty_delta: qty,
        qty_before: 0,
        qty_after: qty,
        unit: assetType.unit,
        unit_price_snapshot: Number(assetType.current_price || 0),
        ref_type: 'ASSET_INITIAL',
        ref_id: data._id,
        tanggal: new Date().toISOString().slice(0, 10),
        keterangan: 'SALDO AWAL ASSET',
        created_by: actor(req),
      });
    }
    return res.status(201).json({ success: true, data });
  } catch (err: any) {
    const duplicate = err?.code === 11000;
    return res.status(duplicate ? 400 : 500).json({ message: duplicate ? 'Kode asset sudah digunakan.' : 'Gagal membuat asset.', error: err?.message });
  }
};

export const updateAsset = async (req: Request, res: Response) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset || asset.status_aktv === false) return res.status(404).json({ message: 'Asset tidak ditemukan.' });
    const perusahaan = await resolvePerusahaan(req.body?.perusahaan_id);
    if (req.body?.asset_name !== undefined) asset.asset_name = String(req.body.asset_name || '').trim().toUpperCase();
    if (req.body?.asset_type_id !== undefined) {
      const assetType = await AssetType.findById(req.body.asset_type_id);
      if (!assetType || assetType.status_aktv === false) return res.status(400).json({ message: 'Jenis asset tidak ditemukan atau tidak aktif.' });
      asset.asset_type_id = assetType._id;
    }
    if (req.body?.harga_beli_per_unit !== undefined) {
      const harga = Number(req.body.harga_beli_per_unit);
      if (!Number.isFinite(harga) || harga < 0) return res.status(400).json({ message: 'Harga beli tidak valid.' });
      asset.harga_beli_per_unit = harga;
    }
    asset.perusahaan_id = perusahaan?._id || null;
    asset.kode_perusahaan = (perusahaan as any)?.kode_perusahaan || '';
    asset.nama_perusahaan = (perusahaan as any)?.nama_perusahaan || '';
    asset.update_by = actor(req);
    asset.update_date = new Date();
    await asset.save();
    return res.json({ success: true, data: asset });
  } catch (err: any) {
    return res.status(500).json({ message: 'Gagal update asset.', error: err?.message });
  }
};

export const deleteAsset = async (req: Request, res: Response) => {
  try {
    const data = await Asset.findByIdAndUpdate(
      req.params.id,
      { status_aktv: false, delete_date: new Date(), delete_by: actor(req) },
      { new: true }
    );
    if (!data) return res.status(404).json({ message: 'Asset tidak ditemukan.' });
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ message: 'Gagal hapus asset.', error: err?.message });
  }
};

export const getAssetSummary = async (_req: Request, res: Response) => {
  try {
    const rows = await Asset.find({ status_aktv: { $ne: false } }).populate('asset_type_id').lean();
    let total_harga_beli = 0;
    let total_harga_sekarang = 0;
    for (const asset of rows as any[]) {
      const type = asset.asset_type_id || {};
      const qty = Number(asset.qty || 0);
      total_harga_beli += qty * Number(asset.harga_beli_per_unit || 0);
      total_harga_sekarang += qty * Number(type.current_price || 0);
    }
    const growth_nominal = total_harga_sekarang - total_harga_beli;
    return res.json({
      success: true,
      data: {
        total_harga_beli,
        total_harga_sekarang,
        growth_nominal,
        growth_percent: total_harga_beli > 0 ? (growth_nominal / total_harga_beli) * 100 : 0,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ message: 'Gagal mengambil summary asset.', error: err?.message });
  }
};

export const getAssetLedger = async (req: Request, res: Response) => {
  try {
    const data = await AssetLedger.find({ asset_id: req.params.id }).sort({ created_at: -1 }).limit(200).lean();
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ message: 'Gagal mengambil ledger asset.', error: err?.message });
  }
};

export const listAssetLedgerHistory = async (_req: Request, res: Response) => {
  try {
    const data = await AssetLedger.find({}).sort({ created_at: -1 }).limit(300).lean();
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ message: 'Gagal mengambil history ledger asset.', error: err?.message });
  }
};

export const reduceAssetStock = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    const asset_id = String(req.body?.asset_id || '').trim();
    const qty = Number(req.body?.qty || req.body?.asset_qty || 0);
    const unit_price = Number(req.body?.unit_price || req.body?.unit_price_snapshot || 0);
    const tanggal = req.body?.tanggal ? new Date(String(req.body.tanggal)) : new Date();
    const note = String(req.body?.keterangan || '').trim();
    if (!asset_id) return res.status(400).json({ message: 'Asset wajib diisi.' });
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ message: 'Qty pengurangan harus lebih besar dari 0.' });
    if (!Number.isFinite(unit_price) || unit_price < 0) return res.status(400).json({ message: 'Harga per unit tidak valid.' });
    if (Number.isNaN(tanggal.getTime())) return res.status(400).json({ message: 'Tanggal tidak valid.' });

    let payload: any = null;
    await session.withTransaction(async () => {
      const asset = await Asset.findById(asset_id).session(session);
      if (!asset || asset.status_aktv === false) throw new Error('Asset tidak ditemukan atau tidak aktif.');
      const assetType = await AssetType.findById(asset.asset_type_id).session(session);
      if (!assetType || assetType.status_aktv === false) throw new Error('Jenis asset tidak ditemukan atau tidak aktif.');
      const qtyBefore = Number(asset.qty || 0);
      if (qtyBefore < qty) throw new Error('Qty asset tidak mencukupi.');
      const qtyAfter = qtyBefore - qty;
      asset.qty = qtyAfter;
      asset.update_by = actor(req);
      asset.update_date = new Date();
      await asset.save({ session });
      const [ledger] = await AssetLedger.create([{
        asset_id: asset._id,
        asset_code: asset.asset_code,
        asset_name: asset.asset_name,
        movement_type: 'OUT',
        qty_delta: -qty,
        qty_before: qtyBefore,
        qty_after: qtyAfter,
        unit: String(assetType.unit || ''),
        unit_price_snapshot: unit_price,
        ref_type: 'ASSET_STOCK_OUT',
        ref_id: null,
        tanggal: tanggal.toISOString().slice(0, 10),
        keterangan: note || 'PENGURANGAN STOK ASSET',
        created_by: actor(req),
        created_at: new Date(),
      }], { session });
      payload = { ledger, asset: { _id: asset._id, qty_before: qtyBefore, qty_after: qtyAfter } };
    });
    return res.status(201).json({ success: true, message: 'Pengurangan asset berhasil dicatat.', data: payload });
  } catch (err: any) {
    return res.status(400).json({ message: err?.message || 'Gagal mengurangi asset.' });
  } finally {
    session.endSession();
  }
};

function calculateQty(nominal: number, unitPrice: number, requestedQty: number) {
  const assetQty = nominal / unitPrice;
  if (!Number.isFinite(assetQty) || assetQty <= 0) throw new Error('Qty asset hasil kalkulasi tidak valid.');
  if (requestedQty > 0 && Math.abs(requestedQty - assetQty) > 0.000001) {
    throw new Error('Qty asset tidak sesuai dengan nominal dan harga per unit.');
  }
  return assetQty;
}

export const transferRekeningToAsset = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    const rekening_id = String(req.body?.rekening_id || '').trim();
    const asset_id = String(req.body?.asset_id || '').trim();
    const nominal = Number(req.body?.nominal || 0);
    const unit_price = Number(req.body?.unit_price || req.body?.unit_price_snapshot || 0);
    const requestedQty = Number(req.body?.asset_qty || 0);
    const tanggal = req.body?.tanggal ? new Date(String(req.body.tanggal)) : new Date();
    const note = String(req.body?.keterangan || '').trim();
    if (!rekening_id || !asset_id) return res.status(400).json({ message: 'Rekening dan asset wajib diisi.' });
    if (!Number.isFinite(nominal) || nominal <= 0) return res.status(400).json({ message: 'Nominal transfer harus lebih besar dari 0.' });
    if (!Number.isFinite(unit_price) || unit_price <= 0) return res.status(400).json({ message: 'Harga per unit harus lebih besar dari 0.' });
    if (Number.isNaN(tanggal.getTime())) return res.status(400).json({ message: 'Tanggal transfer tidak valid.' });
    const asset_qty = calculateQty(nominal, unit_price, requestedQty);
    let payload: any = null;

    await session.withTransaction(async () => {
      const [rekening, asset] = await Promise.all([
        Rekening.findById(rekening_id).session(session),
        Asset.findById(asset_id).session(session),
      ]);
      if (!rekening) throw new Error('Rekening tidak ditemukan.');
      if (!asset || asset.status_aktv === false) throw new Error('Asset tidak ditemukan atau tidak aktif.');
      const assetType = await AssetType.findById(asset.asset_type_id).session(session);
      if (!assetType || assetType.status_aktv === false) throw new Error('Jenis asset tidak ditemukan atau tidak aktif.');
      const saldoAwal = Number(rekening.saldo || 0);
      if (saldoAwal < nominal) throw new Error('Saldo rekening tidak mencukupi.');
      const saldoAkhir = saldoAwal - nominal;
      const qtyBefore = Number(asset.qty || 0);
      const qtyAfter = qtyBefore + asset_qty;
      rekening.saldo = saldoAkhir;
      asset.qty = qtyAfter;
      asset.update_by = actor(req);
      asset.update_date = new Date();
      await Promise.all([rekening.save({ session }), asset.save({ session })]);
      const [transfer] = await AssetTransfer.create([{
        direction: 'REKENING_TO_ASSET',
        rekening_id: rekening._id,
        asset_id: asset._id,
        kode_bank: rekening.kode_bank,
        no_rekening: rekening.no_rekening,
        asset_code: asset.asset_code,
        asset_name: asset.asset_name,
        nominal,
        asset_qty,
        asset_unit: String(assetType.unit || ''),
        unit_price_snapshot: unit_price,
        tanggal,
        keterangan: note,
        created_by: actor(req),
        created_at: new Date(),
      }], { session });
      await AssetLedger.create([{
        asset_id: asset._id,
        asset_code: asset.asset_code,
        asset_name: asset.asset_name,
        movement_type: 'ADD',
        qty_delta: asset_qty,
        qty_before: qtyBefore,
        qty_after: qtyAfter,
        unit: String(assetType.unit || ''),
        unit_price_snapshot: unit_price,
        ref_type: 'ASSET_TRANSFER',
        ref_id: transfer._id,
        tanggal: tanggal.toISOString().slice(0, 10),
        keterangan: `TRANSFER DARI REKENING ${rekening.kode_bank}/${rekening.no_rekening}${note ? ` - ${note}` : ''}`,
        created_by: actor(req),
        created_at: new Date(),
      }], { session });
      payload = { transfer, rekening: { _id: rekening._id, saldo_awal: saldoAwal, saldo_akhir: saldoAkhir }, asset: { _id: asset._id, qty_before: qtyBefore, qty_after: qtyAfter } };
    });
    return res.status(201).json({ success: true, message: 'Transfer rekening ke asset berhasil.', data: payload });
  } catch (err: any) {
    return res.status(400).json({ message: err?.message || 'Gagal transfer rekening ke asset.' });
  } finally {
    session.endSession();
  }
};

export const transferAssetToRekening = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    const rekening_id = String(req.body?.rekening_id || '').trim();
    const asset_id = String(req.body?.asset_id || '').trim();
    const nominal = Number(req.body?.nominal || 0);
    const unit_price = Number(req.body?.unit_price || req.body?.unit_price_snapshot || 0);
    const requestedQty = Number(req.body?.asset_qty || 0);
    const tanggal = req.body?.tanggal ? new Date(String(req.body.tanggal)) : new Date();
    const note = String(req.body?.keterangan || '').trim();
    if (!rekening_id || !asset_id) return res.status(400).json({ message: 'Asset dan rekening wajib diisi.' });
    if (!Number.isFinite(nominal) || nominal <= 0) return res.status(400).json({ message: 'Nominal transfer harus lebih besar dari 0.' });
    if (!Number.isFinite(unit_price) || unit_price <= 0) return res.status(400).json({ message: 'Harga per unit harus lebih besar dari 0.' });
    if (Number.isNaN(tanggal.getTime())) return res.status(400).json({ message: 'Tanggal transfer tidak valid.' });
    const asset_qty = calculateQty(nominal, unit_price, requestedQty);
    let payload: any = null;

    await session.withTransaction(async () => {
      const [rekening, asset] = await Promise.all([
        Rekening.findById(rekening_id).session(session),
        Asset.findById(asset_id).session(session),
      ]);
      if (!rekening) throw new Error('Rekening tidak ditemukan.');
      if (!asset || asset.status_aktv === false) throw new Error('Asset tidak ditemukan atau tidak aktif.');
      const assetType = await AssetType.findById(asset.asset_type_id).session(session);
      if (!assetType || assetType.status_aktv === false) throw new Error('Jenis asset tidak ditemukan atau tidak aktif.');
      const qtyBefore = Number(asset.qty || 0);
      if (qtyBefore < asset_qty) throw new Error('Qty asset tidak mencukupi.');
      const qtyAfter = qtyBefore - asset_qty;
      const saldoAwal = Number(rekening.saldo || 0);
      const saldoAkhir = saldoAwal + nominal;
      rekening.saldo = saldoAkhir;
      asset.qty = qtyAfter;
      asset.update_by = actor(req);
      asset.update_date = new Date();
      await Promise.all([rekening.save({ session }), asset.save({ session })]);
      const [transfer] = await AssetTransfer.create([{
        direction: 'ASSET_TO_REKENING',
        rekening_id: rekening._id,
        asset_id: asset._id,
        kode_bank: rekening.kode_bank,
        no_rekening: rekening.no_rekening,
        asset_code: asset.asset_code,
        asset_name: asset.asset_name,
        nominal,
        asset_qty,
        asset_unit: String(assetType.unit || ''),
        unit_price_snapshot: unit_price,
        tanggal,
        keterangan: note,
        created_by: actor(req),
        created_at: new Date(),
      }], { session });
      await AssetLedger.create([{
        asset_id: asset._id,
        asset_code: asset.asset_code,
        asset_name: asset.asset_name,
        movement_type: 'OUT',
        qty_delta: -asset_qty,
        qty_before: qtyBefore,
        qty_after: qtyAfter,
        unit: String(assetType.unit || ''),
        unit_price_snapshot: unit_price,
        ref_type: 'ASSET_TRANSFER_TO_REKENING',
        ref_id: transfer._id,
        tanggal: tanggal.toISOString().slice(0, 10),
        keterangan: `TRANSFER KE REKENING ${rekening.kode_bank}/${rekening.no_rekening}${note ? ` - ${note}` : ''}`,
        created_by: actor(req),
        created_at: new Date(),
      }], { session });
      payload = { transfer, rekening: { _id: rekening._id, saldo_awal: saldoAwal, saldo_akhir: saldoAkhir }, asset: { _id: asset._id, qty_before: qtyBefore, qty_after: qtyAfter } };
    });
    return res.status(201).json({ success: true, message: 'Transfer asset ke rekening berhasil.', data: payload });
  } catch (err: any) {
    return res.status(400).json({ message: err?.message || 'Gagal transfer asset ke rekening.' });
  } finally {
    session.endSession();
  }
};

export const listAssetTransfers = async (_req: Request, res: Response) => {
  try {
    const data = await AssetTransfer.find({}).sort({ tanggal: -1, created_at: -1 }).limit(200).lean();
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ message: 'Gagal mengambil history transfer asset.', error: err?.message });
  }
};
