import { Request, Response } from 'express';
import TtFinanceDetail from '../models/TtFinanceDetail';

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

  // Indonesian-style: 1.234.567,89 -> 1234567.89
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');
  let numericStr = normalized;
  if (hasComma && hasDot) {
    numericStr = normalized.replace(/\./g, '').replace(',', '.');
  } else if (hasComma && !hasDot) {
    numericStr = normalized.replace(',', '.');
  } else {
    numericStr = normalized.replace(/\./g, '');
  }

  const value = Number(numericStr);
  return Number.isFinite(value) ? value : null;
}

// GET /tt-finance-detail?from=YYYY-MM-DD&to=YYYY-MM-DD&kategori=...&sub_kategori=...&nama_perusahaan=...&page=1&limit=10&aggregate=1
export const listTtFinanceDetail = async (req: Request, res: Response) => {
  try {
    const { from, to, kategori, sub_kategori, akun, input_by, sortKategori, nama_perusahaan, page = '1', limit = '10', aggregate, q, special_type } = req.query as any;
    const pageNum = parseInt(String(page), 10) || 1;
    const limitNum = parseInt(String(limit), 10) || 10;
    const doAggregate = String(aggregate || '').toLowerCase() === '1' || String(aggregate || '').toLowerCase() === 'true';

    const filter: any = { status_deleted: { $ne: true } };
    if (from && to) {
      filter.tanggal = { $gte: from, $lte: to };
    } else if (from) {
      filter.tanggal = { $gte: from };
    } else if (to) {
      filter.tanggal = { $lte: to };
    }
    if (kategori && kategori !== 'ALL') filter.kategori = kategori;
    if (sub_kategori && sub_kategori !== 'ALL') filter.sub_kategori = sub_kategori;
    if (nama_perusahaan && nama_perusahaan !== 'ALL') filter.nama_perusahaan = nama_perusahaan;
    if (akun && akun !== 'ALL') filter.akun = akun;
    if (input_by && input_by !== 'ALL') filter.created_by = input_by;
    if (special_type === 'SPECIAL') filter.transaction_mode = 'SPECIAL';
    if (special_type === 'FINANCE_ONLY') filter.transaction_mode = 'FINANCE_ONLY';
    if (special_type === 'NORMAL') {
      filter.$and = [
        {
          $or: [
            { transaction_mode: 'NORMAL' },
            { transaction_mode: { $exists: false }, is_special_transaction: { $ne: true } },
          ],
        },
      ];
    }

    // Apply free-text search (q) across common fields
    if (q && String(q).trim() !== '') {
      const qText = String(q).trim();
      const rx = new RegExp(escapeRegex(qText), 'i');
      const orFilters: any[] = [
        { kategori: rx },
        { sub_kategori: rx },
        { akun: rx },
        { keterangan: rx },
        { nama_perusahaan: rx },
        { kode_bank: rx },
        { no_rekening: rx },
        { bulan: rx },
      ];
      const nilaiSearch = parseRupiahSearch(qText);
      if (nilaiSearch !== null) {
        orFilters.push({ nilai: nilaiSearch });
      }
      filter.$or = orFilters;
    }

    if (doAggregate) {
      const agg = await TtFinanceDetail.aggregate([
        { $match: filter },
        { $group: { _id: null, totalNilai: { $sum: '$nilai' }, totalCount: { $sum: 1 } } },
      ]).exec();
      const doc = agg[0] || { totalNilai: 0, totalCount: 0 };
      return res.json({ totalNilai: doc.totalNilai || 0, totalCount: doc.totalCount || 0 });
    }

    // Default sort by tanggal ascending; apply kategori sort when provided
    const sortObj: any = {};
    if (sortKategori === 'asc') sortObj.kategori = 1;
    else if (sortKategori === 'desc') sortObj.kategori = -1;
    // Always sort by tanggal ascending after kategori (stable ordering)
    sortObj.tanggal = 1;
    sortObj._id = 1; // Stable tiebreaker to avoid duplicates across pages

    const totalCount = await TtFinanceDetail.countDocuments(filter);
    const data = await TtFinanceDetail.find(filter)
      .sort(sortObj)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);
    const totalPages = Math.max(1, Math.ceil(totalCount / limitNum));
    res.json({ data, totalCount, totalPages, page: pageNum });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};
