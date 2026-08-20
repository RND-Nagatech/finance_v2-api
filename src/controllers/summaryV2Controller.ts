import mongoose from 'mongoose';
import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { rebuildAllSummaryV2, reconcileSummaryV2 } from '../services/summaryV2Service';

export async function rebuildSummaryV2(req: AuthRequest, res: Response) {
  const userRole = String(req.user?.role || '').toLowerCase();
  if (userRole !== 'superuser') {
    return res.status(403).json({ message: 'Hanya superuser yang bisa rebuild summary.' });
  }

  const session = await mongoose.startSession();
  try {
    let result: Awaited<ReturnType<typeof rebuildAllSummaryV2>> | null = null;
    await session.withTransaction(async () => {
      result = await rebuildAllSummaryV2(session);
    });

    return res.json({
      success: true,
      message: 'tt_summary_v2 berhasil direbuild dari tt_finance_details.',
      data: result,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || 'Gagal rebuild tt_summary_v2.',
    });
  } finally {
    session.endSession();
  }
}

export async function getSummaryV2Reconciliation(req: AuthRequest, res: Response) {
  const userRole = String(req.user?.role || '').toLowerCase();
  if (userRole !== 'superuser') {
    return res.status(403).json({ message: 'Hanya superuser yang bisa menjalankan reconciliation.' });
  }

  try {
    const result = await reconcileSummaryV2({
      includeMatches: req.query.include_matches === 'true',
      limit: Number(req.query.limit || 500),
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || 'Gagal menjalankan reconciliation.',
    });
  }
}
