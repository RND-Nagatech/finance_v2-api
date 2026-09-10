import { NextFunction, Request, Response } from 'express';
import PerjalananDinas from '../../models/PerjalananDinas';
import PerjalananDinasDetail from '../../models/PerjalananDinasDetail';
import PerjalananDinasDana from '../../models/PerjalananDinasDana';
import { getQueryString, pageMetadata, parseDateRange, parseObjectId, parsePageLimit, safeRegex, sortOptions } from '../common/agentQuery';
import { AgentHttpError } from '../common/agentTypes';
import { sendAgentCollection, sendAgentSuccess } from '../common/agentResponse';

const SOURCE = 'business-travel' as const;

function travelFilter(req: Request) {
  const filter: Record<string, any> = { status_deleted: { $ne: true } };
  const { startDate, endDate } = parseDateRange(req);
  const status = getQueryString(req, 'status');
  const userId = getQueryString(req, 'userId');
  const q = safeRegex(getQueryString(req, 'search') || getQueryString(req, 'q'));
  if (status) filter.status = status;
  if (userId) filter.user_id = userId;
  if (startDate) filter.tanggal_pulang = { $gte: startDate };
  if (endDate) filter.tanggal_berangkat = { ...(filter.tanggal_berangkat || {}), $lte: endDate };
  if (q) filter.$or = [{ kode_perjalanan: q }, { user_name: q }, { user_username: q }, { tujuan: q }];
  return filter;
}

function mapTravel(row: any) {
  return {
    id: String(row._id),
    code: row.kode_perjalanan,
    employee: { id: row.user_id, username: row.user_username || null, name: row.user_name },
    destination: row.tujuan,
    departureDate: row.tanggal_berangkat,
    returnDate: row.tanggal_pulang,
    note: row.catatan || null,
    status: row.status,
    postedToFinance: Boolean(row.posted_to_tt_finance),
    totals: {
      injected: Number(row.total_inject || 0),
      returned: Number(row.total_return || 0),
      approved: Number(row.total_approved || 0),
      remaining: Number(row.sisa_dana || 0),
      currency: 'IDR',
    },
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapTravelExpense(row: any) {
  return {
    id: String(row._id),
    tripId: String(row.perjalanan_id),
    date: row.tanggal_transaksi,
    amount: Number(row.nominal || 0),
    currency: 'IDR',
    description: row.keterangan,
    auditStatus: row.audit_status,
    employee: { id: row.user_id, username: row.user_username || null, name: row.user_name },
    createdAt: row.created_at || null,
  };
}

function mapTravelFund(row: any) {
  return {
    id: String(row._id),
    tripId: String(row.perjalanan_id),
    type: row.jenis,
    amount: Number(row.nominal || 0),
    currency: 'IDR',
    description: row.keterangan || null,
    account: { bankCode: row.kode_bank, name: row.nama_rekening_snapshot },
    financeDetailId: row.tt_finance_detail_id ? String(row.tt_finance_detail_id) : null,
    voided: Boolean(row.voided),
    createdAt: row.created_at || null,
  };
}

async function travelSummary(tripId: string) {
  const [trip, expenses, funds] = await Promise.all([
    PerjalananDinas.findOne({ _id: tripId, status_deleted: { $ne: true } }).lean(),
    PerjalananDinasDetail.find({ perjalanan_id: tripId, status_deleted: { $ne: true } }).sort({ tanggal_transaksi: 1, created_at: 1 }).lean(),
    PerjalananDinasDana.find({ perjalanan_id: tripId, voided: { $ne: true } }).sort({ created_at: 1 }).lean(),
  ]);
  if (!trip) throw new AgentHttpError(404, 'NOT_FOUND', 'Business travel record not found');
  const injected = funds.filter((row: any) => row.jenis === 'INJECT').reduce((sum, row: any) => sum + Number(row.nominal || 0), 0);
  const returned = funds.filter((row: any) => row.jenis === 'RETURN').reduce((sum, row: any) => sum + Number(row.nominal || 0), 0);
  const approved = expenses.filter((row: any) => row.audit_status === 'APPROVED').reduce((sum, row: any) => sum + Number(row.nominal || 0), 0);
  return {
    trip: mapTravel(trip),
    currency: 'IDR',
    expenseTotal: expenses.reduce((sum: number, row: any) => sum + Number(row.nominal || 0), 0),
    approvedExpenseTotal: approved,
    injectedTotal: injected,
    returnedTotal: returned,
    remainingFunds: injected - returned - approved,
    expenseCount: expenses.length,
    fundCount: funds.length,
  };
}

export async function listBusinessTravel(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = parsePageLimit(req);
    const filter = travelFilter(req);
    const sort = sortOptions(req, { departureDate: 'tanggal_berangkat', returnDate: 'tanggal_pulang', createdAt: 'created_at', code: 'kode_perjalanan' }, 'departureDate');
    const [rows, totalItems] = await Promise.all([
      PerjalananDinas.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      PerjalananDinas.countDocuments(filter),
    ]);
    return sendAgentCollection(req, res, SOURCE, rows.map(mapTravel), pageMetadata(page, limit, totalItems));
  } catch (error) {
    return next(error);
  }
}

export async function getBusinessTravel(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseObjectId(req.params.id, 'id');
    const row = await PerjalananDinas.findOne({ ...travelFilter(req), _id: id }).lean();
    if (!row) throw new AgentHttpError(404, 'NOT_FOUND', 'Business travel record not found');
    return sendAgentSuccess(req, res, SOURCE, mapTravel(row));
  } catch (error) {
    return next(error);
  }
}

export async function getBusinessTravelSummary(req: Request, res: Response, next: NextFunction) {
  try {
    return sendAgentSuccess(req, res, SOURCE, await travelSummary(parseObjectId(req.params.id, 'id')));
  } catch (error) {
    return next(error);
  }
}

export async function getBusinessTravelStatusSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await PerjalananDinas.aggregate([{ $match: travelFilter(req) }, { $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
    return sendAgentSuccess(req, res, SOURCE, rows.map((row: any) => ({ status: row._id, count: Number(row.count || 0) })));
  } catch (error) {
    return next(error);
  }
}

export async function listBusinessTravelExpenses(req: Request, res: Response, next: NextFunction) {
  try {
    const tripId = parseObjectId(req.params.id, 'id');
    const { page, limit } = parsePageLimit(req);
    const [rows, totalItems] = await Promise.all([
      PerjalananDinasDetail.find({ perjalanan_id: tripId, status_deleted: { $ne: true } }).sort({ tanggal_transaksi: 1, created_at: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      PerjalananDinasDetail.countDocuments({ perjalanan_id: tripId, status_deleted: { $ne: true } }),
    ]);
    return sendAgentCollection(req, res, SOURCE, rows.map(mapTravelExpense), pageMetadata(page, limit, totalItems));
  } catch (error) {
    return next(error);
  }
}
