import { Request, Response } from 'express';
import FiscalConfig from '../models/FiscalConfig';
import { fiscalMonthsForYear } from '../utils/fiscal';
import TtFinanceDetail from '../models/TtFinanceDetail';
import TtSummaryV2 from '../models/TtSummaryV2';

// GET /fiscal/years
export const getFiscalYears = async (req: Request, res: Response) => {
  try {
    const tahunDetail = await TtFinanceDetail.distinct('tahun_fiskal');
    const tahunSummary = await TtSummaryV2.distinct('tahun_fiskal');
    const cfg = await FiscalConfig.findOne({ key: 'fiscal' }).lean();
    const closedYears = (cfg?.closed_years || []).map((item: any) => item.year);
    const tahunList = Array.from(new Set([...tahunDetail, ...tahunSummary, ...closedYears, cfg?.active_year]))
      .map(t => parseInt(t)).filter(t => !isNaN(t)).sort((a, b) => b - a);
    res.json({ success: true, years: tahunList });
  } catch (error) {
    console.error('❌ Error in getFiscalYears:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /fiscal/months?tahun=xxxx
export const getFiscalMonths = async (req: Request, res: Response) => {
  try {
    const tahun = Number(req.query.tahun) || new Date().getFullYear();
    const months = fiscalMonthsForYear(tahun);
    res.json({ success: true, months });
  } catch (error) {
    console.error('❌ Error in getFiscalMonths:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /fiscal/close
export const closeFiscalYear = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !['superuser', 'corsec'].includes(String(user.role || '').toLowerCase())) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const fiscalYear = Number(req.body?.fiscalYear);
    if (!fiscalYear || Number.isNaN(fiscalYear)) return res.status(400).json({ message: 'Fiscal year required' });

    const detailCount = await TtFinanceDetail.countDocuments({ tahun_fiskal: String(fiscalYear) });
    const summaryCount = await TtSummaryV2.countDocuments({ tahun_fiskal: { $in: [fiscalYear, String(fiscalYear)] } });
    if (detailCount <= 0 && summaryCount <= 0) {
      return res.status(404).json({ message: `Tidak ada data finance untuk tahun fiskal ${fiscalYear}` });
    }

    const existing = await FiscalConfig.findOne({
      key: 'fiscal',
      'closed_years.year': fiscalYear,
    }).lean();
    if (existing) {
      return res.status(409).json({ message: `Tahun fiskal ${fiscalYear} sudah ditutup.` });
    }

    const currentCfg = await FiscalConfig.findOne({ key: 'fiscal' }).lean();
    const nextYear = Math.max(Number(currentCfg?.active_year || fiscalYear), fiscalYear + 1);
    const closedBy = String(user?.username || user?.name || user?.email || user?._id || 'SYSTEM');
    await FiscalConfig.findOneAndUpdate(
      { key: 'fiscal' },
      {
        $set: { active_year: nextYear },
        $push: {
          closed_years: {
            year: fiscalYear,
            closed_at: new Date(),
            closed_by: closedBy,
          },
        },
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: `Tahun fiskal ${fiscalYear} berhasil dikunci.`,
      lockedYear: fiscalYear,
      detailCount,
      summaryCount,
      nextActive: nextYear,
    });
  } catch (error) {
    console.error('❌ Error in closeFiscalYear:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /fiscal/active
export const getActiveFiscalYear = async (req: Request, res: Response) => {
  try {
    const cfg = await FiscalConfig.findOne({ key: 'fiscal' }).lean();
    if (cfg && cfg.active_year) {
      return res.json({ success: true, activeYear: cfg.active_year });
    }
    const tahunDetail = await TtFinanceDetail.distinct('tahun_fiskal');
    const tahunSummary = await TtSummaryV2.distinct('tahun_fiskal');
    const tahunList = Array.from(new Set([...tahunDetail, ...tahunSummary]))
      .map(t => parseInt(t)).filter(t => !isNaN(t)).sort((a, b) => b - a);
    const inferred = tahunList.length ? Math.max(...tahunList) : new Date().getFullYear();
    res.json({ success: true, activeYear: inferred });
  } catch (error) {
    console.error('❌ Error in getActiveFiscalYear:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
