import { NextFunction, Request, Response } from 'express';
import Asset from '../../models/Asset';
import AssetLedger from '../../models/AssetLedger';
import { getQueryString, pageMetadata, parseDateRange, parseObjectId, parsePageLimit, safeRegex, sortOptions } from '../common/agentQuery';
import { AgentHttpError } from '../common/agentTypes';
import { sendAgentCollection, sendAgentSuccess } from '../common/agentResponse';

const SOURCE = 'assets' as const;

function assetFilter(req: Request) {
  const filter: Record<string, any> = {};
  if (getQueryString(req, 'includeInactive') !== 'true') filter.status_aktv = { $ne: false };
  const assetTypeId = getQueryString(req, 'assetTypeId');
  const companyId = getQueryString(req, 'companyId');
  const q = safeRegex(getQueryString(req, 'search') || getQueryString(req, 'q'));
  if (assetTypeId) filter.asset_type_id = parseObjectId(assetTypeId, 'assetTypeId');
  if (companyId) filter.perusahaan_id = parseObjectId(companyId, 'companyId');
  if (q) filter.$or = [{ asset_code: q }, { asset_name: q }, { kode_perusahaan: q }, { nama_perusahaan: q }];
  return filter;
}

function mapAsset(row: any) {
  const type = row.asset_type_id && typeof row.asset_type_id === 'object' ? row.asset_type_id : null;
  const qty = Number(row.qty || 0);
  const buyPrice = Number(row.harga_beli_per_unit || 0);
  const currentPrice = Number(type?.current_price || 0);
  return {
    id: String(row._id),
    code: row.asset_code,
    name: row.asset_name,
    type: type ? { id: String(type._id), code: type.code, name: type.name, unit: type.unit, currentPrice } : { id: row.asset_type_id ? String(row.asset_type_id) : null },
    company: row.perusahaan_id ? { id: String(row.perusahaan_id?._id || row.perusahaan_id), code: row.kode_perusahaan || null, name: row.nama_perusahaan || null } : null,
    quantity: qty,
    unit: type?.unit || null,
    purchasePricePerUnit: buyPrice,
    currentPricePerUnit: currentPrice,
    purchaseValue: qty * buyPrice,
    currentValue: qty * currentPrice,
    valuationChange: qty * currentPrice - qty * buyPrice,
    active: row.status_aktv !== false,
    createdAt: row.input_date || null,
    updatedAt: row.update_date || null,
  };
}

function mapLedger(row: any) {
  return {
    id: String(row._id),
    assetId: String(row.asset_id),
    assetCode: row.asset_code,
    assetName: row.asset_name,
    movementType: row.movement_type,
    quantityDelta: Number(row.qty_delta || 0),
    quantityBefore: Number(row.qty_before || 0),
    quantityAfter: Number(row.qty_after || 0),
    unit: row.unit,
    unitPrice: Number(row.unit_price_snapshot || 0),
    reference: row.ref_type ? { type: row.ref_type, id: row.ref_id ? String(row.ref_id) : null } : null,
    date: row.tanggal || null,
    description: row.keterangan || null,
    createdAt: row.created_at || null,
  };
}

export async function listAgentAssets(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = parsePageLimit(req);
    const filter = assetFilter(req);
    const sort = sortOptions(req, { code: 'asset_code', name: 'asset_name', quantity: 'qty', createdAt: 'input_date', updatedAt: 'update_date' }, 'code');
    const [rows, totalItems] = await Promise.all([
      Asset.find(filter).populate('asset_type_id').sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      Asset.countDocuments(filter),
    ]);
    return sendAgentCollection(req, res, SOURCE, rows.map(mapAsset), pageMetadata(page, limit, totalItems));
  } catch (error) {
    return next(error);
  }
}

export async function getAgentAssetSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await Asset.find(assetFilter(req)).populate('asset_type_id').lean();
    const assets = rows.map(mapAsset);
    return sendAgentSuccess(req, res, SOURCE, {
      assetCount: assets.length,
      totalQuantity: assets.reduce((sum, row) => sum + row.quantity, 0),
      purchaseValue: assets.reduce((sum, row) => sum + row.purchaseValue, 0),
      currentValue: assets.reduce((sum, row) => sum + row.currentValue, 0),
      valuationChange: assets.reduce((sum, row) => sum + row.valuationChange, 0),
      currency: 'IDR',
    });
  } catch (error) {
    return next(error);
  }
}

export async function getAgentAsset(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseObjectId(req.params.id, 'id');
    const row = await Asset.findOne({ ...assetFilter(req), _id: id }).populate('asset_type_id').lean();
    if (!row) throw new AgentHttpError(404, 'NOT_FOUND', 'Asset not found');
    return sendAgentSuccess(req, res, SOURCE, mapAsset(row));
  } catch (error) {
    return next(error);
  }
}

export async function getAgentAssetLedger(req: Request, res: Response, next: NextFunction) {
  try {
    const assetId = parseObjectId(req.params.id, 'id');
    const { page, limit } = parsePageLimit(req);
    const { startDate, endDate } = parseDateRange(req);
    const filter: Record<string, any> = { asset_id: assetId };
    if (startDate || endDate) {
      filter.tanggal = {};
      if (startDate) filter.tanggal.$gte = startDate;
      if (endDate) filter.tanggal.$lte = endDate;
    }
    const [rows, totalItems] = await Promise.all([
      AssetLedger.find(filter).sort({ created_at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AssetLedger.countDocuments(filter),
    ]);
    return sendAgentCollection(req, res, SOURCE, rows.map(mapLedger), pageMetadata(page, limit, totalItems));
  } catch (error) {
    return next(error);
  }
}
