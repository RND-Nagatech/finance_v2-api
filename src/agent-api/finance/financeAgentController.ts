import { NextFunction, Request, Response } from 'express';
import TtFinanceDetail from '../../models/TtFinanceDetail';
import {
  getQueryString,
  pageMetadata,
  parseDateRange,
  parseObjectId,
  parsePageLimit,
  safeRegex,
  sortOptions,
} from '../common/agentQuery';
import { AgentHttpError } from '../common/agentTypes';
import { sendAgentCollection, sendAgentSuccess } from '../common/agentResponse';

const SOURCE = 'finance' as const;

function baseFilter(req: Request) {
  const filter: Record<string, any> = {
    status_deleted: { $ne: true },
    is_validated: true,
    transaction_mode: { $ne: 'SPECIAL' },
    is_special_transaction: { $ne: true },
  };
  const { startDate, endDate } = parseDateRange(req);
  const category = getQueryString(req, 'category');
  const subCategory = getQueryString(req, 'subCategory');
  const fiscalYear = getQueryString(req, 'fiscalYear');
  const companyCode = getQueryString(req, 'companyCode');
  const q = safeRegex(getQueryString(req, 'search') || getQueryString(req, 'q'));

  if (startDate || endDate) {
    filter.tanggal = {};
    if (startDate) filter.tanggal.$gte = startDate;
    if (endDate) filter.tanggal.$lte = endDate;
  }
  if (category) filter.kategori = category;
  if (subCategory) filter.sub_kategori = subCategory;
  if (fiscalYear) filter.tahun_fiskal = fiscalYear;
  if (companyCode) filter.kode_perusahaan = companyCode;
  if (q) {
    filter.$or = [
      { kategori: q },
      { sub_kategori: q },
      { akun: q },
      { keterangan: q },
      { nama_perusahaan: q },
    ];
  }
  return filter;
}

function mapFinanceDetail(row: any) {
  return {
    id: String(row._id),
    date: row.tanggal,
    fiscalYear: row.tahun_fiskal || null,
    category: row.kategori,
    subCategory: row.sub_kategori,
    account: row.akun,
    amount: Number(row.nilai || 0),
    currency: 'IDR',
    description: row.keterangan || null,
    company: row.kode_perusahaan || row.nama_perusahaan ? {
      code: row.kode_perusahaan || null,
      name: row.nama_perusahaan || null,
    } : null,
    sourceType: row.source_type || 'REKENING',
    asset: row.asset_id ? {
      id: String(row.asset_id),
      code: row.asset_code || null,
      name: row.asset_name || null,
      quantity: row.asset_qty ?? null,
      unit: row.asset_unit || null,
    } : null,
    postingState: row.posting_state || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function aggregateFinance(req: Request) {
  const rows = await TtFinanceDetail.aggregate([
    { $match: baseFilter(req) },
    {
      $group: {
        _id: '$kategori',
        amount: { $sum: { $ifNull: ['$nilai', 0] } },
        transactionCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const breakdown = rows.map((row: any) => ({
    category: row._id,
    amount: Number(row.amount || 0),
    currency: 'IDR',
    transactionCount: Number(row.transactionCount || 0),
  }));
  const revenue = breakdown.filter((row) => row.category === 'PENDAPATAN').reduce((sum, row) => sum + row.amount, 0);
  const expenses = breakdown.filter((row) => ['PEMBELIAN', 'BIAYA'].includes(row.category)).reduce((sum, row) => sum + row.amount, 0);
  return {
    currency: 'IDR',
    revenue,
    expenses,
    grossProfit: revenue - expenses,
    transactionCount: breakdown.reduce((sum, row) => sum + row.transactionCount, 0),
    breakdown,
  };
}

export async function financeSummary(req: Request, res: Response, next: NextFunction) {
  try {
    return sendAgentSuccess(req, res, SOURCE, await aggregateFinance(req));
  } catch (error) {
    return next(error);
  }
}

export async function financeRevenue(req: Request, res: Response, next: NextFunction) {
  try {
    const summary = await aggregateFinance(req);
    return sendAgentSuccess(req, res, SOURCE, { currency: 'IDR', amount: summary.revenue, transactionCount: summary.breakdown.find((row) => row.category === 'PENDAPATAN')?.transactionCount || 0 });
  } catch (error) {
    return next(error);
  }
}

export async function financeExpenses(req: Request, res: Response, next: NextFunction) {
  try {
    const summary = await aggregateFinance(req);
    return sendAgentSuccess(req, res, SOURCE, { currency: 'IDR', amount: summary.expenses, transactionCount: summary.breakdown.filter((row) => ['PEMBELIAN', 'BIAYA'].includes(row.category)).reduce((sum, row) => sum + row.transactionCount, 0) });
  } catch (error) {
    return next(error);
  }
}

export async function financeProfitLoss(req: Request, res: Response, next: NextFunction) {
  try {
    const summary = await aggregateFinance(req);
    return sendAgentSuccess(req, res, SOURCE, { currency: 'IDR', revenue: summary.revenue, expenses: summary.expenses, netProfit: summary.grossProfit });
  } catch (error) {
    return next(error);
  }
}

export async function listFinanceTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = parsePageLimit(req);
    const filter = baseFilter(req);
    const sort = sortOptions(req, { date: 'tanggal', createdAt: 'created_at', amount: 'nilai', category: 'kategori' }, 'date');
    const [rows, totalItems] = await Promise.all([
      TtFinanceDetail.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      TtFinanceDetail.countDocuments(filter),
    ]);
    return sendAgentCollection(req, res, SOURCE, rows.map(mapFinanceDetail), pageMetadata(page, limit, totalItems));
  } catch (error) {
    return next(error);
  }
}

export async function getFinanceTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseObjectId(req.params.id, 'id');
    const row = await TtFinanceDetail.findOne({ ...baseFilter(req), _id: id }).lean();
    if (!row) throw new AgentHttpError(404, 'NOT_FOUND', 'Finance transaction not found');
    return sendAgentSuccess(req, res, SOURCE, mapFinanceDetail(row));
  } catch (error) {
    return next(error);
  }
}
