import { Request, Response } from 'express';
import TtSummaryV2 from '../models/TtSummaryV2';

const FISCAL_MONTH_NUMBER: Record<string, number> = {
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

function buildSummaryYearMatch(tahun: string) {
  const yearNumber = Number(tahun);
  return Number.isFinite(yearNumber) ? { $in: [yearNumber, tahun] } : tahun;
}

function buildSummaryMonthFilter(tahun: string, bulan?: string | null) {
  if (!bulan) return {};

  const monthCode = bulan.toUpperCase();
  const yearNumber = Number(tahun);
  const monthNumber = FISCAL_MONTH_NUMBER[monthCode];
  const labelYear = monthCode === 'DEC' && Number.isFinite(yearNumber) ? yearNumber - 1 : yearNumber;
  const monthLabel = `${monthCode}-${String(labelYear).slice(-2)}`;

  return {
    $or: [
      { bulan_fiskal: monthNumber },
      { bulan_fiskal_label: monthLabel },
    ],
  };
}

function monthLabelExpression() {
  return { $ifNull: ['$bulan_fiskal_label', ''] };
}

function emptyRekapResponse(tahun: string, bulan: string | null) {
  return {
    success: true,
    source: 'tt_summary_v2',
    tahun,
    bulan,
    rekap: [],
    data: [],
    pertahun: [],
    biayaBiaya: [],
    biaya_biaya: [],
    asetDanGaji: [],
    asetDanGajiTahunan: [],
    implementasiMarketingLainnyaTahunan: [],
    biayaBiayaTahunan: [],
    grossMarginTahunan: [],
  };
}

export const rekapAggregate = async (req: Request, res: Response) => {
  try {
    const tahun = String(req.query.tahun || new Date().getFullYear());
    const filterBulan = req.query.bulan ? String(req.query.bulan).toUpperCase() : null;

    const summaryBaseMatch = {
      period_type: 'MONTHLY',
      tahun_fiskal: buildSummaryYearMatch(tahun),
      ...buildSummaryMonthFilter(tahun, filterBulan),
    };

    const summaryCount = await TtSummaryV2.countDocuments(summaryBaseMatch);
    if (summaryCount <= 0) {
      return res.json(emptyRekapResponse(tahun, filterBulan));
    }

    const rekap = await TtSummaryV2.aggregate([
      { $match: summaryBaseMatch },
      {
        $group: {
          _id: { kategori: '$kategori', sub_kategori: '$sub_kategori' },
          total_sub_kategori: { $sum: '$total_nilai' },
        },
      },
      {
        $group: {
          _id: '$_id.kategori',
          kategori: { $first: '$_id.kategori' },
          subs: {
            $push: {
              sub_kategori: '$_id.sub_kategori',
              name: '$_id.sub_kategori',
              total: '$total_sub_kategori',
            },
          },
          total: { $sum: '$total_sub_kategori' },
          total_kategori: { $sum: '$total_sub_kategori' },
        },
      },
      { $project: { _id: 0, kategori: 1, total: 1, total_kategori: 1, subs: 1 } },
      { $sort: { kategori: 1 } },
    ]);

    const pertahun = await TtSummaryV2.aggregate([
      {
        $match: {
          period_type: 'MONTHLY',
          tahun_fiskal: buildSummaryYearMatch(tahun),
          kategori: { $in: ['PENDAPATAN', 'PEMBELIAN', 'BIAYA'] },
        },
      },
      {
        $group: {
          _id: { kategori: '$kategori', bulan: monthLabelExpression() },
          total: { $sum: '$total_nilai' },
        },
      },
      { $sort: { '_id.bulan': 1 } },
      {
        $group: {
          _id: '$_id.kategori',
          kategori: { $first: '$_id.kategori' },
          data_bulanan: { $push: { bulan: '$_id.bulan', total: '$total' } },
          total_tahunan: { $sum: '$total' },
        },
      },
      { $project: { _id: 0, kategori: 1, data_bulanan: 1, total_tahunan: 1 } },
      { $sort: { kategori: 1 } },
    ]);

    const biayaBiaya = await TtSummaryV2.aggregate([
      {
        $match: {
          ...summaryBaseMatch,
          kategori: 'BIAYA',
        },
      },
      {
        $group: {
          _id: { bulan: monthLabelExpression(), sub_kategori: '$sub_kategori' },
          total: { $sum: '$total_nilai' },
        },
      },
      {
        $group: {
          _id: '$_id.bulan',
          kategori: { $first: '$_id.bulan' },
          subs: { $push: { name: '$_id.sub_kategori', sub_kategori: '$_id.sub_kategori', total: '$total' } },
        },
      },
      { $project: { _id: 0, kategori: 1, subs: 1 } },
      { $sort: { kategori: 1 } },
    ]);

    return res.json({
      success: true,
      source: 'tt_summary_v2',
      tahun,
      bulan: filterBulan || null,
      rekap,
      data: rekap,
      pertahun,
      biayaBiaya,
      biaya_biaya: biayaBiaya,
      asetDanGaji: [],
      asetDanGajiTahunan: [],
      implementasiMarketingLainnyaTahunan: [],
      biayaBiayaTahunan: biayaBiaya,
      grossMarginTahunan: [],
    });
  } catch (error) {
    console.error('Error in rekapAggregate:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const pendapatanHarian = async (req: Request, res: Response) => {
  try {
    const tahun = String(req.query.tahun || new Date().getFullYear());
    const bulan = req.query.bulan ? String(req.query.bulan).toUpperCase() : '';

    const result = await TtSummaryV2.aggregate([
      {
        $match: {
          period_type: 'DAILY',
          tahun_fiskal: buildSummaryYearMatch(tahun),
          kategori: 'PENDAPATAN',
          ...buildSummaryMonthFilter(tahun, bulan),
        },
      },
      {
        $group: {
          _id: {
            tanggal: { $dateToString: { format: '%Y-%m-%d', date: '$period_start' } },
            sub_kategori: '$sub_kategori',
          },
          total: { $sum: '$total_nilai' },
        },
      },
      {
        $project: {
          tanggal: '$_id.tanggal',
          sub_kategori: '$_id.sub_kategori',
          total: 1,
          _id: 0,
        },
      },
      { $sort: { tanggal: 1, sub_kategori: 1 } },
    ]);

    return res.json(result);
  } catch (error) {
    console.error('Error in pendapatanHarian:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
