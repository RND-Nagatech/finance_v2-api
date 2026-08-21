import type { ClientSession } from 'mongoose';
import Asset from '../models/Asset';
import AssetLedger, { AssetLedgerMovementType } from '../models/AssetLedger';

export function isAssetSource(doc: any): boolean {
  return String(doc?.source_type || '').toUpperCase() === 'ASSET';
}

export function calculateAssetQtyDelta(kategori: string, qty: number): number {
  const normalizedKategori = String(kategori || '').trim().toUpperCase();
  const amount = Math.abs(Number(qty || 0));
  return normalizedKategori === 'PENDAPATAN' ? amount : -amount;
}

export async function resolveAssetSnapshot(assetId: string, session?: ClientSession) {
  const asset = await Asset.findById(assetId).populate('asset_type_id').session(session || null);
  if (!asset || asset.status_aktv === false) {
    throw new Error('Asset tidak ditemukan atau tidak aktif.');
  }
  const assetType: any = asset.asset_type_id;
  if (!assetType || assetType.status_aktv === false) {
    throw new Error('Jenis asset tidak ditemukan atau tidak aktif.');
  }
  return {
    asset,
    assetType,
    asset_code: asset.asset_code,
    asset_name: asset.asset_name,
    unit: String(assetType.unit || ''),
    current_price: Number(assetType.current_price || 0),
  };
}

export async function applyAssetMovementFromTransaction(doc: any, actor: string, session?: ClientSession) {
  if (!isAssetSource(doc)) return null;
  if (!doc.asset_id) throw new Error('asset_id wajib diisi untuk transaksi asset.');

  const qty = Number(doc.asset_qty || 0);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error('Qty asset harus lebih besar dari 0.');
  }

  const { asset, assetType } = await resolveAssetSnapshot(String(doc.asset_id), session);
  const delta = calculateAssetQtyDelta(doc.kategori, qty);
  const before = Number(asset.qty || 0);
  const after = before + delta;
  if (after < 0) {
    throw new Error('Qty asset tidak mencukupi.');
  }

  asset.qty = after;
  asset.update_date = new Date();
  asset.update_by = actor;
  await asset.save({ session });

  const movementType: AssetLedgerMovementType = delta >= 0 ? 'ADD' : 'OUT';
  const [ledger] = await AssetLedger.create([{
    asset_id: asset._id,
    asset_code: asset.asset_code,
    asset_name: asset.asset_name,
    movement_type: movementType,
    qty_delta: delta,
    qty_before: before,
    qty_after: after,
    unit: String((assetType as any).unit || doc.asset_unit || ''),
    unit_price_snapshot: Number(doc.asset_unit_price_snapshot || (assetType as any).current_price || 0),
    ref_type: 'TT_FINANCE_DETAIL',
    ref_id: doc._id,
    tanggal: doc.tanggal || '',
    keterangan: `${doc.kategori || ''}/${doc.sub_kategori || ''}/${doc.akun || ''}`,
    created_by: actor || 'SYSTEM',
    created_at: new Date(),
  }], { session });
  return ledger;
}

export async function rollbackAssetMovementFromTransaction(doc: any, actor: string, session?: ClientSession) {
  if (!isAssetSource(doc)) return null;
  if (!doc.asset_id) return null;

  const asset = await Asset.findById(doc.asset_id).populate('asset_type_id').session(session || null);
  if (!asset) return null;

  const originalDelta = calculateAssetQtyDelta(doc.kategori, Number(doc.asset_qty || 0));
  const rollbackDelta = -originalDelta;
  const before = Number(asset.qty || 0);
  const after = before + rollbackDelta;
  if (after < 0) {
    throw new Error('Rollback asset menghasilkan qty negatif.');
  }

  const assetType: any = asset.asset_type_id;
  asset.qty = after;
  asset.update_date = new Date();
  asset.update_by = actor;
  await asset.save({ session });

  const [ledger] = await AssetLedger.create([{
    asset_id: asset._id,
    asset_code: asset.asset_code,
    asset_name: asset.asset_name,
    movement_type: 'ROLLBACK',
    qty_delta: rollbackDelta,
    qty_before: before,
    qty_after: after,
    unit: String(assetType?.unit || doc.asset_unit || ''),
    unit_price_snapshot: Number(doc.asset_unit_price_snapshot || assetType?.current_price || 0),
    ref_type: 'TT_FINANCE_DETAIL',
    ref_id: doc._id,
    tanggal: doc.tanggal || '',
    keterangan: `[ROLLBACK] ${doc.kategori || ''}/${doc.sub_kategori || ''}/${doc.akun || ''}`,
    created_by: actor || 'SYSTEM',
    created_at: new Date(),
  }], { session });
  return ledger;
}
